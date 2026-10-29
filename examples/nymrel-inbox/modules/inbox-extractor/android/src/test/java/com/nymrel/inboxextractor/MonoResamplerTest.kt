package com.nymrel.inboxextractor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MonoResamplerTest {
  @Test fun preserves16kSamplesExactly() {
    val output = mutableListOf<Short>()
    val resampler = MonoResampler { output.add(it) }
    val input = listOf<Short>(0, 1000, -1000, Short.MIN_VALUE, Short.MAX_VALUE)
    input.forEach { resampler.accept(it, 16000) }
    assertEquals(input, output)
  }
  @Test fun interpolates8kSamplesWithoutExtrapolatingPastInput() {
    val output = mutableListOf<Short>()
    val resampler = MonoResampler { output.add(it) }
    listOf<Short>(0, 1000, 2000).forEach { resampler.accept(it, 8000) }
    assertEquals(listOf<Short>(0, 500, 1000, 1500, 2000), output)
  }
  @Test fun downsamples48kTo16k() {
    var count = 0
    val resampler = MonoResampler { count++ }
    repeat(48000) { resampler.accept(100, 48000) }
    assertEquals(16000, count)
  }
  @Test fun rejectsInvalidRates() {
    val resampler = MonoResampler { }
    assertThrows(IllegalArgumentException::class.java) { resampler.accept(0, 0) }
  }
}
