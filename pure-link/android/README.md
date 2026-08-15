# PureLink Android keyboard

[繁體中文](README.zh-Hant.md)

PureLink is a small **auxiliary Android input method** for resolving deliberately shared PureLink references. It is not a replacement for Samsung Keyboard, Gboard, or a complete Chinese/English keyboard.

## Intended workflow

1. Copy text containing a marked PureLink reference or a complete `https://no-no.uk/<slug>` URL.
2. Switch the input method to **PureLink keyboard**.
3. Its visible, focused **Manual slug** field is ready immediately. Type a bare valid slug there, or press **Clipboard** to read only the current text clip and parse it locally. PureLink never inserts either value into the editor behind the keyboard.
4. Select detected links and optionally set their `+ Preview` state.
5. Optionally enter a one-time description (up to about 280 Unicode characters).
6. Press **Share**:
   - one selected link shares ordinary text directly through Android’s share sheet;
   - two or more selected links briefly open a PureLink Turnstile verification window, create one PureLink Card after verification, and share only that public Card URL.
7. Switch back to Samsung Keyboard or Gboard immediately with the keyboard switch button.

The setup Activity shows whether the keyboard is enabled, opens Android’s input-method settings, opens the input-method picker, and remains a manual resolver and `ACTION_SEND` / `ACTION_PROCESS_TEXT` fallback.

## What the keyboard includes

- A compact dark, Samsung/Gboard-like A–Z/a–z, 0–9, `_`, and `-` layout: digits, QWERTY rows, Shift/Backspace, then Globe/`_`/`-`/Enter. It has no horizontal scrolling at 360dp, 412dp, or 480dp widths.
- Lowercase, one-shot Shift, and double-tap Caps Lock; a one-shot Shift is consumed only by the next letter.
- Direct icon actions for Clipboard, Manual, Globe, Share, and Account. Account opens the matching localized PureLink account page in the browser; it does not create native account state.
- One explicit Clipboard / Parse action plus a separate description-only paste control; it never parses pasted description text as candidates.
- Compact candidate rows, source order preserved, with Select All and `+ All` for multiple matches.
- Open and Preview actions that only construct `https://no-no.uk/<slug>` and `https://no-no.uk/<slug>+`.
- A normal Android share-sheet action, explicit **Clear** control, and a keyboard-switch button.

It deliberately has no language composition, predictions, autocorrect, learned vocabulary, suggestions, overlay, AccessibilityService, background service, analytics, advertising, or clipboard history.

## Parser grammar

The shared grammar is the web custom-slug rule: 1–30 ASCII letters, digits, `_`, and `-`, excluding web-reserved application routes such as `en`, `zh-Hant`, and `account`.

Clipboard, `ACTION_SEND`, and `ACTION_PROCESS_TEXT` require either a deliberate marker or a complete PureLink URL:

```text
PureLink: A3cd8
Pure Link: A3cd8
Link: Q9xK2
🔗: H72Ld
https://no-no.uk/A3cd8
https://no-no.uk/A3cd8+
```

Marker words are case-insensitive; ASCII/full-width colons, full-width spaces, surrounding whitespace, multiple candidates, and short local labels are supported. Complete URLs can be embedded in surrounding text. `http`, lookalike hosts, extra paths, encoded slashes, invalid characters, overlong slugs, and reserved routes are rejected.

Only direct manual entry (in the keyboard or setup Activity) may resolve one bare valid slug such as `A3cd8`. Clipboard and incoming text never treat ordinary words or bare slugs as candidates.

## Sharing and privacy

For one selected candidate, PureLink shares only the optional description, local label, and safe public URL. It does not create a Card or contact PureLink. Labels and URLs are adjacent lines; a description is separated from that item by one blank line.

For two or more selected candidates, **Share** opens a transient WebView at exactly `https://no-no.uk/native/verify`. It enables JavaScript and DOM storage only for Cloudflare Turnstile, permits only the fixed PureLink challenge/API routes and `challenges.cloudflare.com`, and exposes no JavaScript interface. The WebView receives neither clipboard text nor the Card body. After server-side Turnstile verification for `no-no.uk` and the dedicated `native-card-create` action, PureLink returns a 2-minute, opaque, single-use native Card token through a strict `purelink-native://verified?token=…` callback. Android validates that callback and sends only the final user-approved Card body plus that token to `https://no-no.uk/api/native/cards`.

The native endpoint accepts only Card content and the one-time token; it cannot create URLs or formulas, set custom slugs/options, or return a management credential. The server stores only an irreversible token hash, expiry, and used state, cleans up expired rows opportunistically, atomically consumes a token before Card creation, and returns only the public Card URL. A verified token is intentionally burned if a later Card insertion fails, which prevents replay. The Card body contains the optional description and selected labels/public PureLink URLs in source order; no destination URL, formula source, existing Card content, original clipboard text, or management credential is shared.

Canceling or failing verification, an unavailable network, or a failed Card creation leaves selection, `+` states, and description in the active session for retry. Async verification/Card results are discarded after a new parse or finished IME session, so they cannot later open a share sheet. Network access is declared solely for this explicit multi-link Card creation; there is no automatic lookup or background request. `INTERNET` is a normal manifest permission and never produces a runtime prompt. The existing server-side anti-abuse and rate-limit rules remain authoritative.

The deployed Worker must include the native verification page, `/api/native/challenge/complete`, `/api/native/cards`, the native-token D1 migration, and a Turnstile configuration for the `native-card-create` action. Without those deployed routes/configuration, multi-link sharing correctly fails after the verification attempt while local parsing and single-link sharing remain available.

Opening Android’s chooser does not prove that a recipient accepted or delivered a message. PureLink therefore preserves the session, including a returned Card URL, until the user explicitly chooses **Clear** or the IME session ends.

Raw clipboard text is discarded after parsing. The app keeps only ephemeral candidates, selection/preview flags, an optional current description, and (briefly, if needed to retry the share sheet) a returned public Card URL. It does not persist clipboard text, descriptions, candidates, management credentials, or history. The description is not stored separately: for a successful multi-link share it becomes part of the user-created Card body.

`ACTION_PROCESS_TEXT` reads `Intent.EXTRA_PROCESS_TEXT`, returns `RESULT_CANCELED`, and supplies no replacement text, so it never modifies the source app’s selection. Availability depends on the source application’s selection UI.

## Build and test

Open `android/` in Android Studio with Android SDK Platform 35 and JDK 17, or run:

```sh
cd android
./gradlew :core:test :app:testDebugUnitTest :app:assembleDebug
```

`core` holds the parser, selection model, and share formatter JVM tests. `app` contains the InputMethodService and setup Activity, using only Kotlin and Android platform APIs—no third-party UI, analytics, or network library.

See [platform notes](docs/PLATFORM.md) for registration details and device QA.
