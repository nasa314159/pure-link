package uk.no_no.purelink.tools

import android.text.InputFilter
import android.text.Spanned

/** Limits user-visible Unicode code points without splitting a surrogate pair. */
class CodePointLengthFilter(private val maximum: Int) : InputFilter {
  override fun filter(source: CharSequence, start: Int, end: Int, dest: Spanned, dstart: Int, dend: Int): CharSequence? {
    val retained = dest.substring(0, dstart) + dest.substring(dend)
    val available = maximum - retained.codePointCount(0, retained.length)
    if (available <= 0) return ""
    val incoming = source.subSequence(start, end).toString()
    if (incoming.codePointCount(0, incoming.length) <= available) return null
    return incoming.substring(0, incoming.offsetByCodePoints(0, available))
  }
}
