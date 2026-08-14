package uk.no_no.purelink.tools

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import uk.no_no.purelink.core.PureLinkCandidate
import uk.no_no.purelink.core.PureLinkCandidateChooser
import uk.no_no.purelink.core.PureLinkResolution
import uk.no_no.purelink.core.PureLinkResolver

/** Setup/settings surface and manual fallback; the auxiliary IME is the primary workflow. */
class MainActivity : Activity() {
  private lateinit var input: EditText
  private lateinit var results: LinearLayout
  private lateinit var imeStatus: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(buildContent())
    handleIncomingIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    if (::imeStatus.isInitialized) updateImeStatus()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIncomingIntent(intent)
  }

  override fun onDestroy() {
    if (::input.isInitialized) input.text.clear()
    super.onDestroy()
  }

  private fun buildContent(): View {
    val padding = dp(20)
    val root = ScrollView(this)
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding, padding, padding)
    }
    root.addView(content)

    content.addView(heading(getString(R.string.setup_title)))
    content.addView(body(getString(R.string.setup_intro), bottom = 10))
    imeStatus = body("")
    content.addView(imeStatus)
    content.addView(Button(this).apply {
      text = getString(R.string.enable_keyboard)
      setOnClickListener { startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)) }
    })
    content.addView(Button(this).apply {
      text = getString(R.string.switch_keyboard)
      setOnClickListener {
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
      }
    })
    content.addView(heading(getString(R.string.manual_fallback_title), top = 22))
    content.addView(body(getString(R.string.resolver_intro), bottom = 10))
    input = EditText(this).apply {
      hint = getString(R.string.input_hint)
      minLines = 3
      maxLines = 7
      filters = arrayOf(InputFilter.LengthFilter(4096))
      setTextColor(Color.rgb(25, 35, 29))
    }
    content.addView(input, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    content.addView(Button(this).apply {
      text = getString(R.string.find_purelinks)
      setOnClickListener { resolveManualText(input.text) }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    content.addView(results, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14) })
    updateImeStatus()
    return root
  }

  private fun updateImeStatus() {
    val enabled = (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
      .enabledInputMethodList
      .any { it.id == ComponentName(this, PureLinkInputMethodService::class.java).flattenToString() }
    imeStatus.text = getString(if (enabled) R.string.ime_enabled else R.string.ime_disabled)
  }

  private fun showResolution(resolution: PureLinkResolution) {
    results.removeAllViews()
    when (resolution) {
      PureLinkResolution.Empty -> results.addView(body(getString(R.string.no_match)))
      is PureLinkResolution.Single -> {
        results.addView(body(getString(R.string.single_match)))
        results.addView(candidateView(resolution.candidate))
      }
      is PureLinkResolution.Multiple -> {
        results.addView(body(getString(R.string.select_purelink)))
        resolution.candidates.forEach { results.addView(candidateView(it)) }
      }
    }
  }

  private fun resolveManualText(text: CharSequence) = showResolution(PureLinkCandidateChooser.resolveManual(text))

  private fun resolveIncomingText(text: CharSequence) {
    showResolution(PureLinkCandidateChooser.resolveIncoming(text))
    input.text.clear()
  }

  private fun candidateView(candidate: PureLinkCandidate): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(12), dp(12), dp(12))
      setBackgroundColor(Color.rgb(237, 246, 239))
    }
    row.addView(TextView(this).apply { text = candidate.label ?: getString(R.string.purelink_label); textSize = 14f })
    row.addView(TextView(this).apply { text = candidate.slug; textSize = 22f; setTextColor(Color.rgb(28, 74, 48)) })
    row.addView(LinearLayout(this).apply {
      gravity = Gravity.END
      addView(actionButton(getString(R.string.preview), candidate, preview = true))
      addView(actionButton(getString(R.string.open), candidate, preview = false))
    })
    return row
  }

  private fun actionButton(label: String, candidate: PureLinkCandidate, preview: Boolean): Button = Button(this).apply {
    text = label
    setOnClickListener { open(candidate, preview) }
  }

  private fun open(candidate: PureLinkCandidate, preview: Boolean) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PureLinkResolver.urlFor(candidate, preview))))
    } catch (_: ActivityNotFoundException) {
      results.addView(body(getString(R.string.no_url_handler)))
    }
  }

  private fun handleIncomingIntent(intent: Intent) {
    when (intent.action) {
      Intent.ACTION_SEND -> intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.let(::resolveIncomingText)
      Intent.ACTION_PROCESS_TEXT -> {
        // Resolver-only: no replacement text ever returns to the source application.
        setResult(RESULT_CANCELED)
        intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.let(::resolveIncomingText)
      }
    }
  }

  private fun heading(value: String, top: Int = 0): TextView = TextView(this).apply {
    text = value
    textSize = 24f
    setTextColor(Color.rgb(34, 53, 42))
    setPadding(0, dp(top), 0, dp(8))
  }

  private fun body(value: String, bottom: Int = 8): TextView = TextView(this).apply {
    text = value
    textSize = 16f
    setPadding(0, 0, 0, dp(bottom))
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
