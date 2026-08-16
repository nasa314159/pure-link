package uk.no_no.purelink.tools

import android.app.Activity
import android.os.Bundle
import android.os.ResultReceiver
import android.util.Log
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import uk.no_no.purelink.core.PureLinkShareFormatter

/** A private, one-time description editor that intentionally uses the user's normal system IME. */
class DescriptionEditorActivity : Activity() {
  private var delivered = false
  private var restoredDescription: String? = null
  private lateinit var input: EditText
  private lateinit var counter: TextView

  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  private fun receiver(): ResultReceiver? = intent.getParcelableExtra(EXTRA_RESULT_RECEIVER)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "DescriptionEditorActivity onCreate")
    restoredDescription = savedInstanceState?.getString(SAVED_DESCRIPTION)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
    setContentView(buildContent())
    input.post {
      input.requestFocus()
      (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
        .showSoftInput(input, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
    }
  }

  override fun onResume() {
    super.onResume()
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "DescriptionEditorActivity onResume")
  }

  override fun onPause() {
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "DescriptionEditorActivity onPause")
    super.onPause()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    outState.putString(SAVED_DESCRIPTION, input.text.toString())
    super.onSaveInstanceState(outState)
  }

  @Deprecated("Use OnBackInvokedCallback on API 33+")
  @Suppress("DEPRECATION")
  override fun onBackPressed() = complete(RESULT_CANCELED)

  override fun onDestroy() {
    // Temporary QA instrumentation.
    Log.d(QA_TAG, "DescriptionEditorActivity onDestroy")
    // Rotation recreates the editor; it is not an explicit user cancellation.
    if (!delivered && isFinishing) complete(RESULT_CANCELED)
    super.onDestroy()
  }

  private fun buildContent(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(20), dp(20), dp(16))
    }
    root.addView(TextView(this).apply {
      text = getString(R.string.description_editor_title)
      textSize = 24f
      setPadding(0, 0, 0, dp(10))
    })
    input = EditText(this).apply {
       val initial = PureLinkDescriptionEditor.initialText(restoredDescription ?: intent.getStringExtra(EXTRA_INITIAL_DESCRIPTION))
      setText(initial)
      setSelection(initial.length)
      hint = getString(R.string.description_hint)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
      gravity = Gravity.TOP or Gravity.START
      minLines = 7
      maxLines = 12
      filters = arrayOf(CodePointLengthFilter(PureLinkShareFormatter.maxDescriptionCodePoints))
      addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = updateCounter(s)
        override fun afterTextChanged(s: Editable?) = Unit
      })
    }
    root.addView(input, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    counter = TextView(this).apply {
      gravity = Gravity.END
      textSize = 12f
      setPadding(0, dp(8), 0, dp(8))
    }
    root.addView(counter)
    updateCounter(input.text)
    root.addView(LinearLayout(this).apply {
      gravity = Gravity.END
      addView(Button(this@DescriptionEditorActivity).apply {
        text = getString(R.string.cancel)
        setOnClickListener { complete(RESULT_CANCELED) }
      })
      addView(Button(this@DescriptionEditorActivity).apply {
        text = getString(R.string.done)
        setOnClickListener { complete(RESULT_OK, PureLinkDescriptionEditor.done(input.text)) }
      })
    })
    return root
  }

  private fun updateCounter(value: CharSequence?) {
    if (::counter.isInitialized) {
      counter.text = getString(R.string.description_count, PureLinkDescriptionEditor.codePointCount(value), PureLinkShareFormatter.maxDescriptionCodePoints)
    }
  }

  private fun complete(resultCode: Int, description: String? = null) {
    if (delivered) return
    // Temporary QA instrumentation.
    Log.d(QA_TAG, if (resultCode == RESULT_OK) "DescriptionEditorActivity Done action" else "DescriptionEditorActivity Cancel action")
    delivered = true
    val result = Bundle().apply {
      putLong(EXTRA_OPERATION, intent.getLongExtra(EXTRA_OPERATION, -1L))
      description?.let { putString(EXTRA_DESCRIPTION, it) }
    }
    setResult(resultCode)
    receiver()?.send(resultCode, result)
    finish()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val QA_TAG = "PureLinkQA"
    const val EXTRA_RESULT_RECEIVER = "uk.no_no.purelink.tools.DESCRIPTION_RECEIVER"
    const val EXTRA_OPERATION = "uk.no_no.purelink.tools.DESCRIPTION_OPERATION"
    const val EXTRA_INITIAL_DESCRIPTION = "uk.no_no.purelink.tools.INITIAL_DESCRIPTION"
    const val EXTRA_DESCRIPTION = "uk.no_no.purelink.tools.DESCRIPTION"
    private const val SAVED_DESCRIPTION = "uk.no_no.purelink.tools.SAVED_DESCRIPTION"
  }
}
