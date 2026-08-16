package uk.no_no.purelink.tools

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import uk.no_no.purelink.core.PureLinkCandidate
import uk.no_no.purelink.core.PureLinkParser
import uk.no_no.purelink.core.PureLinkSelectionModel
import uk.no_no.purelink.core.PureLinkSessionGate

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

  @Test fun description_target_routes_local_keys_away_from_manual_slug() {
    val state = PureLinkImeInputState()
    assertEquals(PureLinkImeInputTarget.MANUAL, state.target)
    val manual = StringBuilder()
    val description = PureLinkDescriptionInput()
    state.focusDescription()
    if (state.target == PureLinkImeInputTarget.DESCRIPTION) description.insert("a") else manual.append("a")
    assertEquals("", manual.toString())
    assertEquals("a", description.text)
    description.backspace()
    assertEquals("", description.text)
    state.focusManual()
    if (state.target == PureLinkImeInputTarget.MANUAL) manual.append("b") else description.insert("b")
    assertEquals("b", manual.toString())
    assertEquals(PureLinkImeInputTarget.MANUAL, state.target)
  }

  @Test fun description_input_preserves_shift_caps_and_unicode_length() {
    val description = PureLinkDescriptionInput()
    val shift = PureLinkShiftState(doubleTapWindowMillis = 350)
    shift.tapShift(100)
    description.insert(shift.displayed("a"))
    shift.consumeCharacter('a')
    assertEquals("A", description.text)
    shift.tapShift(1_000)
    shift.tapShift(1_100)
    description.insert(shift.displayed("b"))
    shift.consumeCharacter('b')
    assertEquals("AB", description.text)
    description.clear()
    description.insert("😀".repeat(281))
    assertEquals(280, description.text.codePointCount(0, description.text.length))
  }

  @Test fun description_survives_candidate_changes_and_clears_with_session_state() {
    val model = PureLinkSelectionModel(
      listOf(
        PureLinkCandidate("A3cd8", sourceRange = 0..4),
        PureLinkCandidate("Q9xK2", sourceRange = 6..10),
      ),
    )
    val description = PureLinkDescriptionInput()
    description.insert("保留😀")
    model.toggleSelection(1)
    model.togglePreview(0)
    assertEquals("保留😀", description.text)
    description.clear()
    assertEquals("", description.text)
  }

  @Test fun manual_is_the_default_internal_target_and_narrow_layout_never_overflows() {
    val state = PureLinkImeInputState()
    assertEquals(PureLinkImeInputTarget.MANUAL, state.target)
    listOf(360, 412, 480).forEach { width ->
      assertTrue("digits fit at ${width}dp", PureLinkImeLayout.rowFits(width, 10))
      assertTrue("three-action toolbar fits at ${width}dp", PureLinkImeLayout.toolbarFits(width, 3))
    }
  }

  @Test fun owned_activities_preserve_active_operations_but_genuine_finish_invalidates_them() {
    val gate = PureLinkSessionGate()
    val transient = PureLinkTransientActivityState()
    gate.activate()
    val verificationOperation = gate.beginOperation()!!
    transient.begin(PureLinkOwnedActivity.VERIFICATION, verificationOperation)
    assertTrue(transient.ownsInputViewFinish())
    assertTrue(gate.accepts(verificationOperation))
    gate.beginNewSessionState()
    assertFalse(gate.accepts(verificationOperation))

    val genuineEnd = gate.beginOperation()!!
    gate.finish()
    assertFalse(gate.accepts(genuineEnd))
  }

  @Test fun manifest_registers_the_bound_input_method_service() {
    val manifest = File("src/main/AndroidManifest.xml").readText()
    assertTrue(manifest.contains("PureLinkInputMethodService"))
    assertTrue(manifest.contains("android.permission.BIND_INPUT_METHOD"))
    assertTrue(manifest.contains("android.view.InputMethod"))
    assertTrue(manifest.contains("@xml/method"))
    assertTrue(manifest.contains("NativeVerificationActivity"))
    assertFalse(manifest.contains("DescriptionEditorActivity"))
    assertTrue(manifest.contains("android:exported=\"false\""))
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
    val verification = File("src/main/java/uk/no_no/purelink/tools/NativeVerificationActivity.kt").readText()
    assertTrue(!ime.contains("HorizontalScrollView"))
    assertTrue(ime.contains("view.post { if (mode == PureLinkImeMode.MANUAL) activateManualMode() else showCandidateMode() }"))
    assertTrue(ime.contains("mode == PureLinkImeMode.MANUAL && inputState.target == PureLinkImeInputTarget.MANUAL"))
    assertTrue(ime.contains("mode == PureLinkImeMode.CANDIDATES && inputState.target == PureLinkImeInputTarget.DESCRIPTION"))
    assertFalse(ime.contains("currentInputConnection"))
    assertFalse(ime.contains("ic_ime_manual, R.string.manual_toggle"))
    assertFalse(ime.contains("ic_ime_globe, R.string.switch_keyboard, R.color.ime_surface"))
    assertTrue(ime.contains("R.string.delete_selected_candidates"))
    assertTrue(ime.contains("selections.removeSelected()"))
    assertTrue(ime.contains("if (remaining.size == 1) selections.setSelected(0, true)"))
    assertTrue(ime.contains("inputState.focusDescription()"))
    assertTrue(ime.contains("descriptionInput.insert(value)"))
    assertTrue(ime.contains("descriptionInput.backspace()"))
    assertTrue(ime.contains("descriptionInput.clear()"))
    assertFalse(ime.contains("DescriptionEditorActivity"))
    assertTrue(ime.contains("transientActivity.ownsInputViewFinish()"))
    assertTrue(ime.contains("addCharacterRow(PureLinkImeKeys.digits)"))
    assertTrue(ime.contains("addShiftRow()"))
    assertTrue(ime.contains("addBottomRow()"))
    assertTrue(ime.contains("selections.togglePreview(index)"))
    assertTrue(!ime.contains("selections.setPreview(index, true)"))
    assertTrue(!ime.contains("selections.setPreview(index, false)"))
    assertTrue(ime.contains("shareText(publicUrl)"))
    assertTrue(ime.contains("sessionGate.accepts(operation)"))
    assertTrue(ime.contains("showTransientStatus(R.string.share_chooser_opened)"))
    assertTrue(ime.contains("PureLinkWebsiteRoutes.accountUrl(responseLocale())"))
    assertTrue(verification.contains("onReceivedHttpError"))
    assertTrue(verification.contains("RESULT_ENDPOINT_UNAVAILABLE"))
    assertTrue(verification.contains("if (!delivered && isFinishing) complete(RESULT_CANCELED)"))
    assertTrue(client.contains("/api/native/cards"))
    assertTrue(client.contains("nativeCreateToken"))
    assertTrue(!client.contains("contentType\", \"card"))
  }

  @Test fun account_button_uses_only_a_real_localized_website_route() {
    assertEquals("https://no-no.uk/zh-Hant/account", PureLinkWebsiteRoutes.accountUrl("zh-Hant"))
    assertEquals("https://no-no.uk/en/account", PureLinkWebsiteRoutes.accountUrl("en"))
    assertFalse(PureLinkWebsiteRoutes.accountUrl("fr").contains("/fr/"))
  }

  @Test fun multi_select_share_invokes_verification_and_keeps_two_selected_rows_enabled() {
    val ime = File("src/main/java/uk/no_no/purelink/tools/PureLinkInputMethodService.kt").readText()
    assertTrue(ime.contains("else -> startNativeVerification(selected)"))
    assertTrue(ime.contains("val selected = selections.selectedRows()"))
    assertTrue(ime.contains("transientActivity.complete(PureLinkOwnedActivity.VERIFICATION, operation)"))
    assertTrue(ime.contains("if (verificationOperation != operation || !sessionGate.accepts(operation)) return"))
    assertTrue(ime.contains("setShareEnabled(!creatingCard && (pendingCardUrl != null || rows.any { it.selected }))"))
  }

  @Test fun description_field_is_local_and_no_activity_launch_path_remains() {
    val ime = File("src/main/java/uk/no_no/purelink/tools/PureLinkInputMethodService.kt").readText()
    val manifest = File("src/main/AndroidManifest.xml").readText()
    assertTrue(ime.contains("descriptionPreview = EditText"))
    assertTrue(ime.contains("setShowSoftInputOnFocus(false)"))
    assertTrue(ime.contains("activateDescriptionInput()"))
    assertFalse(ime.contains("switchToPreviousInputMethod for description"))
    assertFalse(ime.contains("DescriptionEditorActivity"))
    assertFalse(manifest.contains("DescriptionEditorActivity"))
  }
}
