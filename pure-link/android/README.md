# PureLink Android tools

[繁體中文](README.zh-Hant.md)

PureLink Android tools resolve deliberately written, compact identifiers into the existing PureLink URLs without an account, an API request, or a keyboard replacement.

```text
PureLink: A3cd8
Link: Q9xK2
🔗: H72Ld
```

They are useful when a message or comment contains a short identifier but the host app does not make a useful part of its text selectable.

## What the app does

- Parses selected text through Android `ACTION_PROCESS_TEXT` when the source app offers it (Android 6.0 / API 23+).
- Parses text shared to the app with `ACTION_SEND`.
- Provides a fast manual resolver for a bare slug, a marked identifier, or a larger pasted passage.
- Provides a static launcher shortcut, **Resolve a PureLink**, that opens the manual resolver directly.
- Shows one result directly or a compact chooser for multiple results, in source order.
- Opens `https://no-no.uk/<slug>` or previews `https://no-no.uk/<slug>+` in the user's normal URL handler.

The app never changes PureLink's web semantics: `+` is appended to the end of a validated slug only for the preview action.

## Parser grammar

The parser accepts the current web custom-slug character rule: 1–30 ASCII letters, digits, `_`, and `-`; it also rejects web-reserved application paths such as `en` and `account`.

In shared or selected text, a deliberate marker is required so ordinary alphanumeric words are not treated as links:

- `PureLink:` and `Pure Link:` (case-insensitive)
- `Link:` (case-insensitive)
- `🔗:` or `🔗`

It accepts full-width `：`, full-width spaces, and surrounding whitespace. Manual entry additionally accepts one bare valid slug such as `A3cd8`. A line prefix such as `論文` in `論文 PureLink: A3cd8` is local display context only; it does not change the slug or the generated URL.

## Privacy and security

- Parsing and candidate selection are local to the device.
- The application declares **no Android permissions**, including no `INTERNET`, clipboard-history, storage, AccessibilityService, or background-service permission.
- It does not include analytics, advertising, crash telemetry, or network client libraries.
- Selected/shared text is parsed and immediately cleared from the input; only a candidate's local label and slug remain on the active screen. Nothing is saved in preferences, a database, or a clipboard history.
- The resolver constructs only HTTPS URLs on `no-no.uk` from a validated slug. It rejects schemes, host/path injection, encoded or literal slash forms, controls, overlong values, and bare words in shared text.

Opening a candidate delegates to the user's browser or configured handler. The app itself does not fetch a PureLink and never sends surrounding text to PureLink.

## Build and test

Open `android/` in Android Studio with Android SDK Platform 35 and JDK 17, or use a compatible local Gradle installation:

```sh
cd android
gradle :core:test :app:assembleDebug
```

`core` has no Android dependency and contains the parser/resolver plus JUnit tests. `app` uses the Android platform view APIs and Kotlin only; no third-party UI or network library is included.

## Platform boundaries

The production app does **not** inject a candidate row into Samsung Keyboard, Gboard, or any other third-party IME. Android exposes a candidate view only to the active app's own `InputMethodService`, so doing that would require users to switch keyboards. The production MVP deliberately avoids that tradeoff.

There is no AccessibilityService in this app. Such a service can request active-window content only after explicit user enablement and sensitive content-retrieval capability; that is disproportionate to a resolver and can expose unrelated screen text. The manual resolver remains the privacy-preserving path for non-selectable text.

See [platform notes](docs/PLATFORM.md) for API feasibility, the optional future IME prototype boundary, and manual Samsung/Gboard QA.
