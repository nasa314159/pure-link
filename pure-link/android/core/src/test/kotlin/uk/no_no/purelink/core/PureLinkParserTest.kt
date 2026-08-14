package uk.no_no.purelink.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PureLinkParserTest {
  @Test fun parses_deliberate_single_markers() {
    assertSlugs("PureLink: A3cd8", "A3cd8")
    assertSlugs("purelink:a3CD8", "a3CD8")
    assertSlugs("PURELINK:A3cd8", "A3cd8")
    assertSlugs("Pure Link : A3cd8", "A3cd8")
    assertSlugs("Link: Q9xK2", "Q9xK2")
    assertSlugs("link : Q9xK2", "Q9xK2")
    assertSlugs("🔗: H72Ld", "H72Ld")
    assertSlugs("🔗 H72Ld", "H72Ld")
  }

  @Test fun accepts_full_width_colons_and_spacing() {
    assertSlugs("PureLink：A3cd8", "A3cd8")
    assertSlugs("Link ： Q9xK2", "Q9xK2")
    assertSlugs("PureLink　：　A3cd8", "A3cd8")
  }

  @Test fun returns_multiple_candidates_in_source_order_with_local_labels() {
    val candidates = PureLinkParser.parse("論文 PureLink: A3cd8\n數據 Link: Q9xK2\n程式 🔗: H72Ld")
    assertEquals(listOf("A3cd8", "Q9xK2", "H72Ld"), candidates.map { it.slug })
    assertEquals(listOf("論文", "數據", "程式"), candidates.map { it.label })
  }

  @Test fun parses_complete_https_purelink_urls_including_preview_urls() {
    val direct = PureLinkParser.parse("https://no-no.uk/A3cd8")
    assertEquals(listOf("A3cd8"), direct.map { it.slug })
    assertFalse(direct.single().preferredPreview)

    val preview = PureLinkParser.parse("資料在這：https://no-no.uk/Q9xK2+")
    assertEquals("Q9xK2", preview.single().slug)
    assertEquals("資料在這", preview.single().label)
    assertTrue(preview.single().preferredPreview)
  }

  @Test fun parses_mixed_markers_and_embedded_urls_in_source_order() {
    val candidates = PureLinkParser.parse(
      "論文 Link: A3cd8；資料在這：https://no-no.uk/Q9xK2\n程式 Pure Link: H72Ld\nhttps://no-no.uk/Z9x_1+",
    )
    assertEquals(listOf("A3cd8", "Q9xK2", "H72Ld", "Z9x_1"), candidates.map { it.slug })
    assertEquals(listOf("論文", "資料在這", "程式", null), candidates.map { it.label })
    assertEquals(listOf(false, false, false, true), candidates.map { it.preferredPreview })
  }

  @Test fun does_not_overmatch_prose_or_malformed_values() {
    assertSlugs("An ordinary A3cd8 token is not enough")
    assertSlugs("The link between ideas is useful")
    assertSlugs("Link: invalid/slash")
    assertSlugs("Link: ${"a".repeat(31)}")
    // A complete HTTPS PureLink remains valid even when it follows other prose.
    assertSlugs("Link: https://no-no.uk/A3cd8", "A3cd8")
    assertSlugs("Link:: A3cd8")
    assertSlugs("PureLink A3cd8")
    assertSlugs("Link: en")
    assertSlugs("http://no-no.uk/A3cd8")
    assertSlugs("https://evil.example/no-no.uk/A3cd8")
    assertSlugs("https://no-no.uk.evil.example/A3cd8")
    assertSlugs("https://no-no.uk/A3cd8/next")
    assertSlugs("https://no-no.uk/A3cd8%2Fnext")
    assertSlugs("https://no-no.uk/A3cd8?next=yes")
    assertSlugs("https://no-no.uk/${"a".repeat(31)}")
    assertSlugs("https://no-no.uk/en")
  }

  @Test fun supports_a_bare_slug_only_for_manual_entry() {
    assertSlugs("A3cd8")
    assertSlugs("A3cd8", allowBareSlug = true, expected = arrayOf("A3cd8"))
    assertSlugs("a message with A3cd8", allowBareSlug = true)
  }

  @Test fun builds_only_safe_open_and_preview_urls() {
    assertEquals("https://no-no.uk/A3cd8", PureLinkResolver.urlFor("A3cd8"))
    assertEquals("https://no-no.uk/A3cd8+", PureLinkResolver.urlFor("A3cd8", preview = true))
    assertFalse(PureLinkResolver.urlFor(PureLinkCandidate("A3cd8", "private surrounding text", 0..4)).contains("private"))
  }

  @Test fun returns_the_compact_ui_states_for_zero_one_and_many_matches() {
    assertEquals(PureLinkResolution.Empty, PureLinkCandidateChooser.resolveIncoming("ordinary prose"))
    val one = PureLinkCandidateChooser.resolveManual("A3cd8") as PureLinkResolution.Single
    assertEquals("A3cd8", one.candidate.slug)
    val many = PureLinkCandidateChooser.resolveIncoming("論文 PureLink: A3cd8\n數據 Link: Q9xK2") as PureLinkResolution.Multiple
    assertEquals(listOf("A3cd8", "Q9xK2"), many.candidates.map { it.slug })
    assertEquals("https://no-no.uk/A3cd8", PureLinkResolver.urlFor(one.candidate))
    assertEquals("https://no-no.uk/A3cd8+", PureLinkResolver.urlFor(one.candidate, preview = true))
  }

  @Test fun manual_entry_accepts_a_bare_valid_slug() {
    assertTrue(PureLinkCandidateChooser.resolveManual("A3cd8") is PureLinkResolution.Single)
  }

  @Test fun action_send_requires_markers() {
    assertIncomingMarkerRules()
  }

  @Test fun action_process_text_requires_markers() {
    assertIncomingMarkerRules()
  }

  @Test fun clipboard_accepts_only_markers_or_complete_purelink_urls() {
    assertEquals(PureLinkResolution.Empty, PureLinkClipboardParser.parseCurrentText(null))
    assertEquals(PureLinkResolution.Empty, PureLinkClipboardParser.parseCurrentText("physics"))
    assertEquals(PureLinkResolution.Empty, PureLinkClipboardParser.parseCurrentText("A3cd8"))
    val url = PureLinkClipboardParser.parseCurrentText("https://no-no.uk/A3cd8") as PureLinkResolution.Single
    assertEquals("A3cd8", url.candidate.slug)
  }

  private fun assertIncomingMarkerRules() {
    assertEquals(PureLinkResolution.Empty, PureLinkCandidateChooser.resolveIncoming("A3cd8"))
    assertEquals(PureLinkResolution.Empty, PureLinkCandidateChooser.resolveIncoming("hello"))
    assertEquals(PureLinkResolution.Empty, PureLinkCandidateChooser.resolveIncoming("ordinary"))
    assertMarkedIncoming("Link: A3cd8")
    assertMarkedIncoming("PureLink: A3cd8")
    assertMarkedIncoming("🔗 A3cd8")
  }

  @Test fun keeps_parser_processing_local_and_never_exposes_labels_in_urls() {
    val candidate = PureLinkParser.parse("private message Link: A3cd8").single()
    assertEquals("private message", candidate.label)
    assertEquals("https://no-no.uk/A3cd8", PureLinkResolver.urlFor(candidate))
    assertTrue(PureLinkResolver::class.java.declaredMethods.none { it.name.contains("network", ignoreCase = true) })
  }

  private fun assertSlugs(input: String, vararg expected: String) = assertSlugs(input, false, expected)

  private fun assertSlugs(input: String, allowBareSlug: Boolean = false, expected: Array<out String> = emptyArray()) {
    assertEquals(expected.toList(), PureLinkParser.parse(input, allowBareSlug).map { it.slug })
  }

  private fun assertMarkedIncoming(input: String) {
    val resolution = PureLinkCandidateChooser.resolveIncoming(input) as PureLinkResolution.Single
    assertEquals("A3cd8", resolution.candidate.slug)
  }
}
