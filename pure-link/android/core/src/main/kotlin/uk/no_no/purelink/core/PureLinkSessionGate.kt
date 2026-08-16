package uk.no_no.purelink.core

/**
 * A tiny validity gate for UI work that can outlive an InputMethodService view. It retains no
 * content; it only tells an async result whether its originating ephemeral session is still live.
 */
class PureLinkSessionGate(private val qaLog: (String) -> Unit = {}) {
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
    // Temporary QA instrumentation.
    qaLog("beginNewSessionState entry active=$active generation=$generation")
    if (active) generation += 1
    qaLog("beginNewSessionState exit active=$active generation=$generation")
  }

  fun beginOperation(): Long? {
    // Temporary QA instrumentation.
    qaLog("beginOperation entry active=$active generation=$generation")
    val operation = if (active) generation else null
    qaLog(if (operation != null) "beginOperation succeeded operation=$operation active=$active generation=$generation" else "beginOperation rejected active=$active generation=$generation")
    return operation
  }

  fun accepts(operation: Long): Boolean {
    val accepted = active && generation == operation
    // Temporary QA instrumentation.
    qaLog("accepts operation=$operation result=$accepted active=$active generation=$generation")
    return accepted
  }

  fun finish() {
    // Temporary QA instrumentation.
    qaLog("finish entry active=$active generation=$generation")
    active = false
    generation += 1
    qaLog("finish exit active=$active generation=$generation")
  }
}
