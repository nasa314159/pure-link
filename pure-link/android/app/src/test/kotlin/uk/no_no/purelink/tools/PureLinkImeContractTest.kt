package uk.no_no.purelink.tools

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PureLinkImeContractTest {
  @Test fun keyboard_offers_only_slug_characters_with_shifted_letters() {
    assertEquals("qwertyuiopasdfghjklzxcvbnm", PureLinkImeKeys.letterRows.joinToString(""))
    assertEquals("0123456789_-", PureLinkImeKeys.symbols)
    assertEquals("ABC", PureLinkImeKeys.displayed("abc", shifted = true))
    assertEquals("abc", PureLinkImeKeys.displayed("abc", shifted = false))
  }

  @Test fun manifest_registers_the_bound_input_method_service() {
    val manifest = File("src/main/AndroidManifest.xml").readText()
    assertTrue(manifest.contains("PureLinkInputMethodService"))
    assertTrue(manifest.contains("android.permission.BIND_INPUT_METHOD"))
    assertTrue(manifest.contains("android.view.InputMethod"))
    assertTrue(manifest.contains("@xml/method"))
  }
}
