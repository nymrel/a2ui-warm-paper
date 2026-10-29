package com.nymrel.inboxextractor

import kotlin.math.roundToInt

/** Streaming linear interpolation avoids retaining a decoded audio file. */
internal class MonoResampler(private val emit: (Short) -> Unit) {
  private var index = -1L
  private var previous = 0.0
  private var next = 0.0
  fun accept(sample: Short, rate: Int) {
    require(rate in 8000..48000) { "Unsupported input sampling rate." }
    index++
    val current = sample.toDouble()
    val step = rate.toDouble() / 16000.0
    while (next <= index.toDouble()) {
      val value = if (index == 0L) current else previous + (current - previous) * (next - (index - 1).toDouble())
      emit(value.roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
      next += step
    }
    previous = current
  }
}
