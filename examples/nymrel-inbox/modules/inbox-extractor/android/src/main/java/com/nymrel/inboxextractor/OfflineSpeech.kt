package com.nymrel.inboxextractor

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** No network path exists: the model is a verified, build-bundled asset. */
internal class OfflineSpeech(private val context: Context) : AutoCloseable {
  companion object {
    const val ASSET_NAME = "inbox-speech-model.zip"
    const val MODEL_NAME = "vosk-model-small-en-us-0.15"
    const val MODEL_SHA = "30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498"
    private const val MAX_EXPANDED = 100L * 1024 * 1024
    fun bundled(context: Context): Boolean = try { context.assets.open(ASSET_NAME).use { it.read() >= 0 } } catch (_: Exception) { false }
  }
  private var model: Model? = null

  private fun getModel(): Model {
    model?.let { return it }
    val digest = MessageDigest.getInstance("SHA-256")
    context.assets.open(ASSET_NAME).use { input ->
      val buffer = ByteArray(64 * 1024); var bytes = 0L
      while (true) { val read = input.read(buffer); if (read < 0) break; bytes += read
        require(bytes <= 80L * 1024 * 1024) { "The bundled speech model exceeds its size limit." }; digest.update(buffer, 0, read) }
    }
    val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    require(hash == MODEL_SHA) { "The bundled speech model failed its integrity check. Reinstall a verified build; the audio original has been preserved." }
    val target = File(context.noBackupFilesDir, "inbox-speech-$MODEL_SHA")
    val marker = File(target, ".verified-sha256")
    if (!target.isDirectory || !marker.isFile || marker.readText() != MODEL_SHA) {
      val staging = File(context.noBackupFilesDir, "inbox-speech-staging")
      if (staging.exists()) staging.deleteRecursively()
      require(staging.mkdirs()) { "Could not prepare private speech-model storage." }
      try {
        var expanded = 0L; var count = 0
        ZipInputStream(context.assets.open(ASSET_NAME)).use { zip ->
          while (true) {
            val entry = zip.nextEntry ?: break; count++
            require(count <= 128 && entry.name.startsWith("$MODEL_NAME/") && !entry.name.contains('\\')) { "The bundled speech ZIP contains an unexpected entry." }
            val relative = entry.name.removePrefix("$MODEL_NAME/")
            if (relative.isEmpty()) { zip.closeEntry(); continue }
            val destination = File(staging, relative).canonicalFile
            require(destination.path.startsWith(staging.canonicalPath + File.separator)) { "The bundled speech ZIP contains an unsafe path." }
            if (entry.isDirectory) destination.mkdirs() else {
              require(destination.parentFile?.isDirectory == true || destination.parentFile?.mkdirs() == true) { "Could not create speech-model directories." }
              FileOutputStream(destination).use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) { val read = zip.read(buffer); if (read < 0) break; expanded += read
                  require(expanded <= MAX_EXPANDED) { "The bundled speech ZIP exceeds its unpacked-size limit." }; output.write(buffer, 0, read) }
              }
            }
            zip.closeEntry()
          }
        }
        require(File(staging, "am/final.mdl").isFile && File(staging, "conf/model.conf").isFile) { "The speech model is incomplete." }
        File(staging, ".verified-sha256").writeText(MODEL_SHA)
        if (target.exists()) require(target.deleteRecursively()) { "Could not replace an incomplete speech model." }
        require(staging.renameTo(target)) { "Could not commit the private speech model." }
      } catch (error: Exception) { staging.deleteRecursively(); throw error }
    }
    return Model(target.absolutePath).also { model = it }
  }

  fun transcribe(file: File, locale: String): Map<String, Any> {
    require(locale.equals("en-US", true) || locale.equals("en", true)) { "The bundled speech model currently supports US English only. The original can be saved with a manual transcript." }
    require(bundled(context)) { "This build does not include the offline speech model. Rebuild with the pinned model asset; no download or cloud fallback is performed by the app." }
    val segments = mutableListOf<Map<String, Any>>()
    var truncated = false
    fun collect(raw: String) {
      val result = JSONObject(raw)
      val words = result.optJSONArray("result")
      if (words != null) {
        for (index in 0 until words.length()) {
          if (segments.size >= 1000) { truncated = true; break }
          val word = words.getJSONObject(index); val text = word.optString("word").trim()
          if (text.isBlank()) continue
          val start = word.optDouble("start", Double.NaN); val end = word.optDouble("end", Double.NaN)
          require(start.isFinite() && end.isFinite() && start >= 0 && end >= start && end <= 125) { "The offline recognizer returned invalid timing data." }
          segments.add(mapOf("text" to text.take(500), "startMs" to (start * 1000).roundToInt(), "endMs" to (end * 1000).roundToInt()))
        }
      } else {
        val text = result.optString("text").trim()
        if (text.isNotEmpty() && segments.size < 1000) segments.add(mapOf("text" to text.take(10_000)))
      }
    }
    Recognizer(getModel(), 16000f).use { recognizer ->
      recognizer.setWords(true)
      val pcm = ByteArray(8192); var used = 0
      fun flush() { if (used > 0) { if (recognizer.acceptWaveForm(pcm, used)) collect(recognizer.result); used = 0 } }
      val resampler = MonoResampler { sample ->
        pcm[used++] = (sample.toInt() and 255).toByte(); pcm[used++] = ((sample.toInt() shr 8) and 255).toByte()
        if (used == pcm.size) flush()
      }
      decode(file, resampler)
      flush(); collect(recognizer.finalResult)
    }
    require(segments.isNotEmpty()) { "No speech was recognized. The original audio is preserved and a manual transcript can be added." }
    return mapOf("segments" to segments, "truncated" to truncated)
  }

  /** Decode supported local codecs; reject unexpected PCM formats rather than guess. */
  private fun decode(file: File, resampler: MonoResampler) {
    val extractor = MediaExtractor(); var codec: MediaCodec? = null
    try {
      extractor.setDataSource(file.absolutePath)
      val track = (0 until extractor.trackCount).firstOrNull { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
        ?: error("The file contains no supported audio track.")
      val format = extractor.getTrackFormat(track)
      if (format.containsKey(MediaFormat.KEY_DURATION)) require(format.getLong(MediaFormat.KEY_DURATION) in 1..120_000_000L) { "On-device transcription accepts audio up to 2 minutes long." }
      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      require(rate in 8000..48000 && channels in 1..2) { "Use a mono/stereo audio file sampled between 8 and 48 kHz." }
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
      extractor.selectTrack(track)
      codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec.configure(format, null, null, 0); codec.start()
      val info = MediaCodec.BufferInfo()
      var inputEnded = false; var outputEnded = false; var decodedBytes = 0L; var sourceFrames = 0L
      val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(180)
      while (!outputEnded) {
        require(!Thread.currentThread().isInterrupted && System.nanoTime() < deadline) { "On-device transcription timed out. The original audio is preserved." }
        if (!inputEnded) {
          val inputIndex = codec.dequeueInputBuffer(10_000)
          if (inputIndex >= 0) {
            val input = codec.getInputBuffer(inputIndex) ?: error("Audio decoder input is unavailable.")
            val size = extractor.readSampleData(input, 0)
            if (size < 0) { codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputEnded = true }
            else { codec.queueInputBuffer(inputIndex, 0, size, max(0L, extractor.sampleTime), 0); extractor.advance() }
          }
        }
        when (val outputIndex = codec.dequeueOutputBuffer(info, 10_000)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val decoded = codec.outputFormat
            val newRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val newChannels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            val encoding = if (decoded.containsKey(MediaFormat.KEY_PCM_ENCODING)) decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
            require(encoding == AudioFormat.ENCODING_PCM_16BIT && newRate in 8000..48000 && newChannels in 1..2) { "The audio decoder returned an unsupported PCM format." }
            require(sourceFrames == 0L || newRate == rate && newChannels == channels) { "Audio format changes within one file are unsupported." }
            rate = newRate; channels = newChannels
          }
          else -> if (outputIndex >= 0) {
            try {
              if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                val output = codec.getOutputBuffer(outputIndex) ?: error("Audio decoder output is unavailable.")
                require(info.offset >= 0 && info.size >= 0 && info.offset.toLong() + info.size <= output.capacity()) { "The audio decoder returned an invalid buffer." }
                decodedBytes += info.size
                require(decodedBytes <= 32L * 1024 * 1024 && info.size % (channels * 2) == 0) { "Decoded audio exceeds the memory limit or has an incomplete PCM frame." }
                output.position(info.offset); output.limit(info.offset + info.size)
                while (output.remaining() >= channels * 2) {
                  var sum = 0
                  repeat(channels) { val low = output.get().toInt() and 255; val high = output.get().toInt(); sum += (high shl 8) or low }
                  sourceFrames++
                  // Permit one second of codec priming/padding beyond declared 120s.
                  require(sourceFrames <= rate.toLong() * 121) { "On-device transcription accepts audio up to 2 minutes long." }
                  resampler.accept((sum / channels).toShort(), rate)
                }
              }
              outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            } finally { codec.releaseOutputBuffer(outputIndex, false) }
          }
        }
      }
    } finally {
      try { codec?.stop() } catch (_: Exception) { }
      codec?.release(); extractor.release()
    }
  }

  override fun close() { model?.close(); model = null }
}
