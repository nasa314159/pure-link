package uk.no_no.purelink.tools

/** The deliberately small key set offered by the auxiliary resolver keyboard. */
object PureLinkImeKeys {
  val letterRows = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
  const val symbols = "0123456789_-"

  fun displayed(row: String, shifted: Boolean): String = if (shifted) row.uppercase() else row
}
