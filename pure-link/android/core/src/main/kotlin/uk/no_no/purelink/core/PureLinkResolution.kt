package uk.no_no.purelink.core

/** UI-neutral result state for the manual resolver and incoming shared/selected text. */
sealed interface PureLinkResolution {
  data object Empty : PureLinkResolution
  data class Single(val candidate: PureLinkCandidate) : PureLinkResolution
  data class Multiple(val candidates: List<PureLinkCandidate>) : PureLinkResolution
}

object PureLinkCandidateChooser {
  fun resolveManual(text: CharSequence): PureLinkResolution = resolve(text, allowBareSlug = true)

  fun resolveIncoming(text: CharSequence): PureLinkResolution = resolve(text, allowBareSlug = false)

  private fun resolve(text: CharSequence, allowBareSlug: Boolean): PureLinkResolution {
    val candidates = PureLinkParser.parse(text, allowBareSlug)
    return when (candidates.size) {
      0 -> PureLinkResolution.Empty
      1 -> PureLinkResolution.Single(candidates.single())
      else -> PureLinkResolution.Multiple(candidates)
    }
  }
}
