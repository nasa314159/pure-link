package uk.no_no.purelink.core

/**
 * Parses deliberate, human-written PureLink markers locally. It deliberately does not scan every
 * alphanumeric word: a marker is required unless the caller explicitly enables a bare slug for a
 * manual-entry field.
 */
object PureLinkParser {
  private const val maxSlugLength = 30
  private val slugPattern = Regex("^[A-Za-z0-9_-]{1,$maxSlugLength}$")
  private val reservedSlugs = setOf(
    "", "api", "admin", "account", "auth", "manage", "privacy", "terms", "report",
    "transparency", "ai-credits", "refund-policy", "robots.txt", "sitemap.xml", "favicon.ico",
    "en", "zh-hant",
  )
  private val markerPattern = Regex(
    """(?:(?<![\p{L}\p{N}_])(?:pure[\s\u3000]*link|link)(?![\p{L}\p{N}_])[\s\u3000]*[:：][\s\u3000]*|🔗[\s\u3000]*(?::|：)?[\s\u3000]*)(?![A-Za-z][A-Za-z0-9+.-]*:)([A-Za-z0-9_-]{1,30})(?![A-Za-z0-9_\-/%+\\])""",
    setOf(RegexOption.IGNORE_CASE),
  )

  fun parse(text: CharSequence?, allowBareSlug: Boolean = false): List<PureLinkCandidate> {
    val input = text?.toString() ?: return emptyList()
    if (allowBareSlug) {
      val bare = input.trim()
      if (isValidSlug(bare)) {
        val start = input.indexOf(bare)
        return listOf(PureLinkCandidate(bare, null, start until start + bare.length))
      }
    }
    return markerPattern.findAll(input).mapNotNull { match ->
      val slug = match.groups[1]?.value ?: return@mapNotNull null
      if (!isValidSlug(slug)) return@mapNotNull null
      PureLinkCandidate(slug, labelBefore(input, match.range.first), match.range)
    }.toList()
  }

  fun isValidSlug(slug: String): Boolean = slugPattern.matches(slug) && slug.lowercase() !in reservedSlugs

  private fun labelBefore(input: String, markerStart: Int): String? {
    val lineStart = input.lastIndexOf('\n', markerStart - 1).let { if (it < 0) 0 else it + 1 }
    val label = input.substring(lineStart, markerStart)
      .replace(Regex("[\\r\\n\\t]+"), " ")
      .trim()
      .trim { it in "-—–:：|•🔗" }
      .trim()
      .takeLast(24)
      .trim()
    return label.takeIf { it.isNotEmpty() }
  }
}
