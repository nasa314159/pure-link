package uk.no_no.purelink.tools

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import uk.no_no.purelink.core.PureLinkCandidate
import uk.no_no.purelink.core.PureLinkCandidateChooser
import uk.no_no.purelink.core.PureLinkResolution
import uk.no_no.purelink.core.PureLinkResolver

class MainActivity : Activity() {
  private lateinit var input: EditText
  private lateinit var results: LinearLayout

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(buildContent())
    incomingText(intent)?.let(::resolveIncomingText)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    incomingText(intent)?.let(::resolveIncomingText)
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

    content.addView(TextView(this).apply {
      text = getString(R.string.resolver_title)
      textSize = 26f
      setTextColor(Color.rgb(34, 53, 42))
    })
    content.addView(TextView(this).apply {
      text = getString(R.string.resolver_intro)
      setPadding(0, dp(8), 0, dp(14))
    })
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
      setOnClickListener { resolve(input.text) }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    content.addView(results, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14) })
    return root
  }

  private fun resolve(text: CharSequence) {
    results.removeAllViews()
    when (val resolution = PureLinkCandidateChooser.resolve(text)) {
      PureLinkResolution.Empty -> results.addView(message(getString(R.string.no_match)))
      is PureLinkResolution.Single -> {
        results.addView(message(getString(R.string.single_match)))
        results.addView(candidateView(resolution.candidate))
      }
      is PureLinkResolution.Multiple -> {
        results.addView(message(getString(R.string.select_purelink)))
        resolution.candidates.forEach { results.addView(candidateView(it)) }
      }
    }
  }

  private fun resolveIncomingText(text: CharSequence) {
    resolve(text)
    input.text.clear()
  }

  private fun candidateView(candidate: PureLinkCandidate): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(12), dp(12), dp(12))
      setBackgroundColor(Color.rgb(237, 246, 239))
    }
    row.addView(TextView(this).apply {
      text = candidate.label ?: getString(R.string.purelink_label)
      textSize = 14f
    })
    row.addView(TextView(this).apply {
      text = candidate.slug
      textSize = 22f
      setTextColor(Color.rgb(28, 74, 48))
    })
    row.addView(LinearLayout(this).apply {
      gravity = Gravity.END
      addView(actionButton(getString(R.string.preview), candidate, preview = true))
      addView(actionButton(getString(R.string.open), candidate, preview = false))
    })
    return row.apply { setPadding(dp(12), dp(12), dp(12), dp(12)) }
  }

  private fun actionButton(label: String, candidate: PureLinkCandidate, preview: Boolean): Button = Button(this).apply {
    text = label
    setOnClickListener { open(candidate, preview) }
  }

  private fun open(candidate: PureLinkCandidate, preview: Boolean) {
    val url = PureLinkResolver.urlFor(candidate, preview)
    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
  }

  private fun message(value: String): TextView = TextView(this).apply {
    text = value
    textSize = 16f
    setPadding(0, 0, 0, dp(8))
  }

  private fun incomingText(intent: Intent): CharSequence? = when (intent.action) {
    Intent.ACTION_SEND -> intent.getCharSequenceExtra(Intent.EXTRA_TEXT)
    Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)
    else -> null
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
