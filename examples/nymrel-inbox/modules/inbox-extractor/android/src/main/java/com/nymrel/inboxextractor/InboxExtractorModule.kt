package com.nymrel.inboxextractor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min

class InboxExtractorModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  private val destroyed = AtomicBoolean(false)
  private val lifecycleLock = Any()
  private var speech: OfflineSpeech? = null

  override fun definition() = ModuleDefinition {
    Name("InboxExtractor")
    Function("capabilities") {
      val context = appContext.reactContext
      val audio = context != null && OfflineSpeech.bundled(context)
      mapOf(
        "ocr" to true,
        "pdf" to true,
        "audio" to audio,
        "reason" to if (audio) "Offline audio transcription uses the bundled US English model for clips up to 2 minutes." else "This build is missing its bundled speech model. Audio originals can be saved with a manual transcript; the app never downloads a model or uses cloud transcription."
      )
    }
    AsyncFunction("extract") { uri: String, mimeType: String, locale: String, promise: Promise ->
      if (destroyed.get()) {
        promise.reject("ERR_INBOX_CLOSED", "The extractor is closed. Reopen the app to try again.", null)
      } else if (!busy.compareAndSet(false, true)) {
        promise.reject("ERR_INBOX_BUSY", "An extraction is already running. Try again after it finishes.", null)
      } else {
        executor.execute {
          try { promise.resolve(extractFile(uri, mimeType.lowercase(), locale)) }
          catch (error: Exception) { promise.reject("ERR_INBOX_EXTRACTION", error.message ?: "On-device extraction failed. The original can still be saved.", error) }
          finally { synchronized(lifecycleLock) { busy.set(false); if (destroyed.get()) { speech?.close(); speech = null } } }
        }
      }
    }
    AsyncFunction("getSharedItems") { emptyList<Map<String, Any>>() }
    AsyncFunction("acknowledgeShared") { id: String -> Unit }
    OnDestroy { synchronized(lifecycleLock) { destroyed.set(true); executor.shutdownNow(); if (!busy.get()) { speech?.close(); speech = null } } }
  }

  private fun privateFile(uri: String): File {
    val context = appContext.reactContext ?: error("The application context is unavailable.")
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file" && parsed.authority.isNullOrEmpty()) { "Extraction accepts a copied local file only." }
    val file = File(parsed.path ?: error("Invalid local file URI.")).canonicalFile
    val roots = listOf(context.filesDir, context.cacheDir, context.noBackupFilesDir).map { it.canonicalPath + File.separator }
    require(roots.any { file.path.startsWith(it) }) { "Copy the original into the app's private storage before extracting it." }
    require(file.isFile && file.length() in 1..(20L * 1024 * 1024)) { "Choose a nonempty file no larger than 20 MiB." }
    return file
  }

  private fun extractFile(uri: String, mime: String, locale: String): Map<String, Any> {
    val file = privateFile(uri)
    val context = appContext.reactContext ?: error("The application context is unavailable.")
    if (mime.startsWith("audio/")) {
      val engine = speech ?: OfflineSpeech(context).also { speech = it }
      return engine.transcribe(file, locale)
    }
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60)
    val segments = mutableListOf<Map<String, Any>>()
    var remaining = 200_000
    var truncated = false
    fun recognize(image: InputImage): String {
      val millis = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime())
      require(millis > 0) { "On-device extraction timed out. The original can still be saved." }
      return Tasks.await(recognizer.process(image), millis, TimeUnit.MILLISECONDS).text
    }
    fun append(text: String, page: Int? = null) {
      val clipped = text.take(remaining)
      if (clipped.isNotBlank()) {
        val segment = mutableMapOf<String, Any>("text" to clipped)
        if (page != null) segment["page"] = page
        segments.add(segment)
        remaining -= clipped.length
      }
      if (clipped.length < text.length || remaining <= 0) truncated = true
    }
    try {
      if (mime == "application/pdf") {
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
          PdfRenderer(descriptor).use { renderer ->
            truncated = renderer.pageCount > 20
            for (index in 0 until min(renderer.pageCount, 20)) {
              if (remaining <= 0 || System.nanoTime() >= deadline) { truncated = true; break }
              renderer.openPage(index).use { page ->
                val scale = min(1600.0 / max(page.width, page.height), 3.0)
                val width = max(1, (page.width * scale).toInt())
                val height = max(1, (page.height * scale).toInt())
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                try {
                  bitmap.eraseColor(Color.WHITE)
                  page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                  append(recognize(InputImage.fromBitmap(bitmap, 0)), index + 1)
                } finally { bitmap.recycle() }
              }
            }
          }
        }
      } else if (mime.startsWith("image/")) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 16_000_000L) { "This image is unreadable or exceeds the 16-megapixel extraction limit. Save the original and add a note, or import a smaller copy." }
        append(recognize(InputImage.fromFilePath(context, Uri.fromFile(file))))
      } else error("Only image, PDF, and supported audio files can be extracted.")
    } finally { recognizer.close() }
    require(segments.isNotEmpty()) { "No readable text was found. The original can still be saved, and you can add your own note." }
    return mapOf("segments" to segments, "truncated" to truncated)
  }
}
