package uk.no_no.purelink.core

/** Ephemeral selection and preview state for one resolver session. */
data class PureLinkSelection(
  val candidate: PureLinkCandidate,
  val selected: Boolean = true,
  val preview: Boolean = candidate.preferredPreview,
)

class PureLinkSelectionModel(candidates: List<PureLinkCandidate> = emptyList()) {
  private var state = candidates.map(::PureLinkSelection)

  fun rows(): List<PureLinkSelection> = state

  fun selectedRows(): List<PureLinkSelection> = state.filter { it.selected }

  fun replace(candidates: List<PureLinkCandidate>) {
    state = candidates.map(::PureLinkSelection)
  }

  fun clear() {
    state = emptyList()
  }

  fun setSelected(index: Int, selected: Boolean) {
    state = state.mapIndexed { current, row -> if (current == index) row.copy(selected = selected) else row }
  }

  fun toggleSelection(index: Int) {
    state.getOrNull(index)?.let { setSelected(index, !it.selected) }
  }

  fun setPreview(index: Int, preview: Boolean) {
    state = state.mapIndexed { current, row -> if (current == index) row.copy(preview = preview) else row }
  }

  fun togglePreview(index: Int) {
    state.getOrNull(index)?.let { setPreview(index, !it.preview) }
  }

  /** Select every row unless all are selected, in which case clear every selection. */
  fun toggleSelectAll() {
    val select = state.any { !it.selected }
    state = state.map { it.copy(selected = select) }
  }

  /**
   * Toggle preview for selected rows only. A mixed selection becomes all-preview; unselected rows
   * retain their state.
   */
  fun togglePreviewForSelected() {
    val selected = selectedRows()
    if (selected.isEmpty()) return
    val preview = selected.any { !it.preview }
    state = state.map { row -> if (row.selected) row.copy(preview = preview) else row }
  }
}
