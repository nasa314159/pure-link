package uk.no_no.purelink.tools

import java.net.URI

/** URL policy for the transient Turnstile WebView. It is intentionally not a general browser. */
object NativeVerificationPolicy {
  private const val pureLinkHost = "no-no.uk"
  private const val turnstileHost = "challenges.cloudflare.com"
  private val tokenPattern = Regex("^[A-Za-z0-9_-]{43}$")

  fun challengeUrl(locale: String): String {
    val supportedLocale = if (locale == "zh-Hant") "zh-Hant" else "en"
    return "https://$pureLinkHost/native/verify?locale=$supportedLocale"
  }

  fun isAllowedWebUrl(value: String): Boolean {
    return try {
      val uri = URI(value)
      if (uri.scheme?.lowercase() != "https" || uri.port != -1 || uri.userInfo != null) return false
      when (uri.host?.lowercase()) {
        pureLinkHost -> uri.path == "/native/verify" || uri.path == "/api/native/challenge/complete"
        // Turnstile owns its iframe and supporting resources beneath this fixed HTTPS host.
        turnstileHost -> true
        else -> false
      }
    } catch (_: Exception) {
      false
    }
  }

  fun callbackToken(value: String): String? {
    return try {
      val uri = URI(value)
      if (uri.scheme?.lowercase() != "purelink-native" || uri.host?.lowercase() != "verified" ||
        uri.port != -1 || uri.userInfo != null || !uri.path.isNullOrEmpty() || uri.fragment != null) return null
      val query = uri.rawQuery ?: return null
      val parts = query.split('&')
      if (parts.size != 1 || !parts.single().startsWith("token=")) return null
      parts.single().removePrefix("token=").takeIf { tokenPattern.matches(it) }
    } catch (_: Exception) {
      null
    }
  }

  fun isCancellationCallback(value: String): Boolean = try {
    val uri = URI(value)
    uri.scheme?.lowercase() == "purelink-native" && uri.host?.lowercase() == "cancel" &&
      uri.port == -1 && uri.userInfo == null && uri.path.isNullOrEmpty() && uri.rawQuery == null && uri.fragment == null
  } catch (_: Exception) {
    false
  }
}
