package uk.no_no.purelink.tools

import org.json.JSONObject
import uk.no_no.purelink.core.PureLinkParser
import uk.no_no.purelink.core.PureLinkResolver
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Minimal native client for the existing anonymous card endpoint. It posts only the final,
 * user-approved bundle body and retains no response fields beyond the public URL.
 */
class PureLinkCardClient(
  private val endpoint: String = "https://no-no.uk/api/links",
) {
  fun createCard(body: String, locale: String): Result<String> = runCatching {
    val connection = (URL(endpoint).openConnection() as? HttpsURLConnection)
      ?: error("PureLink requires HTTPS")
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 12_000
      connection.readTimeout = 12_000
      connection.doOutput = true
      connection.setRequestProperty("content-type", "application/json; charset=utf-8")
      connection.setRequestProperty("x-purelink-locale", locale)
      val payload = JSONObject().put("contentType", "card").put("content", body).toString()
      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(payload) }
      val responseText = BufferedReader(InputStreamReader(
        (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream)
          ?: error("PureLink did not return a response"),
        Charsets.UTF_8,
      )).use { it.readText() }
      val response = JSONObject(responseText)
      if (connection.responseCode !in 200..299) error(response.optString("error").ifBlank { "Card creation failed" })
      safePublicUrl(response.optString("url")) ?: error("PureLink did not return a public card URL")
    } finally {
      connection.disconnect()
    }
  }

  private fun safePublicUrl(value: String): String? {
    val slug = value.removePrefix("https://no-no.uk/")
    if (slug == value || !PureLinkParser.isValidSlug(slug)) return null
    return PureLinkResolver.urlFor(slug)
  }
}
