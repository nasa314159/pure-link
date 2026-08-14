package uk.no_no.purelink.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PureLinkSelectionAndShareTest {
  private val first = PureLinkCandidate("A3cd8", "論文", 0..4)
  private val second = PureLinkCandidate("Q9xK2", "數據", 6..10)
  private val third = PureLinkCandidate("H72Ld", null, 12..16, preferredPreview = true)

  @Test fun selects_one_and_toggles_all_rows() {
    val model = PureLinkSelectionModel(listOf(first, second, third))
    model.setSelected(1, false)
    assertEquals(listOf(true, false, true), model.rows().map { it.selected })
    model.toggleSelectAll()
    assertTrue(model.rows().all { it.selected })
    model.toggleSelectAll()
    assertTrue(model.rows().none { it.selected })
  }

  @Test fun previews_one_and_toggles_selected_rows_without_touching_others() {
    val model = PureLinkSelectionModel(listOf(first, second, third))
    model.setSelected(2, false)
    model.togglePreview(0)
    assertEquals(listOf(true, false, true), model.rows().map { it.preview })
    model.togglePreviewForSelected()
    assertEquals(listOf(true, true, true), model.rows().map { it.preview })
    model.togglePreviewForSelected()
    assertEquals(listOf(false, false, true), model.rows().map { it.preview })
    assertFalse(model.rows()[2].selected)
    assertTrue(model.rows()[2].preview)
  }

  @Test fun formats_single_shares_with_only_requested_sections() {
    val row = PureLinkSelection(first, preview = false)
    assertEquals("https://no-no.uk/A3cd8", PureLinkShareFormatter.formatSingle(PureLinkSelection(first.copy(label = null))))
    assertEquals("論文\nhttps://no-no.uk/A3cd8", PureLinkShareFormatter.formatSingle(row))
    assertEquals("今天討論的論文\n\n論文\nhttps://no-no.uk/A3cd8+", PureLinkShareFormatter.formatSingle(row.copy(preview = true), "今天討論的論文"))
  }

  @Test fun formats_multi_share_in_source_order_with_exact_blank_lines() {
    val bundle = PureLinkShareFormatter.formatBundle(
      listOf(PureLinkSelection(first), PureLinkSelection(second, preview = true), PureLinkSelection(third)),
      "這三個是今天討論的參考資料",
    )
    assertEquals(
      "這三個是今天討論的參考資料\n\n論文\nhttps://no-no.uk/A3cd8\n\n數據\nhttps://no-no.uk/Q9xK2+\n\nhttps://no-no.uk/H72Ld+",
      bundle,
    )
  }

  @Test fun formats_only_selected_rows_and_bounds_unicode_description() {
    val selected = listOf(PureLinkSelection(first), PureLinkSelection(third, preview = false))
    val description = "😀".repeat(281)
    val body = PureLinkShareFormatter.formatBundle(selected, description)
    assertEquals(280, PureLinkShareFormatter.normalizeDescription(description).codePointCount(0, PureLinkShareFormatter.normalizeDescription(description).length))
    assertTrue(body.contains("https://no-no.uk/A3cd8"))
    assertTrue(body.contains("https://no-no.uk/H72Ld"))
    assertFalse(body.contains("Q9xK2"))
  }

  @Test fun bundle_contains_only_final_approved_content_and_does_not_mutate_session_state() {
    val model = PureLinkSelectionModel(listOf(first, second, third))
    model.setSelected(1, false)
    val before = model.rows()
    val rawClipboard = "private paragraph https://destination.example/token management-token-should-never-share"
    val body = PureLinkShareFormatter.formatBundle(model.selectedRows(), "approved description")
    assertEquals(before, model.rows())
    assertTrue(body.contains("approved description"))
    assertFalse(body.contains(rawClipboard))
    assertFalse(body.contains("destination.example"))
    assertFalse(body.contains("management-token"))
  }

  @Test fun description_paste_is_unicode_safe_and_never_changes_candidates() {
    val model = PureLinkSelectionModel(listOf(first, second))
    val before = model.rows()
    val pasted = PureLinkDescriptionPaste.insert("前綴", 2, 2, "😀 說明")
    assertEquals("前綴😀 說明", pasted)
    assertEquals(before, model.rows())

    val bounded = PureLinkDescriptionPaste.insert("", 0, 0, "😀".repeat(281))
    assertEquals(280, bounded.codePointCount(0, bounded.length))
  }

  @Test fun session_gate_discards_stale_results_after_new_or_finished_sessions() {
    val gate = PureLinkSessionGate()
    gate.activate()
    val firstOperation = gate.beginOperation()!!
    assertTrue(gate.accepts(firstOperation))
    gate.beginNewSessionState()
    assertFalse(gate.accepts(firstOperation))
    val secondOperation = gate.beginOperation()!!
    assertTrue(gate.accepts(secondOperation))
    gate.finish()
    assertFalse(gate.accepts(secondOperation))
  }
}
