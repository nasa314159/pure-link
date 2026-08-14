package uk.no_no.purelink.tools

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import uk.no_no.purelink.core.PureLinkClipboardParser
import uk.no_no.purelink.core.PureLinkDescriptionPaste
import uk.no_no.purelink.core.PureLinkResolution
import uk.no_no.purelink.core.PureLinkResolver
import uk.no_no.purelink.core.PureLinkSelection
import uk.no_no.purelink.core.PureLinkSelectionModel
import uk.no_no.purelink.core.PureLinkSessionGate
import uk.no_no.purelink.core.PureLinkShareFormatter

/**
 * An auxiliary, non-composing InputMethodService. It reads the clipboard only after an explicit
 * user action and never scans editor text, retains clipboard history, or observes input.
 */
class PureLinkInputMethodService : InputMethodService() {
  private val selections = PureLinkSelectionModel()
  private val cardClient = PureLinkCardClient()
  private val sessionGate = PureLinkSessionGate()
  private var shifted = false
  private var pendingCardUrl: String? = null
  private var creatingCard = false
  private var verificationOperation: Long? = null

  private lateinit var status: TextView
  private lateinit var candidates: LinearLayout
  private lateinit var candidatesScroll: ScrollView
  private lateinit var keyboardRows: LinearLayout
  private lateinit var descriptionPanel: View
  private lateinit var description: EditText
  private lateinit var manualPanel: View
  private lateinit var manualSlug: EditText
  private lateinit var shareButton: Button
  private lateinit var retryButton: Button

  private val verificationReceiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
    override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
      val operation = resultData?.getLong(NativeVerificationActivity.EXTRA_OPERATION, -1L) ?: -1L
      if (verificationOperation != operation || !sessionGate.accepts(operation)) return
      verificationOperation = null
      if (resultCode != Activity.RESULT_OK) {
        creatingCard = false
        showStatus(R.string.verification_cancelled)
        retryButton.visibility = View.VISIBLE
        renderCandidates()
        return
      }
      val nativeCreateToken = resultData?.getString(NativeVerificationActivity.EXTRA_NATIVE_CREATE_TOKEN)
      if (nativeCreateToken.isNullOrBlank()) {
        creatingCard = false
        showStatus(R.string.verification_failed)
        retryButton.visibility = View.VISIBLE
        renderCandidates()
        return
      }
      createBundleCard(nativeCreateToken, operation)
    }
  }

  override fun onCreateInputView(): View {
    sessionGate.activate()
    return buildInputView()
  }

  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting)
    // Do not inspect editor contents. A new or password editor discards this ephemeral session.
    if (::candidates.isInitialized && (!restarting || isSensitive(attribute))) clearSession(invalidate = true)
  }

  override fun onFinishInputView(finishingInput: Boolean) {
    if (finishingInput && ::candidates.isInitialized) {
      sessionGate.finish()
      clearSession(invalidate = false)
    }
    super.onFinishInputView(finishingInput)
  }

  private fun buildInputView(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(6), dp(6), dp(6), dp(6))
      setBackgroundColor(Color.rgb(233, 243, 235))
    }
    root.addView(topBar())
    status = TextView(this).apply {
      visibility = View.GONE
      setPadding(dp(4), dp(2), dp(4), dp(2))
      textSize = 13f
    }
    root.addView(status)

    manualPanel = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      visibility = View.GONE
    }
    manualSlug = EditText(this).apply {
      hint = getString(R.string.manual_slug_hint)
      inputType = InputType.TYPE_CLASS_TEXT
      filters = arrayOf(InputFilter.LengthFilter(30))
      setSingleLine(true)
    }
    (manualPanel as LinearLayout).addView(manualSlug, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    (manualPanel as LinearLayout).addView(Button(this).apply {
      text = getString(R.string.resolve)
      setOnClickListener { resolveManualSlug() }
    })
    root.addView(manualPanel)

    candidates = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    candidatesScroll = ScrollView(this).apply {
      visibility = View.GONE
      isFillViewport = false
      addView(candidates)
    }
    root.addView(candidatesScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(136)))

    description = EditText(this).apply {
      hint = getString(R.string.description_hint)
      filters = arrayOf(CodePointLengthFilter(PureLinkShareFormatter.maxDescriptionCodePoints))
      minLines = 1
      maxLines = 2
    }
    descriptionPanel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      val heading = LinearLayout(this@PureLinkInputMethodService).apply { gravity = Gravity.CENTER_VERTICAL }
      heading.addView(TextView(this@PureLinkInputMethodService).apply { text = getString(R.string.description); textSize = 12f }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      heading.addView(Button(this@PureLinkInputMethodService).apply {
        text = getString(R.string.paste_description)
        contentDescription = getString(R.string.paste_description)
        setOnClickListener { pasteDescription() }
      })
      addView(heading)
      addView(description)
    }
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
      textSize = 17f
      setTextColor(Color.rgb(28, 74, 48))
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    addView(Button(this@PureLinkInputMethodService).apply {
      text = getString(R.string.clipboard)
      contentDescription = getString(R.string.resolve_clipboard)
      setOnClickListener { parseClipboard() }
    })
    addView(Button(this@PureLinkInputMethodService).apply {
      text = getString(R.string.manual_toggle)
      contentDescription = getString(R.string.manual_toggle)
      setOnClickListener { manualPanel.visibility = if (manualPanel.visibility == View.VISIBLE) View.GONE else View.VISIBLE }
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
    addView(Button(this@PureLinkInputMethodService).apply {
      text = getString(R.string.clear_session)
      contentDescription = getString(R.string.clear_session)
      setOnClickListener { clearSession(invalidate = true) }
    })
  }

  private fun parseClipboard() {
    val currentText = currentClipboardText() ?: return
    // currentText is not retained: only derived candidate rows enter this session model.
    applyResolution(PureLinkClipboardParser.parseCurrentText(currentText))
  }

  private fun pasteDescription() {
    val currentText = currentClipboardText() ?: return
    val inserted = PureLinkDescriptionPaste.insert(description.text, description.selectionStart, description.selectionEnd, currentText)
    description.setText(inserted)
    description.setSelection(inserted.length)
  }

  private fun currentClipboardText(): String? {
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    if (!clipboard.hasPrimaryClip()) {
      showStatus(R.string.clipboard_empty)
      return null
    }
    val clip = clipboard.primaryClip ?: run { showStatus(R.string.clipboard_empty); return null }
    val clipDescription = clip.description
    val textMimeType = clipDescription?.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) == true ||
      clipDescription?.filterMimeTypes("text/*")?.isNotEmpty() == true
    if (!textMimeType) {
      showStatus(R.string.clipboard_not_text)
      return null
    }
    val text = (0 until clip.itemCount).mapNotNull { itemIndex ->
      clip.getItemAt(itemIndex).text?.toString() ?: clip.getItemAt(itemIndex).htmlText
    }.joinToString("\n")
    if (text.isBlank()) {
      showStatus(R.string.clipboard_empty)
      return null
    }
    return text
  }

  private fun resolveManualSlug() {
    applyResolution(uk.no_no.purelink.core.PureLinkCandidateChooser.resolveManual(manualSlug.text))
    manualSlug.text.clear()
    manualPanel.visibility = View.GONE
  }

  private fun applyResolution(resolution: PureLinkResolution) {
    sessionGate.beginNewSessionState()
    val found = when (resolution) {
      PureLinkResolution.Empty -> emptyList()
      is PureLinkResolution.Single -> listOf(resolution.candidate)
      is PureLinkResolution.Multiple -> resolution.candidates
    }
    selections.replace(found)
    pendingCardUrl = null
    creatingCard = false
    verificationOperation = null
    description.text.clear()
    retryButton.visibility = View.GONE
    showStatus(if (found.isEmpty()) R.string.no_purelink_found else R.string.unverified)
    renderCandidates()
  }

  private fun renderCandidates() {
    candidates.removeAllViews()
    val rows = selections.rows()
    candidatesScroll.visibility = if (rows.isEmpty()) View.GONE else View.VISIBLE
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
    setPadding(dp(8), dp(4), dp(8), dp(4))
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
      textSize = 19f
      setTextColor(Color.rgb(28, 74, 48))
    })
    addView(LinearLayout(this@PureLinkInputMethodService).apply {
      gravity = Gravity.END
      addView(rowButton(if (row.preview) "[+]" else "[ ]", getString(R.string.toggle_share_preview)) {
        selections.togglePreview(index)
        renderCandidates()
      })
      addView(rowButton(getString(R.string.preview), getString(R.string.preview)) { open(row, preview = true) })
      addView(rowButton(getString(R.string.open), getString(R.string.open)) { open(row, preview = false) })
    })
  }

  private fun rowButton(label: String, description: String, action: () -> Unit): Button = Button(this).apply {
    text = label
    contentDescription = description
    setOnClickListener { action() }
  }

  private fun open(row: PureLinkSelection, preview: Boolean) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PureLinkResolver.urlFor(row.candidate, preview))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
      showStatus(R.string.no_url_handler)
    }
  }

  private fun shareSelected() {
    pendingCardUrl?.let { shareText(it); return }
    val selected = selections.selectedRows()
    when (selected.size) {
      0 -> showStatus(R.string.no_selected_links)
      1 -> shareText(PureLinkShareFormatter.formatSingle(selected.single(), description.text))
      else -> startNativeVerification(selected)
    }
  }

  private fun startNativeVerification(selected: List<PureLinkSelection>) {
    if (PureLinkShareFormatter.formatBundle(selected, description.text).length > 1000) {
      showStatus(R.string.bundle_too_long)
      return
    }
    val operation = sessionGate.beginOperation() ?: return
    verificationOperation = operation
    creatingCard = true
    retryButton.visibility = View.GONE
    showStatus(R.string.verifying_card)
    renderCandidates()
    try {
      startActivity(Intent(this, NativeVerificationActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(NativeVerificationActivity.EXTRA_RESULT_RECEIVER, verificationReceiver)
        putExtra(NativeVerificationActivity.EXTRA_OPERATION, operation)
        putExtra(NativeVerificationActivity.EXTRA_LOCALE, responseLocale())
      })
    } catch (_: ActivityNotFoundException) {
      verificationOperation = null
      creatingCard = false
      showStatus(R.string.verification_failed)
      retryButton.visibility = View.VISIBLE
      renderCandidates()
    }
  }

  private fun createBundleCard(nativeCreateToken: String, operation: Long) {
    if (!sessionGate.accepts(operation)) return
    val selected = selections.selectedRows()
    if (selected.size < 2) return
    val body = PureLinkShareFormatter.formatBundle(selected, description.text)
    if (body.length > 1000) {
      creatingCard = false
      showStatus(R.string.bundle_too_long)
      renderCandidates()
      return
    }
    showStatus(R.string.creating_card)
    Thread {
      val result = cardClient.createCard(body, nativeCreateToken, responseLocale())
      status.post {
        if (!sessionGate.accepts(operation)) return@post
        creatingCard = false
        result.onSuccess { publicUrl ->
          pendingCardUrl = publicUrl
          shareText(publicUrl)
        }.onFailure {
          showStatus(R.string.card_creation_failed)
          retryButton.visibility = View.VISIBLE
        }
        renderCandidates()
      }
    }.start()
  }

  /** Launching a chooser is not proof that a recipient accepted or delivered the share. */
  private fun shareText(text: String): Boolean = try {
    val send = Intent(Intent.ACTION_SEND).apply {
      type = "text/plain"
      putExtra(Intent.EXTRA_TEXT, text)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    startActivity(Intent.createChooser(send, getString(R.string.share_title)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    showStatus(R.string.share_chooser_opened)
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
    PureLinkImeKeys.symbolRows.forEach(::addCharacterRow)
    val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    controls.addView(weightedKeyButton(getString(R.string.key_shift), getString(R.string.key_shift)) { shifted = !shifted; renderKeyboard() })
    controls.addView(weightedKeyButton("⌫", getString(R.string.key_backspace)) { backspace() })
    controls.addView(weightedKeyButton("↵", getString(R.string.key_enter)) { enter() })
    keyboardRows.addView(controls)
  }

  private fun addCharacterRow(characters: String) {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    characters.forEach { character -> row.addView(weightedKeyButton(character.toString()) { type(character.toString()) }) }
    keyboardRows.addView(row)
  }

  private fun weightedKeyButton(text: String, contentDescription: String = text, action: () -> Unit): Button = Button(this).apply {
    this.text = text
    this.contentDescription = contentDescription
    minWidth = 0
    minHeight = dp(40)
    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
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

  private fun clearSession(invalidate: Boolean) {
    if (invalidate) sessionGate.beginNewSessionState()
    selections.clear()
    pendingCardUrl = null
    creatingCard = false
    verificationOperation = null
    if (::description.isInitialized) description.text.clear()
    if (::manualSlug.isInitialized) manualSlug.text.clear()
    if (::manualPanel.isInitialized) manualPanel.visibility = View.GONE
    if (::retryButton.isInitialized) retryButton.visibility = View.GONE
    if (::status.isInitialized) { status.text = ""; status.visibility = View.GONE }
    if (::candidates.isInitialized) renderCandidates()
  }

  private fun showStatus(resource: Int) {
    status.text = getString(resource)
    status.visibility = View.VISIBLE
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
