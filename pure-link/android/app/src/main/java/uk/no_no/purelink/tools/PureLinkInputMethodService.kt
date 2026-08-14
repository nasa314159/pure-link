package uk.no_no.purelink.tools

import android.content.ActivityNotFoundException
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.inputmethodservice.InputMethodService
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import uk.no_no.purelink.core.PureLinkClipboardParser
import uk.no_no.purelink.core.PureLinkResolver
import uk.no_no.purelink.core.PureLinkSelection
import uk.no_no.purelink.core.PureLinkSelectionModel
import uk.no_no.purelink.core.PureLinkShareFormatter

/**
 * An auxiliary, non-composing InputMethodService. It reads the clipboard only from the explicit
 * button below and never scans current-editor text, retains clipboard history, or observes input.
 */
class PureLinkInputMethodService : InputMethodService() {
  private val selections = PureLinkSelectionModel()
  private val cardClient = PureLinkCardClient()
  private var shifted = false
  private var pendingCardUrl: String? = null
  private var creatingCard = false

  private lateinit var status: TextView
  private lateinit var candidates: LinearLayout
  private lateinit var keyboardRows: LinearLayout
  private lateinit var descriptionPanel: View
  private lateinit var description: EditText
  private lateinit var manualSlug: EditText
  private lateinit var shareButton: Button
  private lateinit var retryButton: Button

  override fun onCreateInputView(): View = buildInputView()

  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting)
    // Do not inspect editor contents. A new or password editor discards this ephemeral session.
    if (::candidates.isInitialized && (!restarting || isSensitive(attribute))) clearSession()
  }

  override fun onFinishInputView(finishingInput: Boolean) {
    if (finishingInput && ::candidates.isInitialized) clearSession()
    super.onFinishInputView(finishingInput)
  }

  private fun buildInputView(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), dp(8), dp(8), dp(8))
      setBackgroundColor(Color.rgb(233, 243, 235))
    }
    root.addView(topBar())
    status = TextView(this).apply { setPadding(dp(4), dp(4), dp(4), dp(4)); textSize = 14f }
    root.addView(status)
    manualSlug = EditText(this).apply {
      hint = getString(R.string.manual_slug_hint)
      inputType = InputType.TYPE_CLASS_TEXT
      filters = arrayOf(InputFilter.LengthFilter(30))
      setSingleLine(true)
    }
    root.addView(labelled(getString(R.string.manual_slug), manualSlug))
    root.addView(Button(this).apply {
      text = getString(R.string.resolve)
      setOnClickListener { resolveManualSlug() }
    })

    candidates = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    root.addView(ScrollView(this).apply {
      isFillViewport = false
      addView(candidates)
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    description = EditText(this).apply {
      hint = getString(R.string.description_hint)
      filters = arrayOf(CodePointLengthFilter(PureLinkShareFormatter.maxDescriptionCodePoints))
      minLines = 1
      maxLines = 3
    }
    descriptionPanel = labelled(getString(R.string.description), description)
    root.addView(descriptionPanel)
    keyboardRows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    root.addView(keyboardRows)
    renderKeyboard()
    renderCandidates()
    return root
  }

  private fun topBar(): View = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    addView(TextView(this@PureLinkInputMethodService).apply {
      text = getString(R.string.keyboard_title)
      textSize = 18f
      setTextColor(Color.rgb(28, 74, 48))
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    addView(Button(this@PureLinkInputMethodService).apply {
      text = getString(R.string.clipboard)
      contentDescription = getString(R.string.resolve_clipboard)
      setOnClickListener { parseClipboard() }
    })
    addView(Button(this@PureLinkInputMethodService).apply {
      text = "🌐"
      contentDescription = getString(R.string.switch_keyboard)
      setOnClickListener { switchKeyboard() }
    })
    retryButton = Button(this@PureLinkInputMethodService).apply {
      text = getString(R.string.retry)
      visibility = View.GONE
      setOnClickListener { shareSelected() }
    }
    addView(retryButton)
    shareButton = Button(this@PureLinkInputMethodService).apply {
      text = getString(R.string.share)
      isEnabled = false
      setOnClickListener { shareSelected() }
    }
    addView(shareButton)
  }

  private fun labelled(label: String, field: View): View = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    addView(TextView(this@PureLinkInputMethodService).apply { text = label; textSize = 12f })
    addView(field)
  }

  private fun parseClipboard() {
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    if (!clipboard.hasPrimaryClip()) {
      showStatus(R.string.clipboard_empty)
      return
    }
    val clip = clipboard.primaryClip ?: run { showStatus(R.string.clipboard_empty); return }
    val description = clip.description
    val textMimeType = description?.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) == true ||
      description?.filterMimeTypes("text/*")?.isNotEmpty() == true
    if (!textMimeType) {
      showStatus(R.string.clipboard_not_text)
      return
    }
    val currentText = (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).text?.toString() }.joinToString("\n")
    if (currentText.isBlank()) {
      showStatus(R.string.clipboard_empty)
      return
    }
    // currentText is not retained: only derived candidate rows enter this session model.
    applyResolution(PureLinkClipboardParser.parseCurrentText(currentText))
  }

  private fun resolveManualSlug() {
    applyResolution(uk.no_no.purelink.core.PureLinkCandidateChooser.resolveManual(manualSlug.text))
    manualSlug.text.clear()
  }

  private fun applyResolution(resolution: uk.no_no.purelink.core.PureLinkResolution) {
    val found = when (resolution) {
      uk.no_no.purelink.core.PureLinkResolution.Empty -> emptyList()
      is uk.no_no.purelink.core.PureLinkResolution.Single -> listOf(resolution.candidate)
      is uk.no_no.purelink.core.PureLinkResolution.Multiple -> resolution.candidates
    }
    selections.replace(found)
    pendingCardUrl = null
    description.text.clear()
    retryButton.visibility = View.GONE
    showStatus(if (found.isEmpty()) R.string.no_purelink_found else R.string.unverified)
    renderCandidates()
  }

  private fun renderCandidates() {
    candidates.removeAllViews()
    val rows = selections.rows()
    descriptionPanel.visibility = if (rows.isEmpty()) View.GONE else View.VISIBLE
    shareButton.isEnabled = !creatingCard && (pendingCardUrl != null || rows.any { it.selected })
    if (rows.isEmpty()) return

    if (rows.size > 1) {
      candidates.addView(LinearLayout(this).apply {
        gravity = Gravity.END
        addView(Button(this@PureLinkInputMethodService).apply {
          text = getString(R.string.select_all)
          setOnClickListener { selections.toggleSelectAll(); renderCandidates() }
        })
        addView(Button(this@PureLinkInputMethodService).apply {
          text = getString(R.string.preview_all)
          isEnabled = rows.any { it.selected }
          setOnClickListener { selections.togglePreviewForSelected(); renderCandidates() }
        })
      })
    }
    rows.forEachIndexed { index, row -> candidates.addView(candidateRow(index, row, rows.size > 1)) }
  }

  private fun candidateRow(index: Int, row: PureLinkSelection, showSelection: Boolean): View = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(8), dp(6), dp(8), dp(6))
    setBackgroundColor(Color.rgb(247, 251, 248))
    if (showSelection) {
      addView(CheckBox(this@PureLinkInputMethodService).apply {
        text = row.candidate.label ?: getString(R.string.purelink_label)
        isChecked = row.selected
        setOnCheckedChangeListener { _, checked -> selections.setSelected(index, checked); renderCandidates() }
      })
    } else if (!row.candidate.label.isNullOrBlank()) {
      addView(TextView(this@PureLinkInputMethodService).apply { text = row.candidate.label; textSize = 14f })
    }
    addView(TextView(this@PureLinkInputMethodService).apply {
      text = row.candidate.slug
      textSize = 20f
      setTextColor(Color.rgb(28, 74, 48))
    })
    addView(TextView(this@PureLinkInputMethodService).apply {
      text = if (row.preview) getString(R.string.preview_enabled) else getString(R.string.unverified)
      textSize = 12f
    })
    addView(LinearLayout(this@PureLinkInputMethodService).apply {
      gravity = Gravity.END
      addView(Button(this@PureLinkInputMethodService).apply {
        text = getString(R.string.preview)
        setOnClickListener {
          selections.setPreview(index, true)
          renderCandidates()
          open(row, preview = true)
        }
      })
      addView(Button(this@PureLinkInputMethodService).apply {
        text = getString(R.string.open)
        setOnClickListener {
          selections.setPreview(index, false)
          renderCandidates()
          open(row, preview = false)
        }
      })
    })
  }

  private fun open(row: PureLinkSelection, preview: Boolean) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PureLinkResolver.urlFor(row.candidate, preview))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
      showStatus(R.string.no_url_handler)
    }
  }

  private fun shareSelected() {
    pendingCardUrl?.let {
      if (shareText(it)) clearSession()
      return
    }
    val selected = selections.selectedRows()
    when (selected.size) {
      0 -> showStatus(R.string.no_selected_links)
      1 -> if (shareText(PureLinkShareFormatter.formatSingle(selected.single(), description.text))) clearSession()
      else -> createBundleCard(selected)
    }
  }

  private fun createBundleCard(selected: List<PureLinkSelection>) {
    val body = PureLinkShareFormatter.formatBundle(selected, description.text)
    if (body.length > 1000) {
      showStatus(R.string.bundle_too_long)
      return
    }
    creatingCard = true
    retryButton.visibility = View.GONE
    showStatus(R.string.creating_card)
    renderCandidates()
    Thread {
      val result = cardClient.createCard(body, responseLocale())
      status.post {
        creatingCard = false
        result.onSuccess { publicUrl ->
          pendingCardUrl = publicUrl
          if (shareText(publicUrl)) clearSession() else retryButton.visibility = View.VISIBLE
        }.onFailure {
          showStatus(R.string.card_creation_failed)
          retryButton.visibility = View.VISIBLE
        }
        renderCandidates()
      }
    }.start()
  }

  private fun shareText(text: String): Boolean = try {
    val send = Intent(Intent.ACTION_SEND).apply {
      type = "text/plain"
      putExtra(Intent.EXTRA_TEXT, text)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    startActivity(Intent.createChooser(send, getString(R.string.share_title)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: ActivityNotFoundException) {
    showStatus(R.string.no_url_handler)
    false
  }

  private fun switchKeyboard() {
    if (shouldOfferSwitchingToNextInputMethod()) {
      switchToNextInputMethod(false)
    } else {
      (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
    }
  }

  private fun renderKeyboard() {
    keyboardRows.removeAllViews()
    PureLinkImeKeys.letterRows.forEach { addCharacterRow(PureLinkImeKeys.displayed(it, shifted)) }
    addCharacterRow(PureLinkImeKeys.symbols)
    keyboardRows.addView(HorizontalScrollView(this).apply {
      addView(LinearLayout(this@PureLinkInputMethodService).apply {
        addView(keyButton(getString(R.string.key_shift)) { shifted = !shifted; renderKeyboard() })
        addView(keyButton("⌫", getString(R.string.key_backspace)) { backspace() })
        addView(keyButton("↵", getString(R.string.key_enter)) { enter() })
      })
    })
  }

  private fun addCharacterRow(characters: String) {
    keyboardRows.addView(HorizontalScrollView(this).apply {
      addView(LinearLayout(this@PureLinkInputMethodService).apply {
        characters.forEach { character -> addView(keyButton(character.toString()) { type(character.toString()) }) }
      })
    })
  }

  private fun keyButton(text: String, contentDescription: String = text, action: () -> Unit): Button = Button(this).apply {
    this.text = text
    this.contentDescription = contentDescription
    minWidth = dp(36)
    setOnClickListener { action() }
  }

  private fun type(value: String) {
    when {
      description.hasFocus() -> insert(description, value)
      manualSlug.hasFocus() -> insert(manualSlug, value)
      else -> currentInputConnection?.commitText(value, 1)
    }
  }

  private fun backspace() {
    when {
      description.hasFocus() -> deleteFrom(description)
      manualSlug.hasFocus() -> deleteFrom(manualSlug)
      else -> currentInputConnection?.deleteSurroundingText(1, 0)
    }
  }

  private fun enter() {
    when {
      manualSlug.hasFocus() -> resolveManualSlug()
      description.hasFocus() -> insert(description, "\n")
      else -> currentInputConnection?.performEditorAction(EditorInfo.IME_ACTION_DONE)
    }
  }

  private fun insert(field: EditText, value: String) {
    val start = field.selectionStart.coerceAtLeast(0)
    val end = field.selectionEnd.coerceAtLeast(start)
    field.text.replace(start, end, value)
  }

  private fun deleteFrom(field: EditText) {
    val start = field.selectionStart.coerceAtLeast(0)
    val end = field.selectionEnd.coerceAtLeast(start)
    when {
      start != end -> field.text.delete(start, end)
      start > 0 -> field.text.delete(start - 1, start)
    }
  }

  private fun clearSession() {
    selections.clear()
    pendingCardUrl = null
    creatingCard = false
    if (::description.isInitialized) description.text.clear()
    if (::manualSlug.isInitialized) manualSlug.text.clear()
    if (::retryButton.isInitialized) retryButton.visibility = View.GONE
    if (::status.isInitialized) status.text = ""
    if (::candidates.isInitialized) renderCandidates()
  }

  private fun showStatus(resource: Int) {
    status.text = getString(resource)
  }

  private fun responseLocale(): String = if (resources.configuration.locales[0].language.equals("zh", ignoreCase = true)) "zh-Hant" else "en"

  private fun isSensitive(attribute: EditorInfo?): Boolean {
    val inputType = attribute?.inputType ?: return false
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
