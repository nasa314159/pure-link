# Android platform notes and device QA

## Input method architecture

`PureLinkInputMethodService` is registered as an Android `InputMethodService` with the required `android.permission.BIND_INPUT_METHOD`, `android.view.InputMethod` intent filter, and `res/xml/method.xml` metadata. Android’s normal settings and input-method picker control enablement and selection; no Samsung- or Gboard-specific API is used.

The service is an auxiliary resolver keyboard. It never reads surrounding editor text, creates predictions, learns input, or observes the clipboard. It checks password/sensitive editor metadata only to discard its own ephemeral session; it does not read editor content. The only clipboard read occurs after the user presses the one Clipboard button, and only the current primary textual clip is considered.

The keyboard’s globe action uses `shouldOfferSwitchingToNextInputMethod()` / `switchToNextInputMethod()` and falls back to Android’s input-method picker. The setup Activity opens `ACTION_INPUT_METHOD_SETTINGS` and the picker for the same purpose.

`ACTION_PROCESS_TEXT` remains available from API 23. It reads `Intent.EXTRA_PROCESS_TEXT` only when a source app exposes the action, returns `RESULT_CANCELED`, and returns no replacement extra. `ACTION_SEND` receives deliberately shared text. Both are marker/full-URL-only input paths; bare slugs are restricted to direct manual input.

## Network boundary

The manifest declares `INTERNET` solely for an explicit two-or-more-selected-link Card creation. The native request uses `HttpsURLConnection` and posts only:

```json
{ "contentType": "card", "content": "final user-approved Card body" }
```

to the fixed HTTPS `https://no-no.uk/api/links` endpoint. It never sends the original clipboard text, surrounding editor text, a destination URL, formula source, existing Card content, analytics, or a management credential. The endpoint’s existing anti-abuse protection and rate limit are deliberately not bypassed. A failed request leaves the candidate session intact for retry.

No type/existence lookup is currently made. Candidate rows correctly say **Unverified** rather than asserting that a syntactically valid slug exists. This avoids a second network endpoint and keeps local parsing fully functional offline.

The existing public create endpoint requires a Turnstile proof. The IME intentionally does not bypass it; a production end-to-end Card flow therefore still needs a mobile-compatible Turnstile or attestation handoff with equivalent protection. This is a deployment/product integration boundary, not a parser or IME fallback.

## Manual device QA

1. Install the debug APK, open PureLink setup, confirm the disabled status, choose **Enable PureLink keyboard**, enable it in Android settings, return, and confirm the enabled status.
2. Use **Switch keyboard** or Android’s picker to select PureLink. Confirm it presents only compact slug keys, Shift, Backspace, Enter, Clipboard, share, and the switch button—not a full language keyboard.
3. In a normal editable field, enter `A3cd8` through PureLink’s manual-slug field and resolve it. Confirm a safe candidate appears. Use **Open** and **+ Preview** and confirm the browser receives only `https://no-no.uk/A3cd8` and `https://no-no.uk/A3cd8+`.
4. Copy `論文 Link: A3cd8\n數據 🔗: Q9xK2\nhttps://no-no.uk/H72Ld+`, switch to PureLink, press Clipboard, and confirm three source-ordered candidates, labels, and the preview state for the final URL.
5. Copy bare `A3cd8`, `hello`, and `physics` separately. Confirm Clipboard finds no candidate; confirm direct manual input of `A3cd8` does.
6. With multiple candidates, exercise Select All twice, deselect one row, exercise `+ All`, and verify preview changes affect selected rows only while an unselected row retains its preview state.
7. Share one selected link with no label/description, then with label, description, and preview. Confirm the Android share sheet receives exactly the expected text and no Card is created.
8. Share two selected links with a description. In a configured deployment, confirm the Card body has exactly one blank line between logical items and the share sheet receives only the returned public Card URL. Simulate an unavailable network/blocked create and confirm description/selection remain for retry.
9. Test `ACTION_SEND` and a source app that offers selected-text processing. Confirm marked and full URLs resolve, bare words do not, and PROCESS_TEXT never changes the original selection. Confirm a source app without processing still works via Clipboard/manual fallback.
10. Try `http://no-no.uk/A3cd8`, `https://no-no.uk.evil.example/A3cd8`, `https://no-no.uk/A3cd8/a`, and `https://no-no.uk/A3cd8%2Fz`; confirm no candidate can open.
11. Check English and Traditional Chinese devices, narrow screens, rotation, TalkBack button labels, password fields, a browser-less device, and source apps that do not provide a text-processing action.
