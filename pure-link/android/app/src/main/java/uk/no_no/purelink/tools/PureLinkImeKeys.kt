package uk.no_no.purelink.tools

/** The deliberately small key set offered by the auxiliary resolver keyboard. */
object PureLinkImeKeys {
  // These rows intentionally mirror the parser's ASCII custom-slug grammar: [A-Za-z0-9_-].
  // Every character key must remain visible at the 360dp layout policy width.
  const val digits = "1234567890"
  val letterRows = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
  const val punctuation = "_-"

  val manuallyTypableCharacters: Set<Char> = (digits + letterRows.joinToString("") + punctuation).toSet()

  fun displayed(row: String, shiftMode: PureLinkShiftMode): String =
    if (shiftMode == PureLinkShiftMode.LOWERCASE) row else row.uppercase()
}
