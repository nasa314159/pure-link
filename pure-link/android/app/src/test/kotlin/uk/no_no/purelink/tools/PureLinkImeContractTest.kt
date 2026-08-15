package uk.no_no.purelink.tools

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import uk.no_no.purelink.core.PureLinkParser

class PureLinkImeContractTest {
  @Test fun keyboard_offers_exactly_the_canonical_slug_characters_in_standard_rows() {
    assertEquals("1234567890", PureLinkImeKeys.digits)
    assertEquals(listOf("qwertyuiop", "asdfghjkl", "zxcvbnm"), PureLinkImeKeys.letterRows)
    assertEquals("_-", PureLinkImeKeys.punctuation)
    assertEquals(
      ("abcdefghijklmnopqrstuvwxyz0123456789_-".toSet()),
      PureLinkImeKeys.manuallyTypableCharacters,
    )
    assertTrue(PureLinkImeKeys.manuallyTypableCharacters.all { PureLinkParser.isValidSlug(it.toString()) })
    assertFalse(PureLinkImeKeys.manuallyTypableCharacters.contains('/'))
    assertFalse(PureLinkImeKeys.manuallyTypableCharacters.contains(':'))
  }

  @Test fun shift_has_lowercase_one_shot_and_caps_lock_without_consuming_symbols() {
    val state = PureLinkShiftState(doubleTapWindowMillis = 350)
    assertEquals(PureLinkShiftMode.ONE_SHOT_SHIFT, state.tapShift(100))
    assertEquals("ABC", state.displayed("abc"))
    state.consumeCharacter('7')
    state.consumeCharacter('_')
    assertEquals(PureLinkShiftMode.ONE_SHOT_SHIFT, state.mode)
    state.consumeCharacter('a')
    assertEquals(PureLinkShiftMode.LOWERCASE, state.mode)
    assertEquals(PureLinkShiftMode.ONE_SHOT_SHIFT, state.tapShift(1_000))
    assertEquals(PureLinkShiftMode.CAPS_LOCK, state.tapShift(1_200))
    state.consumeCharacter('z')
    assertEquals(PureLinkShiftMode.CAPS_LOCK, state.mode)
    assertEquals(PureLinkShiftMode.LOWERCASE, state.tapShift(1_700))
  }

  @Test fun manual_is_the_default_internal_target_and_narrow_layout_never_overflows() {
    val state = PureLinkImeInputState()
    assertEquals(PureLinkImeInputTarget.MANUAL, state.target)
    state.focusDescription()
    assertEquals(PureLinkImeInputTarget.DESCRIPTION, state.target)
    state.focusManual()
    assertEquals(PureLinkImeInputTarget.MANUAL, state.target)
    listOf(360, 412, 480).forEach { width ->
      assertTrue("digits fit at ${width}dp", PureLinkImeLayout.rowFits(width, 10))
      assertTrue("toolbar fits at ${width}dp", PureLinkImeLayout.toolbarFits(width))
    }
  }

  @Test fun manifest_registers_the_bound_input_method_service() {
    val manifest = File("src/main/AndroidManifest.xml").readText()
    assertTrue(manifest.contains("PureLinkInputMethodService"))
    assertTrue(manifest.contains("android.permission.BIND_INPUT_METHOD"))
    assertTrue(manifest.contains("android.view.InputMethod"))
    assertTrue(manifest.contains("@xml/method"))
    assertTrue(manifest.contains("NativeVerificationActivity"))
    assertTrue(manifest.contains("android.permission.INTERNET"))
  }

  @Test fun verification_policy_allows_only_purelink_and_turnstile_and_validates_the_callback() {
    assertEquals("https://no-no.uk/native/verify?locale=zh-Hant", NativeVerificationPolicy.challengeUrl("zh-Hant"))
    assertTrue(NativeVerificationPolicy.isAllowedWebUrl("https://no-no.uk/native/verify?locale=en"))
    assertTrue(NativeVerificationPolicy.isAllowedWebUrl("https://no-no.uk/api/native/challenge/complete"))
    assertTrue(NativeVerificationPolicy.isAllowedWebUrl("https://challenges.cloudflare.com/turnstile/v0/api.js"))
    assertTrue(!NativeVerificationPolicy.isAllowedWebUrl("https://example.com/native/verify"))
    assertTrue(!NativeVerificationPolicy.isAllowedWebUrl("http://no-no.uk/native/verify"))
    val token = "A".repeat(43)
    assertEquals(token, NativeVerificationPolicy.callbackToken("purelink-native://verified?token=$token"))
    assertEquals(null, NativeVerificationPolicy.callbackToken("purelink-native://other?token=$token"))
    assertEquals(null, NativeVerificationPolicy.callbackToken("purelink-native://verified?token=short"))
    assertTrue(NativeVerificationPolicy.isCancellationCallback("purelink-native://cancel"))
    assertTrue(!NativeVerificationPolicy.isCancellationCallback("purelink-native://cancel?token=$token"))
  }

  @Test fun ime_uses_internal_fields_constrained_card_client_and_non_scrolling_key_rows() {
    val ime = File("src/main/java/uk/no_no/purelink/tools/PureLinkInputMethodService.kt").readText()
    val client = File("src/main/java/uk/no_no/purelink/tools/PureLinkCardClient.kt").readText()
    assertTrue(!ime.contains("HorizontalScrollView"))
    assertTrue(ime.contains("view.post { activateManualMode() }"))
    assertTrue(ime.contains("PureLinkImeInputTarget.MANUAL -> insert(manualSlug, value)"))
    assertTrue(ime.contains("PureLinkImeInputTarget.DESCRIPTION -> insert(description, value)"))
    assertFalse(ime.contains("currentInputConnection"))
    assertTrue(ime.contains("addCharacterRow(PureLinkImeKeys.digits)"))
    assertTrue(ime.contains("addShiftRow()"))
    assertTrue(ime.contains("addBottomRow()"))
    assertTrue(ime.contains("selections.togglePreview(index)"))
    assertTrue(!ime.contains("selections.setPreview(index, true)"))
    assertTrue(!ime.contains("selections.setPreview(index, false)"))
    assertTrue(ime.contains("shareText(publicUrl)"))
    assertTrue(ime.contains("sessionGate.accepts(operation)"))
    assertTrue(ime.contains("showTransientStatus(R.string.share_chooser_opened)"))
    assertTrue(ime.contains("https://no-no.uk/\${responseLocale()}/account"))
    assertTrue(client.contains("/api/native/cards"))
    assertTrue(client.contains("nativeCreateToken"))
    assertTrue(!client.contains("contentType\", \"card"))
  }
}
