package uk.no_no.purelink.tools

/** The deliberately small key set offered by the auxiliary resolver keyboard. */
object PureLinkImeKeys {
  // Compact groups keep every character key visible even on narrow phone screens.
  val letterRows = listOf("qwertyu", "iopasdf", "ghjklz", "xcvbnm")
  val symbolRows = listOf("012345", "6789_-")

  fun displayed(row: String, shifted: Boolean): String = if (shifted) row.uppercase() else row
}
