package uk.no_no.purelink.tools

import uk.no_no.purelink.core.PureLinkShareFormatter

/**
 * Explicit local state for the resolver keyboard. Its slug keys never target the host editor.
 */
enum class PureLinkImeInputTarget { MANUAL }

class PureLinkImeInputState {
  var target: PureLinkImeInputTarget = PureLinkImeInputTarget.MANUAL
    private set

  fun focusManual() { target = PureLinkImeInputTarget.MANUAL }

}

enum class PureLinkImeMode { MANUAL, CANDIDATES }

enum class PureLinkOwnedActivity { DESCRIPTION_EDITOR, VERIFICATION }

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

/** Pure formatting helpers for the system-IME Description editor. */
object PureLinkDescriptionEditor {
  fun initialText(value: CharSequence?): String = PureLinkShareFormatter.normalizeDescription(value)

  fun done(value: CharSequence?): String = PureLinkShareFormatter.normalizeDescription(value)

  fun cancel(currentValue: CharSequence?): String = PureLinkShareFormatter.normalizeDescription(currentValue)

  fun codePointCount(value: CharSequence?): Int {
    val text = value?.toString().orEmpty()
    return text.codePointCount(0, text.length)
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
