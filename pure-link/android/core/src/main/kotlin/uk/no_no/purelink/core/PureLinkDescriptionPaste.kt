package uk.no_no.purelink.core

/** Unicode-safe, local-only description insertion. It intentionally has no parser dependency. */
object PureLinkDescriptionPaste {
  fun insert(current: CharSequence?, selectionStart: Int, selectionEnd: Int, clipboardText: CharSequence?): String {
    val existing = current?.toString().orEmpty()
    val start = codePointBoundary(existing, selectionStart.coerceIn(0, existing.length))
    val end = codePointBoundary(existing, selectionEnd.coerceIn(start, existing.length))
    return truncate(existing.substring(0, start) + clipboardText?.toString().orEmpty() + existing.substring(end))
  }

  fun truncate(value: CharSequence?): String {
    val text = value?.toString().orEmpty()
    val limit = PureLinkShareFormatter.maxDescriptionCodePoints
    return if (text.codePointCount(0, text.length) <= limit) text
    else text.substring(0, text.offsetByCodePoints(0, limit))
  }

  private fun codePointBoundary(text: String, offset: Int): Int =
    if (offset in 1 until text.length && text[offset - 1].isHighSurrogate() && text[offset].isLowSurrogate()) offset - 1 else offset
}
