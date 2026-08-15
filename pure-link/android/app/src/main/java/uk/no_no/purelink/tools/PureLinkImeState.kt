package uk.no_no.purelink.tools

/**
 * Explicit local state for the resolver keyboard. Keys never target the host editor: the active
 * target is either the manual slug field or the optional share-description field.
 */
enum class PureLinkImeInputTarget { MANUAL, DESCRIPTION }

class PureLinkImeInputState {
  var target: PureLinkImeInputTarget = PureLinkImeInputTarget.MANUAL
    private set

  fun focusManual() { target = PureLinkImeInputTarget.MANUAL }

  fun focusDescription() { target = PureLinkImeInputTarget.DESCRIPTION }
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

  fun toolbarFits(widthDp: Int, iconCount: Int = 5): Boolean =
    iconCount * toolbarIconSizeDp + (iconCount - 1) * keyGapDp <= widthDp - horizontalPaddingDp * 2
}
