package uk.no_no.purelink.core

/** Keeps clipboard parsing marker- and URL-only; callers should supply only the current text clip. */
object PureLinkClipboardParser {
  fun parseCurrentText(text: CharSequence?): PureLinkResolution =
    PureLinkCandidateChooser.resolveIncoming(text ?: "")
}
