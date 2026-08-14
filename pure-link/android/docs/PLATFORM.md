# Android platform notes and device QA

[繁體中文](PLATFORM.zh-Hant.md)

## Input method architecture

`PureLinkInputMethodService` is registered as an Android `InputMethodService` with the required `android.permission.BIND_INPUT_METHOD`, `android.view.InputMethod` intent filter, and `res/xml/method.xml` metadata. Android’s normal settings and input-method picker control enablement and selection; no Samsung- or Gboard-specific API is used.

The service is an auxiliary resolver keyboard. It never reads surrounding editor text, creates predictions, learns input, or observes the clipboard. It checks password/sensitive editor metadata only to discard its own ephemeral session; it does not read editor content. The only clipboard read occurs after the user presses the one Clipboard button, and only the current primary textual clip is considered.

The keyboard’s globe action uses `shouldOfferSwitchingToNextInputMethod()` / `switchToNextInputMethod()` and falls back to Android’s input-method picker. The setup Activity opens `ACTION_INPUT_METHOD_SETTINGS` and the picker for the same purpose.

`ACTION_PROCESS_TEXT` remains available from API 23. It reads `Intent.EXTRA_PROCESS_TEXT` only when a source app exposes the action, returns `RESULT_CANCELED`, and returns no replacement extra. `ACTION_SEND` receives deliberately shared text. Both are marker/full-URL-only input paths; bare slugs are restricted to direct manual input.

## Network boundary

The manifest declares `INTERNET` solely for an explicit two-or-more-selected-link Card creation. One selected link is shared locally and does not contact PureLink. For two or more selected links, the IME first starts a transient `NativeVerificationActivity` with a small WebView at exactly `https://no-no.uk/native/verify?locale=en|zh-Hant`. JavaScript and DOM storage are enabled only because Cloudflare Turnstile requires them; the default WebView user agent is unchanged. The WebView permits the fixed PureLink verification/API paths plus the fixed HTTPS `challenges.cloudflare.com` Turnstile host, blocks arbitrary navigation, exposes no JavaScript interface, and receives neither clipboard text nor a Card body.

The verification page posts the raw Turnstile response only to `/api/native/challenge/complete`. The Worker checks Turnstile server-side for success, hostname `no-no.uk`, and action `native-card-create`, then issues a random opaque native-create token with a two-minute TTL. D1 stores only its SHA-256 hash, expiry, and used timestamp; expired rows are cleaned up opportunistically when new tokens are issued. The verified page returns only a strict 43-character base64url token in `purelink-native://verified?token=…`; the Activity intercepts it, validates it, sends it through an in-process `ResultReceiver`, then destroys its WebView. No raw Turnstile token reaches the IME.

Only after that verification does the native request use `HttpsURLConnection` to post:

```json
{ "content": "final user-approved Card body", "nativeCreateToken": "short-lived opaque token" }
```

to the fixed HTTPS `https://no-no.uk/api/native/cards` endpoint. That narrow endpoint rejects extra fields, forces Card creation, atomically marks the token used with D1 `UPDATE … WHERE used_at IS NULL AND expires_at > ? RETURNING`, creates at most one Card, and returns only a public URL. A later insert failure intentionally leaves the token consumed to prevent replay. It never sends or returns the original clipboard text, surrounding editor text, a destination URL, formula source, existing Card content, analytics, or a management credential.

No type/existence lookup is currently made. Candidate rows correctly say **Unverified** rather than asserting that a syntactically valid slug exists. This avoids a second network endpoint and keeps local parsing fully functional offline.

Cancel/failure leaves the candidates, selections, `+` state, and description intact for retry. A generation gate discards verification and Card results after a new parse or finished IME session. The app does not claim that launching Android’s chooser proves delivery; it preserves the session until explicit **Clear** or normal IME teardown.

## Manual device QA

1. Install the debug APK, open PureLink setup, confirm the disabled status, choose **Enable PureLink keyboard**, enable it in Android settings, return, and confirm the enabled status.
2. Use **Switch keyboard** or Android’s picker to select PureLink. Confirm it presents only compact slug keys, Shift, Backspace, Enter, Clipboard, share, and the switch button—not a full language keyboard.
3. In a normal editable field, enter `A3cd8` through PureLink’s manual-slug field and resolve it. Confirm a safe candidate appears. Use **Open** and **+ Preview** and confirm the browser receives only `https://no-no.uk/A3cd8` and `https://no-no.uk/A3cd8+`.
4. Copy `論文 Link: A3cd8\n數據 🔗: Q9xK2\nhttps://no-no.uk/H72Ld+`, switch to PureLink, press Clipboard, and confirm three source-ordered candidates, labels, and the preview state for the final URL.
5. Copy bare `A3cd8`, `hello`, and `physics` separately. Confirm Clipboard finds no candidate; confirm direct manual input of `A3cd8` does.
6. With multiple candidates, exercise Select All twice, deselect one row, exercise `+ All`, and verify preview changes affect selected rows only while an unselected row retains its preview state.
7. Share one selected link with no label/description, then with label, description, and preview. Confirm the Android share sheet receives exactly the expected text, labels/URLs are adjacent, no Card is created, and the IME remains populated after the chooser opens.
8. Share two selected links with a description. In a configured deployment, confirm the short `no-no.uk/native/verify` Turnstile window closes after success, the Card body has exactly one blank line between logical items, and the share sheet receives only the returned public Card URL. Cancel/deny verification and simulate a failed create; confirm description, selections, and `+` states remain for retry. Confirm **Clear** is the only explicit session-clear action; Android cannot prove actual recipient delivery from chooser launch.
9. Test `ACTION_SEND` and a source app that offers selected-text processing. Confirm marked and full URLs resolve, bare words do not, and PROCESS_TEXT never changes the original selection. Confirm a source app without processing still works via Clipboard/manual fallback.
10. Try `http://no-no.uk/A3cd8`, `https://no-no.uk.evil.example/A3cd8`, `https://no-no.uk/A3cd8/a`, and `https://no-no.uk/A3cd8%2Fz`; confirm no candidate can open.
11. Check English and Traditional Chinese devices, narrow screens, rotation, TalkBack button labels, password fields, a browser-less device, and source apps that do not provide a text-processing action.
