# PureLink Android keyboard

[繁體中文](README.zh-Hant.md)

PureLink is a small **auxiliary Android input method** for resolving deliberately shared PureLink references. It is not a replacement for Samsung Keyboard, Gboard, or a complete Chinese/English keyboard.

## Intended workflow

1. Copy text containing a marked PureLink reference or a complete `https://no-no.uk/<slug>` URL.
2. Switch the input method to **PureLink keyboard**.
3. Press its single **Clipboard** button. PureLink reads only the current text clip, parses it locally, and never inserts the raw clipboard into the editor.
4. Select detected links and optionally set their `+ Preview` state.
5. Optionally enter a one-time description (up to about 280 Unicode characters).
6. Press **Share**:
   - one selected link shares ordinary text directly through Android’s share sheet;
   - two or more selected links create one PureLink Card and share only that public Card URL.
7. Switch back to Samsung Keyboard or Gboard immediately with the keyboard switch button.

The setup Activity shows whether the keyboard is enabled, opens Android’s input-method settings, opens the input-method picker, and remains a manual resolver and `ACTION_SEND` / `ACTION_PROCESS_TEXT` fallback.

## What the keyboard includes

- A compact A–Z/a–z, 0–9, `_`, and `-` key layout with Shift, Backspace, and Enter.
- One explicit Clipboard / Parse action; there is no separate paste action.
- Compact candidate rows, source order preserved, with Select All and `+ All` for multiple matches.
- Open and Preview actions that only construct `https://no-no.uk/<slug>` and `https://no-no.uk/<slug>+`.
- A normal Android share-sheet action and a keyboard-switch button.

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

For one selected candidate, PureLink shares only the optional description, local label, and safe public URL, separated by blank lines. It does not create a Card.

For two or more selected candidates, it sends only the final user-approved Card body to the existing `https://no-no.uk/api/links` anonymous-card endpoint. The body contains the optional description and selected labels/public PureLink URLs in source order; no destination URL, formula source, card text, original clipboard text, or management credential is shared. The app shares only the returned public Card URL. A failed Card creation leaves selection and description in the active session for retry.

Network access is therefore declared solely for explicit multi-link Card creation. There is no automatic lookup and no background request. The existing server-side anti-abuse and rate-limit rules remain authoritative; the keyboard does not bypass them.

The current public create endpoint requires the same Turnstile proof as web creation. This native client deliberately has no bypass or embedded attestation workaround, so a production deployment needs a separately configured, equally protective mobile Turnstile/attestation handoff before multi-link Card creation can complete end-to-end. Local parsing and single-link sharing are unaffected; a rejected Card request keeps the session available for retry.

Raw clipboard text is discarded after parsing. The app keeps only ephemeral candidates, selection/preview flags, an optional current description, and (briefly, if needed to retry the share sheet) a returned public Card URL. It does not persist clipboard text, descriptions, candidates, management credentials, or history. The description is not stored separately: for a successful multi-link share it becomes part of the user-created Card body.

`ACTION_PROCESS_TEXT` reads `Intent.EXTRA_PROCESS_TEXT`, returns `RESULT_CANCELED`, and supplies no replacement text, so it never modifies the source app’s selection. Availability depends on the source application’s selection UI.

## Build and test

Open `android/` in Android Studio with Android SDK Platform 35 and JDK 17, or run:

```sh
cd android
./gradlew :core:test :app:assembleDebug
```

`core` holds the parser, selection model, and share formatter JVM tests. `app` contains the InputMethodService and setup Activity, using only Kotlin and Android platform APIs—no third-party UI, analytics, or network library.

See [platform notes](docs/PLATFORM.md) for registration details and device QA.
