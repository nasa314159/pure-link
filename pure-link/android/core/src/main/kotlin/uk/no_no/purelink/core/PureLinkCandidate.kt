package uk.no_no.purelink.core

/** A locally parsed identifier. [label] is presentation-only context from the input text. */
data class PureLinkCandidate(
  val slug: String,
  val label: String? = null,
  val sourceRange: IntRange,
  /** A complete shared URL ending in + is initially offered as a preview. */
  val preferredPreview: Boolean = false,
)
