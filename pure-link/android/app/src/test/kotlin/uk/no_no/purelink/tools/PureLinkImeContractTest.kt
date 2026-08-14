package uk.no_no.purelink.tools

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PureLinkImeContractTest {
  @Test fun keyboard_offers_only_slug_characters_with_shifted_letters() {
    assertEquals("qwertyuiopasdfghjklzxcvbnm", PureLinkImeKeys.letterRows.joinToString(""))
    assertEquals("0123456789_-", PureLinkImeKeys.symbolRows.joinToString(""))
    assertEquals("ABC", PureLinkImeKeys.displayed("abc", shifted = true))
    assertEquals("abc", PureLinkImeKeys.displayed("abc", shifted = false))
  }

  @Test fun manifest_registers_the_bound_input_method_service() {
    val manifest = File("src/main/AndroidManifest.xml").readText()
    assertTrue(manifest.contains("PureLinkInputMethodService"))
    assertTrue(manifest.contains("android.permission.BIND_INPUT_METHOD"))
    assertTrue(manifest.contains("android.view.InputMethod"))
    assertTrue(manifest.contains("@xml/method"))
    assertTrue(manifest.contains("NativeVerificationActivity"))
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

  @Test fun ime_uses_a_constrained_card_client_and_non_scrolling_weighted_key_rows() {
    val ime = File("src/main/java/uk/no_no/purelink/tools/PureLinkInputMethodService.kt").readText()
    val client = File("src/main/java/uk/no_no/purelink/tools/PureLinkCardClient.kt").readText()
    assertTrue(!ime.contains("HorizontalScrollView"))
    assertTrue(ime.contains("LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)"))
    assertTrue(ime.contains("selections.togglePreview(index)"))
    assertTrue(!ime.contains("selections.setPreview(index, true)"))
    assertTrue(!ime.contains("selections.setPreview(index, false)"))
    assertTrue(client.contains("/api/native/cards"))
    assertTrue(client.contains("nativeCreateToken"))
    assertTrue(!client.contains("contentType\", \"card"))
  }
}
