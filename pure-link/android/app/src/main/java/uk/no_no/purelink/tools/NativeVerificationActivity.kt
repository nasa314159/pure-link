package uk.no_no.purelink.tools

import android.app.Activity
import android.os.Bundle
import android.os.ResultReceiver
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream

/** A short-lived Turnstile-only surface. No JavaScript interface, clipboard, or Card body enters it. */
class NativeVerificationActivity : Activity() {
  private var delivered = false
  private lateinit var webView: WebView

  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  private fun receiver(): ResultReceiver? = intent.getParcelableExtra(EXTRA_RESULT_RECEIVER)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      settings.setSupportMultipleWindows(false)
      settings.javaScriptCanOpenWindowsAutomatically = false
      webViewClient = NativeWebViewClient()
    }
    setContentView(webView)
    webView.loadUrl(NativeVerificationPolicy.challengeUrl(intent.getStringExtra(EXTRA_LOCALE).orEmpty()))
  }

  @Deprecated("Use OnBackInvokedCallback on API 33+")
  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    complete(RESULT_CANCELED)
  }

  override fun onDestroy() {
    if (::webView.isInitialized) {
      webView.stopLoading()
      webView.clearHistory()
      webView.loadUrl("about:blank")
      webView.destroy()
    }
    if (!delivered) complete(RESULT_CANCELED)
    super.onDestroy()
  }

  private fun complete(resultCode: Int, nativeCreateToken: String? = null, error: String? = null) {
    if (delivered) return
    delivered = true
    val result = Bundle().apply {
      putLong(EXTRA_OPERATION, intent.getLongExtra(EXTRA_OPERATION, -1L))
      nativeCreateToken?.let { putString(EXTRA_NATIVE_CREATE_TOKEN, it) }
      error?.let { putString(EXTRA_ERROR, it) }
    }
    setResult(resultCode)
    receiver()?.send(resultCode, result)
    finish()
  }

  private inner class NativeWebViewClient : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = handleNavigation(request.url.toString())

    @Deprecated("Use the WebResourceRequest overload")
    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleNavigation(url)

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
      return if (NativeVerificationPolicy.isAllowedWebUrl(request.url.toString())) super.shouldInterceptRequest(view, request)
      else WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
      if (request.isForMainFrame) complete(RESULT_CANCELED)
    }

    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
      if (request.isForMainFrame && errorResponse.statusCode == 404) {
        complete(RESULT_ENDPOINT_UNAVAILABLE, error = ERROR_ENDPOINT_UNAVAILABLE)
      }
    }

    private fun handleNavigation(url: String): Boolean {
      NativeVerificationPolicy.callbackToken(url)?.let { token ->
        complete(RESULT_OK, token)
        return true
      }
      if (NativeVerificationPolicy.isCancellationCallback(url)) {
        complete(RESULT_CANCELED)
        return true
      }
      return !NativeVerificationPolicy.isAllowedWebUrl(url)
    }
  }

  companion object {
    const val EXTRA_RESULT_RECEIVER = "uk.no_no.purelink.tools.VERIFICATION_RECEIVER"
    const val EXTRA_OPERATION = "uk.no_no.purelink.tools.VERIFICATION_OPERATION"
    const val EXTRA_NATIVE_CREATE_TOKEN = "uk.no_no.purelink.tools.NATIVE_CREATE_TOKEN"
    const val EXTRA_LOCALE = "uk.no_no.purelink.tools.VERIFICATION_LOCALE"
    const val EXTRA_ERROR = "uk.no_no.purelink.tools.VERIFICATION_ERROR"
    const val ERROR_ENDPOINT_UNAVAILABLE = "endpoint-unavailable"
    const val RESULT_ENDPOINT_UNAVAILABLE = Activity.RESULT_FIRST_USER + 1
  }
}
