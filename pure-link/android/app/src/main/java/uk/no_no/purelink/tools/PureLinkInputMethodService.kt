package uk.no_no.purelink.tools

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
import android.util.Log
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Space
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
 * user action and never scans editor text, retains clipboard history, or writes into the host
 * editor. Its keys are deliberately limited to the PureLink custom-slug character grammar.
 */
class PureLinkInputMethodService : InputMethodService() {
  private companion object {
    const val QA_TAG = "PureLinkQA"
  }

  private val selections = PureLinkSelectionModel()
  private val cardClient = PureLinkCardClient()
  private val sessionGate = PureLinkSessionGate { message -> Log.d(QA_TAG, "sessionGate: $message") }
  private val inputState = PureLinkImeInputState()
  private val shiftState = PureLinkShiftState()
  private val transientActivity = PureLinkTransientActivityState()
  private var mode = PureLinkImeMode.MANUAL
  private var descriptionText = ""
  private var pendingCardUrl: String? = null
  private var creatingCard = false
  private var verificationOperation: Long? = null
  private var descriptionOperation: Long? = null
  private var restoringInputMethod = false

  private lateinit var status: TextView
  private lateinit var candidates: LinearLayout
  private lateinit var candidatesScroll: ScrollView
  private lateinit var keyboardRows: LinearLayout
  private lateinit var descriptionPanel: View
  private lateinit var descriptionPreview: TextView
  private lateinit var manualPanel: View
  private lateinit var manualSlug: EditText
  private lateinit var shareButton: ImageButton

  private val verificationReceiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
    override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
      val operation = resultData?.getLong(NativeVerificationActivity.EXTRA_OPERATION, -1L) ?: -1L
      // Temporary QA instrumentation.
      Log.d(QA_TAG, "verification ResultReceiver invoked resultCode=$resultCode operation=$operation")
      transientActivity.complete(PureLinkOwnedActivity.VERIFICATION, operation)
      if (verificationOperation != operation || !sessionGate.accepts(operation)) return
      verificationOperation = null
      if (resultCode != Activity.RESULT_OK) {
        creatingCard = false
        val message = if (resultData?.getString(NativeVerificationActivity.EXTRA_ERROR) == NativeVerificationActivity.ERROR_ENDPOINT_UNAVAILABLE) {
          R.string.verification_unavailable
        } else if (resultCode == Activity.RESULT_CANCELED) {
          R.string.verification_cancelled
        } else {
          R.string.verification_failed
        }
        showStatus(message, error = true)
        renderCandidates()
        restoreInputMethod()
        return
      }
      val nativeCreateToken = resultData?.getString(NativeVerificationActivity.EXTRA_NATIVE_CREATE_TOKEN)
      if (nativeCreateToken.isNullOrBlank()) {
        creatingCard = false
        showStatus(R.string.verification_failed, error = true)
        renderCandidates()
        restoreInputMethod()
        return
      }
      restoreInputMethod()
      createBundleCard(nativeCreateToken, operation)
    }
  }

  private val descriptionReceiver = object : ResultReceiver(Handler(Looper.getMainLooper())) {
    override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
      val operation = resultData?.getLong(DescriptionEditorActivity.EXTRA_OPERATION, -1L) ?: -1L
      // Temporary QA instrumentation.
      Log.d(QA_TAG, "description ResultReceiver invoked resultCode=$resultCode operation=$operation")
      transientActivity.complete(PureLinkOwnedActivity.DESCRIPTION_EDITOR, operation)
      if (descriptionOperation != operation || !sessionGate.accepts(operation)) return
      descriptionOperation = null
      if (resultCode == Activity.RESULT_OK) {
        descriptionText = PureLinkDescriptionEditor.done(resultData?.getString(DescriptionEditorActivity.EXTRA_DESCRIPTION))
      } else {
        descriptionText = PureLinkDescriptionEditor.cancel(descriptionText)
      }
      if (selections.rows().isNotEmpty()) showCandidateMode()
      renderCandidates()
      restoreInputMethod()
    }
  }

  override fun onCreateInputView(): View {
    if (!sessionGate.isActive()) sessionGate.activate()
    return buildInputView().also { view ->
      // An internally launched Activity may recreate the view; restore its existing session mode.
      view.post { if (mode == PureLinkImeMode.MANUAL) activateManualMode() else showCandidateMode() }
    }
  }

  override fun onStartInput(attribute: EditorInfo?, restarting: Boolean) {
    super.onStartInput(attribute, restarting)
    // Do not inspect editor contents. A new or password editor discards this ephemeral session.
    // Temporary QA instrumentation.
    val sensitive = isSensitive(attribute)
    val pendingActivity = hasPendingActivity()
    Log.d(QA_TAG, "onStartInput restarting=$restarting sensitive=$sensitive hasPendingActivity=$pendingActivity")
    if (restoringInputMethod) {
      restoringInputMethod = false
    } else if (::candidates.isInitialized && !pendingActivity && (!restarting || sensitive)) {
      clearSession(invalidate = true)
    }
  }

  override fun onFinishInputView(finishingInput: Boolean) {
    // Temporary QA instrumentation.
    val pendingActivity = hasPendingActivity()
    Log.d(QA_TAG, "onFinishInputView finishingInput=$finishingInput hasPendingActivity=$pendingActivity")
    if (finishingInput && ::candidates.isInitialized && !pendingActivity) {
      // Temporary QA instrumentation.
      Log.d(QA_TAG, "about to call sessionGate.finish from onFinishInputView finishingInput=$finishingInput hasPendingActivity=$pendingActivity")
      sessionGate.finish()
      clearSession(invalidate = false)
    }
    super.onFinishInputView(finishingInput)
  }

  private fun buildInputView(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(PureLinkImeLayout.horizontalPaddingDp), dp(5), dp(PureLinkImeLayout.horizontalPaddingDp), dp(5))
      setBackgroundColor(color(R.color.ime_background))
    }
    root.addView(topBar())
    status = TextView(this).apply {
      visibility = View.GONE
      setPadding(dp(6), dp(4), dp(6), dp(4))
      textSize = 12f
      setTextColor(color(R.color.ime_muted))
    }
    root.addView(status)

    manualPanel = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, dp(3), 0, dp(3))
    }
    manualSlug = EditText(this).apply {
      hint = getString(R.string.manual_slug_hint)
      setHintTextColor(color(R.color.ime_muted))
      setTextColor(color(R.color.ime_text))
      textSize = 16f
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
      filters = arrayOf(InputFilter.LengthFilter(30))
      setSingleLine(true)
      setShowSoftInputOnFocus(false)
      background = roundedBackground(R.color.ime_surface)
      setPadding(dp(12), dp(2), dp(12), dp(2))
      contentDescription = getString(R.string.manual_slug)
      setOnFocusChangeListener { _, focused -> if (focused) inputState.focusManual() }
    }
    (manualPanel as LinearLayout).addView(manualSlug, LinearLayout.LayoutParams(0, dp(42), 1f).apply { marginEnd = dp(4) })
    (manualPanel as LinearLayout).addView(
      compactTextButton(getString(R.string.resolve), getString(R.string.resolve)) { resolveManualSlug() },
      LinearLayout.LayoutParams(dp(76), dp(42)),
    )
    root.addView(manualPanel)

    candidates = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    candidatesScroll = ScrollView(this).apply {
      visibility = View.GONE
      isFillViewport = false
      isVerticalScrollBarEnabled = true
      addView(candidates)
    }
    root.addView(candidatesScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(136)))

    descriptionPanel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(2), 0, dp(3))
      val heading = LinearLayout(this@PureLinkInputMethodService).apply { gravity = Gravity.CENTER_VERTICAL }
      heading.addView(TextView(this@PureLinkInputMethodService).apply {
        text = getString(R.string.description)
        textSize = 12f
        setTextColor(color(R.color.ime_muted))
      }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      heading.addView(iconButton(R.drawable.ic_ime_edit, R.string.edit_description, R.color.ime_surface) {
        // Temporary QA instrumentation.
        Log.d(QA_TAG, "description pencil button tapped")
        editDescription()
      }, LinearLayout.LayoutParams(dp(34), dp(34)).apply { marginEnd = dp(2) })
      heading.addView(iconButton(R.drawable.ic_ime_clipboard, R.string.paste_description, R.color.ime_surface) { pasteDescription() }, LinearLayout.LayoutParams(dp(34), dp(34)))
      addView(heading)
      descriptionPreview = TextView(this@PureLinkInputMethodService).apply {
        textSize = 14f
        maxLines = 2
        ellipsize = android.text.TextUtils.TruncateAt.END
        gravity = Gravity.CENTER_VERTICAL
        background = roundedBackground(R.color.ime_surface)
        setPadding(dp(12), dp(3), dp(12), dp(3))
        contentDescription = getString(R.string.edit_description)
        setOnClickListener {
          // Temporary QA instrumentation.
          Log.d(QA_TAG, "description pencil button tapped")
          editDescription()
        }
      }
      addView(descriptionPreview, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(42)))
    }
    root.addView(descriptionPanel)
    renderDescriptionPreview()

    keyboardRows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    root.addView(keyboardRows)
    renderKeyboard()
    renderCandidates()
    return root
  }

  /** The lightweight top toolbar keeps only Clipboard, Share, and Account. */
  private fun topBar(): View = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    addView(iconButton(R.drawable.ic_ime_clipboard, R.string.resolve_clipboard, R.color.ime_surface) { parseClipboard() }, toolbarIconParams())
    addView(Space(this@PureLinkInputMethodService), LinearLayout.LayoutParams(0, dp(PureLinkImeLayout.toolbarIconSizeDp), 1f))
    shareButton = iconButton(R.drawable.ic_ime_share, R.string.share, R.color.ime_accent) { shareSelected() }
    addView(shareButton, toolbarIconParams())
    addView(iconButton(R.drawable.ic_ime_account, R.string.account, R.color.ime_surface) { openAccount() }, toolbarIconParams(last = true))
  }

  private fun toolbarIconParams(last: Boolean = false) = LinearLayout.LayoutParams(dp(PureLinkImeLayout.toolbarIconSizeDp), dp(PureLinkImeLayout.toolbarIconSizeDp)).apply {
    if (!last) marginEnd = dp(PureLinkImeLayout.keyGapDp)
  }

  private fun activateManualMode() {
    mode = PureLinkImeMode.MANUAL
    inputState.focusManual()
    manualPanel.visibility = View.VISIBLE
    candidatesScroll.visibility = View.GONE
    descriptionPanel.visibility = View.GONE
    manualSlug.requestFocus()
    manualSlug.setSelection(manualSlug.length())
  }

  private fun showCandidateMode() {
    mode = PureLinkImeMode.CANDIDATES
    manualPanel.visibility = View.GONE
    candidatesScroll.visibility = View.VISIBLE
    descriptionPanel.visibility = View.VISIBLE
  }

  private fun parseClipboard() {
    val currentText = currentClipboardText() ?: return
    // currentText is not retained: only derived candidate rows enter this session model.
    applyResolution(PureLinkClipboardParser.parseCurrentText(currentText))
  }

  private fun pasteDescription() {
    val currentText = currentClipboardText() ?: return
    descriptionText = PureLinkDescriptionPaste.insert(descriptionText, descriptionText.length, descriptionText.length, currentText)
    renderDescriptionPreview()
  }

  private fun editDescription() {
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "editDescription entered")
    Log.d(QA_TAG, "about to call sessionGate.beginOperation from editDescription")
    val operation = sessionGate.beginOperation()
    if (operation == null) {
      Log.d(QA_TAG, "description operation rejected")
      return
    }
    Log.d(QA_TAG, "description operation created")
    descriptionOperation = operation
    transientActivity.begin(PureLinkOwnedActivity.DESCRIPTION_EDITOR, operation)
    try {
      // The editor must use the user's ordinary IME, not this resolver keyboard.
      if (android.os.Build.VERSION.SDK_INT >= 28) {
        Log.d(QA_TAG, "before switchToPreviousInputMethod for description")
        val switched = switchToPreviousInputMethod()
        Log.d(QA_TAG, "after switchToPreviousInputMethod for description result=$switched")
      }
      Log.d(QA_TAG, "before launching DescriptionEditorActivity")
      startActivity(Intent(this, DescriptionEditorActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(DescriptionEditorActivity.EXTRA_RESULT_RECEIVER, descriptionReceiver)
        putExtra(DescriptionEditorActivity.EXTRA_OPERATION, operation)
        putExtra(DescriptionEditorActivity.EXTRA_INITIAL_DESCRIPTION, descriptionText)
      })
    } catch (_: ActivityNotFoundException) {
      transientActivity.clear()
      descriptionOperation = null
      showStatus(R.string.description_editor_unavailable, error = true)
    }
  }

  private fun currentClipboardText(): String? {
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    if (!clipboard.hasPrimaryClip()) {
      showStatus(R.string.clipboard_empty, error = true)
      return null
    }
    val clip = clipboard.primaryClip ?: run { showStatus(R.string.clipboard_empty, error = true); return null }
    val clipDescription = clip.description
    val textMimeType = clipDescription?.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) == true ||
      clipDescription?.filterMimeTypes("text/*")?.isNotEmpty() == true
    if (!textMimeType) {
      showStatus(R.string.clipboard_not_text, error = true)
      return null
    }
    val text = (0 until clip.itemCount).mapNotNull { itemIndex ->
      clip.getItemAt(itemIndex).text?.toString() ?: clip.getItemAt(itemIndex).htmlText
    }.joinToString("\n")
    if (text.isBlank()) {
      showStatus(R.string.clipboard_empty, error = true)
      return null
    }
    return text
  }

  private fun resolveManualSlug() {
    applyResolution(uk.no_no.purelink.core.PureLinkCandidateChooser.resolveManual(manualSlug.text))
    manualSlug.text.clear()
  }

  private fun applyResolution(resolution: PureLinkResolution) {
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "about to call sessionGate.beginNewSessionState from applyResolution")
    sessionGate.beginNewSessionState()
    transientActivity.clear()
    val found = when (resolution) {
      PureLinkResolution.Empty -> emptyList()
      is PureLinkResolution.Single -> listOf(resolution.candidate)
      is PureLinkResolution.Multiple -> resolution.candidates
    }
    selections.replace(found)
    pendingCardUrl = null
    creatingCard = false
    verificationOperation = null
    descriptionOperation = null
    descriptionText = ""
    renderDescriptionPreview()
    if (found.isEmpty()) {
      showStatus(R.string.no_purelink_found, error = true)
      activateManualMode()
    } else {
      hideStatus()
      showCandidateMode()
    }
    renderCandidates()
  }

  private fun renderCandidates() {
    candidates.removeAllViews()
    renderDescriptionPreview()
    val rows = selections.rows()
    val hasRows = rows.isNotEmpty()
    if (hasRows && mode == PureLinkImeMode.CANDIDATES) {
      candidatesScroll.visibility = View.VISIBLE
      descriptionPanel.visibility = View.VISIBLE
    } else if (!hasRows) {
      candidatesScroll.visibility = View.GONE
      descriptionPanel.visibility = View.GONE
    }
    setShareEnabled(!creatingCard && (pendingCardUrl != null || rows.any { it.selected }))
    if (!hasRows) return

    candidates.addView(candidateControls(rows))
    rows.forEachIndexed { index, row -> candidates.addView(candidateRow(index, row, rows.size > 1)) }
  }

  private fun candidateControls(rows: List<PureLinkSelection>): View = LinearLayout(this).apply {
    gravity = Gravity.START or Gravity.CENTER_VERTICAL
    setPadding(0, 0, 0, dp(2))
    val delete = iconButton(R.drawable.ic_ime_clear, R.string.delete_selected_candidates, R.color.ime_surface) { deleteSelectedCandidates() }.apply {
      isEnabled = !creatingCard && rows.any { it.selected }
      alpha = if (isEnabled) 1f else .45f
    }
    addView(delete, LinearLayout.LayoutParams(dp(34), dp(34)).apply { marginEnd = dp(6) })
    if (rows.size > 1) {
      addView(compactTextButton(getString(R.string.select_all), getString(R.string.select_all)) { selections.toggleSelectAll(); renderCandidates() }, compactActionParams())
      addView(compactTextButton(getString(R.string.preview_all), getString(R.string.preview_all)) { selections.togglePreviewForSelected(); renderCandidates() }, compactActionParams())
    }
    addView(Space(this@PureLinkInputMethodService), LinearLayout.LayoutParams(0, dp(34), 1f))
  }

  private fun compactActionParams() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(34)).apply { marginEnd = dp(2) }

  private fun deleteSelectedCandidates() {
    if (creatingCard || selections.removeSelected() == 0) return
    // A previously returned Card URL represents a different selection and must not be re-shared.
    pendingCardUrl = null
    val remaining = selections.rows()
    if (remaining.isEmpty()) {
      activateManualMode()
    } else {
      // A single remaining row is presented as the ordinary single-link share state.
      if (remaining.size == 1) selections.setSelected(0, true)
      showCandidateMode()
    }
    renderCandidates()
  }

  private fun candidateRow(index: Int, row: PureLinkSelection, showSelection: Boolean): View = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dp(6), dp(4), dp(5), dp(4))
    background = roundedBackground(R.color.ime_surface)
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(3) }
    if (showSelection) {
      addView(CheckBox(this@PureLinkInputMethodService).apply {
        isChecked = row.selected
        contentDescription = getString(R.string.select_purelink) + ": " + row.candidate.slug
        buttonTintList = ColorStateList.valueOf(color(R.color.ime_accent))
        setOnCheckedChangeListener { _, checked -> selections.setSelected(index, checked); renderCandidates() }
      }, LinearLayout.LayoutParams(dp(38), dp(38)))
    }
    addView(LinearLayout(this@PureLinkInputMethodService).apply {
      orientation = LinearLayout.VERTICAL
      addView(TextView(this@PureLinkInputMethodService).apply {
        text = row.candidate.label ?: getString(R.string.purelink_label)
        textSize = 11f
        setTextColor(color(R.color.ime_muted))
        maxLines = 1
        ellipsize = android.text.TextUtils.TruncateAt.END
      })
      addView(TextView(this@PureLinkInputMethodService).apply {
        text = row.candidate.slug
        textSize = 17f
        setTextColor(color(R.color.ime_text))
        maxLines = 1
        ellipsize = android.text.TextUtils.TruncateAt.END
      })
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    addView(compactTextButton(if (row.preview) "[+]" else "[ ]", getString(R.string.toggle_share_preview)) {
      selections.togglePreview(index)
      renderCandidates()
    }, LinearLayout.LayoutParams(dp(38), dp(36)).apply { marginStart = dp(2) })
    addView(iconButton(R.drawable.ic_ime_preview, R.string.preview, R.color.ime_surface_pressed) { open(row, preview = true) }, LinearLayout.LayoutParams(dp(36), dp(36)).apply { marginStart = dp(2) })
    addView(iconButton(R.drawable.ic_ime_open, R.string.open, R.color.ime_surface_pressed) { open(row, preview = false) }, LinearLayout.LayoutParams(dp(36), dp(36)).apply { marginStart = dp(2) })
  }

  private fun open(row: PureLinkSelection, preview: Boolean) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PureLinkResolver.urlFor(row.candidate, preview))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
      showStatus(R.string.no_url_handler, error = true)
    }
  }

  private fun shareSelected() {
    val selected = selections.selectedRows()
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "Share button tapped selectedRows=${selected.size} creatingCard=$creatingCard pendingCardUrl=${pendingCardUrl != null}")
    pendingCardUrl?.let {
      Log.d(QA_TAG, "share branch=existing pending Card")
      shareText(it)
      return
    }
    when (selected.size) {
      0 -> showStatus(R.string.no_selected_links, error = true)
      1 -> {
        Log.d(QA_TAG, "share branch=single-link share")
        shareText(PureLinkShareFormatter.formatSingle(selected.single(), descriptionText))
      }
      else -> {
        Log.d(QA_TAG, "share branch=native multi-link verification")
        // Temporary QA instrumentation keeps the existing branch contract: else -> startNativeVerification(selected)
        startNativeVerification(selected)
      }
    }
  }

  private fun startNativeVerification(selected: List<PureLinkSelection>) {
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "startNativeVerification entered")
    if (PureLinkShareFormatter.formatBundle(selected, descriptionText).length > 1000) {
      showStatus(R.string.bundle_too_long, error = true)
      return
    }
    Log.d(QA_TAG, "about to call sessionGate.beginOperation from startNativeVerification")
    val operation = sessionGate.beginOperation()
    if (operation == null) {
      Log.d(QA_TAG, "native verification operation rejected")
      return
    }
    Log.d(QA_TAG, "native verification operation created")
    verificationOperation = operation
    transientActivity.begin(PureLinkOwnedActivity.VERIFICATION, operation)
    creatingCard = true
    showStatus(R.string.verifying_card)
    renderCandidates()
    try {
      Log.d(QA_TAG, "before launching NativeVerificationActivity")
      startActivity(Intent(this, NativeVerificationActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(NativeVerificationActivity.EXTRA_RESULT_RECEIVER, verificationReceiver)
        putExtra(NativeVerificationActivity.EXTRA_OPERATION, operation)
        putExtra(NativeVerificationActivity.EXTRA_LOCALE, responseLocale())
      })
    } catch (_: ActivityNotFoundException) {
      transientActivity.clear()
      verificationOperation = null
      creatingCard = false
      showStatus(R.string.verification_failed, error = true)
      renderCandidates()
    }
  }

  private fun createBundleCard(nativeCreateToken: String, operation: Long) {
    if (!sessionGate.accepts(operation)) return
    val selected = selections.selectedRows()
    if (selected.size < 2) return
    val body = PureLinkShareFormatter.formatBundle(selected, descriptionText)
    if (body.length > 1000) {
      creatingCard = false
      showStatus(R.string.bundle_too_long, error = true)
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
          showStatus(R.string.card_creation_failed, error = true)
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
    // Surface success briefly without leaving a banner that dominates the compact keyboard.
    showTransientStatus(R.string.share_chooser_opened)
    true
  } catch (_: ActivityNotFoundException) {
    showStatus(R.string.no_url_handler, error = true)
    false
  }

  private fun openAccount() {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PureLinkWebsiteRoutes.accountUrl(responseLocale()))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
      showStatus(R.string.no_url_handler, error = true)
    }
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
    addCharacterRow(PureLinkImeKeys.digits)
    addCharacterRow(shiftState.displayed(PureLinkImeKeys.letterRows[0]))
    addCharacterRow(shiftState.displayed(PureLinkImeKeys.letterRows[1]), sideInsetDp = 14)
    addShiftRow()
    addBottomRow()
  }

  private fun addCharacterRow(characters: String, sideInsetDp: Int = 0) {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    if (sideInsetDp > 0) row.addView(Space(this), LinearLayout.LayoutParams(dp(sideInsetDp), dp(PureLinkImeLayout.keyHeightDp)))
    characters.forEachIndexed { index, character ->
      row.addView(characterKey(character.toString()) { type(character.toString()) }, keyParams(last = index == characters.lastIndex))
    }
    if (sideInsetDp > 0) row.addView(Space(this), LinearLayout.LayoutParams(dp(sideInsetDp), dp(PureLinkImeLayout.keyHeightDp)))
    keyboardRows.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(PureLinkImeLayout.keyHeightDp)).apply { bottomMargin = dp(2) })
  }

  private fun addShiftRow() {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    row.addView(iconButton(R.drawable.ic_ime_shift, R.string.key_shift, if (shiftState.mode == PureLinkShiftMode.LOWERCASE) R.color.ime_modifier else R.color.ime_accent) {
      shiftState.tapShift(System.currentTimeMillis())
      renderKeyboard()
    }, keyParams(weight = 1.35f))
    val letters = shiftState.displayed(PureLinkImeKeys.letterRows[2])
    letters.forEach { character -> row.addView(characterKey(character.toString()) { type(character.toString()) }, keyParams()) }
    row.addView(iconButton(R.drawable.ic_ime_backspace, R.string.key_backspace, R.color.ime_modifier) { backspace() }, keyParams(weight = 1.35f, last = true))
    keyboardRows.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(PureLinkImeLayout.keyHeightDp)).apply { bottomMargin = dp(2) })
  }

  private fun addBottomRow() {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    row.addView(iconButton(R.drawable.ic_ime_globe, R.string.switch_keyboard, R.color.ime_modifier) { switchKeyboard() }, keyParams(weight = 1.35f))
    row.addView(characterKey("_") { type("_") }, keyParams())
    row.addView(characterKey("-") { type("-") }, keyParams())
    row.addView(iconButton(R.drawable.ic_ime_enter, R.string.key_enter, R.color.ime_accent) { enter() }, keyParams(weight = 1.35f, last = true))
    keyboardRows.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(PureLinkImeLayout.keyHeightDp)))
  }

  private fun keyParams(weight: Float = 1f, last: Boolean = false) = LinearLayout.LayoutParams(0, dp(PureLinkImeLayout.keyHeightDp), weight).apply {
    if (!last) marginEnd = dp(PureLinkImeLayout.keyGapDp)
  }

  private fun characterKey(text: String, action: () -> Unit): Button = compactTextButton(text, text, R.color.ime_key, action).apply {
    setTextColor(color(R.color.ime_key_text))
    textSize = 16f
  }

  private fun compactTextButton(text: String, description: String, backgroundColor: Int = R.color.ime_surface, action: () -> Unit): Button = Button(this).apply {
    this.text = text
    contentDescription = description
    isAllCaps = false
    textSize = 12f
    minWidth = 0
    minimumWidth = 0
    minHeight = 0
    minimumHeight = 0
    setTextColor(color(R.color.ime_text))
    background = roundedBackground(backgroundColor)
    setPadding(dp(5), 0, dp(5), 0)
    setOnClickListener { action() }
  }

  private fun iconButton(drawable: Int, description: Int, backgroundColor: Int, action: () -> Unit): ImageButton = ImageButton(this).apply {
    setImageResource(drawable)
    contentDescription = getString(description)
    imageTintList = ColorStateList.valueOf(if (backgroundColor == R.color.ime_key) color(R.color.ime_key_text) else color(R.color.ime_text))
    background = roundedBackground(backgroundColor)
    scaleType = ImageView.ScaleType.CENTER
    setPadding(dp(8), dp(8), dp(8), dp(8))
    setOnClickListener { action() }
  }

  /** All generated key input stays in one of the service-owned fields; never in host editor text. */
  private fun type(value: String) {
    if (mode == PureLinkImeMode.MANUAL && inputState.target == PureLinkImeInputTarget.MANUAL) {
      insert(manualSlug, value)
      if (value.length == 1) shiftState.consumeCharacter(value[0])
    }
    renderKeyboard()
  }

  private fun backspace() {
    if (mode == PureLinkImeMode.MANUAL && inputState.target == PureLinkImeInputTarget.MANUAL) {
      deleteFrom(manualSlug)
    }
  }

  private fun enter() {
    if (mode == PureLinkImeMode.MANUAL && inputState.target == PureLinkImeInputTarget.MANUAL) {
      resolveManualSlug()
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
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "clearSession entered invalidate=$invalidate")
    if (invalidate) {
      // Temporary QA instrumentation.
      Log.d(QA_TAG, "about to call sessionGate.beginNewSessionState from clearSession invalidate=$invalidate")
      sessionGate.beginNewSessionState()
    }
    transientActivity.clear()
    selections.clear()
    pendingCardUrl = null
    creatingCard = false
    verificationOperation = null
    descriptionOperation = null
    shiftState.reset()
    descriptionText = ""
    renderDescriptionPreview()
    if (::manualSlug.isInitialized) manualSlug.text.clear()
    hideStatus()
    if (::candidates.isInitialized) renderCandidates()
    if (::manualPanel.isInitialized) activateManualMode()
  }

  private fun setShareEnabled(enabled: Boolean) {
    shareButton.isEnabled = enabled
    shareButton.alpha = if (enabled) 1f else .45f
  }

  private fun hideStatus() {
    if (::status.isInitialized) {
      status.text = ""
      status.visibility = View.GONE
    }
  }

  private fun showStatus(resource: Int, error: Boolean = false) {
    status.text = getString(resource)
    status.setTextColor(color(if (error) R.color.ime_error else R.color.ime_muted))
    status.visibility = View.VISIBLE
  }

  private fun renderDescriptionPreview() {
    if (!::descriptionPreview.isInitialized) return
    val empty = descriptionText.isBlank()
    descriptionPreview.text = if (empty) getString(R.string.description_hint) else descriptionText
    descriptionPreview.setTextColor(color(if (empty) R.color.ime_muted else R.color.ime_text))
  }

  private fun showTransientStatus(resource: Int) {
    showStatus(resource)
    val displayedText = status.text.toString()
    status.postDelayed({ if (status.text.toString() == displayedText) hideStatus() }, 2_000L)
  }

  private fun responseLocale(): String = if (resources.configuration.locales[0].language.equals("zh", ignoreCase = true)) "zh-Hant" else "en"

  private fun hasPendingActivity(): Boolean =
    transientActivity.ownsInputViewFinish() || verificationOperation != null || descriptionOperation != null

  private fun restoreInputMethod() {
    if (android.os.Build.VERSION.SDK_INT >= 28) {
      // Temporary QA instrumentation.
      Log.d(QA_TAG, "restore-input-method entered")
      restoringInputMethod = true
      val switched = switchToPreviousInputMethod()
      Log.d(QA_TAG, "restore-input-method switch result=$switched")
    }
  }

  private fun isSensitive(attribute: EditorInfo?): Boolean {
    val inputType = attribute?.inputType ?: return false
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
  }

  private fun roundedBackground(colorRes: Int): GradientDrawable = GradientDrawable().apply {
    setColor(color(colorRes))
    cornerRadius = dp(9).toFloat()
    setStroke(dp(1), color(R.color.ime_border))
  }

  private fun color(colorRes: Int): Int = getColor(colorRes)

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
