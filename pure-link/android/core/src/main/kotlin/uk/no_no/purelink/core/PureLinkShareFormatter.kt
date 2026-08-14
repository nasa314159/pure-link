package uk.no_no.purelink.core

/** Produces the only text that can leave the ephemeral IME session through Android sharing. */
object PureLinkShareFormatter {
  const val maxDescriptionCodePoints = 280

  fun normalizeDescription(value: CharSequence?): String {
    val trimmed = value?.toString()?.trim().orEmpty()
    if (trimmed.isEmpty()) return ""
    val end = if (trimmed.codePointCount(0, trimmed.length) <= maxDescriptionCodePoints) {
      trimmed.length
    } else {
      trimmed.offsetByCodePoints(0, maxDescriptionCodePoints)
    }
    return trimmed.substring(0, end)
  }

  fun formatSingle(row: PureLinkSelection, description: CharSequence? = null): String =
    listOfNotNull(
      normalizeDescription(description).ifBlank { null },
      row.candidate.label?.trim()?.ifBlank { null },
      PureLinkResolver.urlFor(row.candidate, row.preview),
    ).joinToString("\n\n")

  fun formatBundle(rows: List<PureLinkSelection>, description: CharSequence? = null): String {
    require(rows.size >= 2) { "A bundle requires at least two selected PureLinks." }
    val items = rows.map { row ->
      listOfNotNull(
        row.candidate.label?.trim()?.ifBlank { null },
        PureLinkResolver.urlFor(row.candidate, row.preview),
      ).joinToString("\n")
    }
    return listOfNotNull(normalizeDescription(description).ifBlank { null }, *items.toTypedArray())
      .joinToString("\n\n")
  }
}
