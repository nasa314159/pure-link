package uk.no_no.purelink.core

/**
 * A tiny validity gate for UI work that can outlive an InputMethodService view. It retains no
 * content; it only tells an async result whether its originating ephemeral session is still live.
 */
class PureLinkSessionGate {
  private var generation = 0L
  private var active = false

  fun activate() {
    if (!active) {
      active = true
      generation += 1
    }
  }

  fun isActive(): Boolean = active

  fun beginNewSessionState() {
    if (active) generation += 1
  }

  fun beginOperation(): Long? = if (active) generation else null

  fun accepts(operation: Long): Boolean = active && generation == operation

  fun finish() {
    active = false
    generation += 1
  }
}
