package uk.no_no.purelink.tools

import uk.no_no.purelink.core.PureLinkDescriptionPaste

/** Explicit local targets for the resolver keyboard; none target the host editor. */
enum class PureLinkImeInputTarget { MANUAL, DESCRIPTION, CANDIDATES }

class PureLinkImeInputState {
  var target: PureLinkImeInputTarget = PureLinkImeInputTarget.MANUAL
    private set

  fun focusManual() { target = PureLinkImeInputTarget.MANUAL }
  fun focusDescription() { target = PureLinkImeInputTarget.DESCRIPTION }
  fun focusCandidates() { target = PureLinkImeInputTarget.CANDIDATES }

}

enum class PureLinkImeMode { MANUAL, CANDIDATES }

enum class PureLinkOwnedActivity { VERIFICATION }

/**
 * Tracks only a PureLink-owned transient screen and its originating gate operation. This lets the
 * service distinguish its own editor/verification transition from a genuine IME teardown.
 */
class PureLinkTransientActivityState {
  private var current: Pair<PureLinkOwnedActivity, Long>? = null

  fun begin(kind: PureLinkOwnedActivity, operation: Long) {
    current = kind to operation
  }

  fun ownsInputViewFinish(): Boolean = current != null

  fun complete(kind: PureLinkOwnedActivity, operation: Long): Boolean {
    val matches = current == (kind to operation)
    if (matches) current = null
    return matches
  }

  fun clear() {
    current = null
  }
}

/** Local Description state for the PureLink-owned keyboard. */
class PureLinkDescriptionInput {
  var text: String = ""
    private set

  fun insert(value: CharSequence?) {
    text = PureLinkDescriptionPaste.insert(text, text.length, text.length, value)
  }

  fun backspace() {
    if (text.isNotEmpty()) text = text.substring(0, text.offsetByCodePoints(text.length, -1))
  }

  fun clear() {
    text = ""
  }
}

enum class PureLinkShiftMode { LOWERCASE, ONE_SHOT_SHIFT, CAPS_LOCK }

/** Small deterministic shift state machine; punctuation and actions never consume one-shot Shift. */
class PureLinkShiftState(private val doubleTapWindowMillis: Long = 350L) {
  var mode: PureLinkShiftMode = PureLinkShiftMode.LOWERCASE
    private set
  private var lastShiftTapMillis: Long? = null

  fun tapShift(nowMillis: Long): PureLinkShiftMode {
    mode = when {
      mode == PureLinkShiftMode.CAPS_LOCK -> PureLinkShiftMode.LOWERCASE
      lastShiftTapMillis != null && nowMillis - lastShiftTapMillis!! in 0..doubleTapWindowMillis -> PureLinkShiftMode.CAPS_LOCK
      else -> PureLinkShiftMode.ONE_SHOT_SHIFT
    }
    lastShiftTapMillis = if (mode == PureLinkShiftMode.ONE_SHOT_SHIFT) nowMillis else null
    return mode
  }

  fun displayed(value: String): String =
    if (mode == PureLinkShiftMode.LOWERCASE) value else value.uppercase()

  fun consumeCharacter(value: Char) {
    if (mode == PureLinkShiftMode.ONE_SHOT_SHIFT && value.isLetter()) {
      mode = PureLinkShiftMode.LOWERCASE
      lastShiftTapMillis = null
    }
  }

  fun reset() {
    mode = PureLinkShiftMode.LOWERCASE
    lastShiftTapMillis = null
  }
}

/**
 * Dimensions shared by the programmatic view and unit tests. The ten-key rows fit from 360dp
 * upward without horizontal scrolling; other rows have more room.
 */
object PureLinkImeLayout {
  const val narrowWidthDp = 360
  const val horizontalPaddingDp = 6
  const val keyGapDp = 2
  const val keyHeightDp = 42
  const val toolbarIconSizeDp = 42
  const val minimumCharacterKeyWidthDp = 30

  fun rowFits(widthDp: Int, keyCount: Int): Boolean {
    val usable = widthDp - horizontalPaddingDp * 2 - keyGapDp * (keyCount - 1)
    return usable / keyCount >= minimumCharacterKeyWidthDp
  }

  fun toolbarFits(widthDp: Int, iconCount: Int = 3): Boolean =
    iconCount * toolbarIconSizeDp + (iconCount - 1) * keyGapDp <= widthDp - horizontalPaddingDp * 2
}
