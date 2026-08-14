package uk.no_no.purelink.core

/** Builds the only URLs this client can launch; it never accepts an arbitrary host or scheme. */
object PureLinkResolver {
  private const val origin = "https://no-no.uk"

  fun urlFor(candidate: PureLinkCandidate, preview: Boolean = false): String =
    urlFor(candidate.slug, preview)

  fun urlFor(slug: String, preview: Boolean = false): String {
    require(PureLinkParser.isValidSlug(slug)) { "Invalid PureLink slug" }
    return "$origin/$slug${if (preview) "+" else ""}"
  }
}
