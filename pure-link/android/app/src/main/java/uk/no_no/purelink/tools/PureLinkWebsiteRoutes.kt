package uk.no_no.purelink.tools

/** Routes implemented by the public PureLink website. */
object PureLinkWebsiteRoutes {
  fun accountUrl(locale: String): String {
    val supportedLocale = if (locale == "zh-Hant") "zh-Hant" else "en"
    return "https://no-no.uk/$supportedLocale/account"
  }
}
