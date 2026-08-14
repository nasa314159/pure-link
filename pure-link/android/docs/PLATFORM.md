# Android platform notes

## Production integrations

`ACTION_PROCESS_TEXT` is available from API 23 and provides selected text in `Intent.EXTRA_PROCESS_TEXT`; this app receives it only when the source app exposes Android's processing action. PureLink reads that text as resolver input, clears it after parsing, and sets `RESULT_CANCELED` without a replacement extra so it never edits the source selection. `ACTION_SEND` receives text intentionally shared by a user. Both incoming paths require an explicit marker; only manual entry accepts a bare slug. Neither mechanism can read a message from another app without the user selecting or sharing it.

The production app also declares one static launcher shortcut that starts the resolver. It is a stable, no-permission quick entry point and does not run a background service. A Quick Settings tile is intentionally not included: it needs user installation/management on every device while adding little over the launcher shortcut for this focused MVP.

## IME candidate-view feasibility

`InputMethodService.onCreateCandidatesView()` creates the candidate UI for the **currently active input method**. It cannot add a row to Samsung Keyboard, Gboard, or another app's IME. An optional future prototype could implement a separate PureLink IME with a small candidates view, but it must clearly be its own selectable keyboard and must never be required by the resolver. No such IME is shipped here.

## AccessibilityService feasibility

An enabled accessibility service can request active-window content through `getRootInActiveWindow()` only when it declares content-retrieval capability. Availability varies by app and UI; text can be absent, stale, intentionally hidden, or inaccessible. The capability is sensitive because it could expose unrelated screen content.

PureLink therefore does not request, implement, or monitor an AccessibilityService. A future investigation would need explicit per-user enablement, clear scope, local-only processing, no gesture automation, no history, and a concrete accessibility benefit before it could be justified.

## Manual device QA

1. On a Samsung Keyboard or Gboard device, launch **Resolve a PureLink** from the app-icon shortcut; verify no keyboard replacement is requested.
2. Enter `A3cd8`; choose **Open** and verify the browser receives `https://no-no.uk/A3cd8`.
3. Enter `PureLink：A3cd8`; choose **+ Preview** and verify the browser receives `https://no-no.uk/A3cd8+`.
4. Share or process `論文 PureLink: A3cd8\n數據 Link: Q9xK2`; verify a chooser appears and does not open either result automatically.
5. Share or process bare `A3cd8` and ordinary `hello`; verify the resolver shows no match. Enter bare `A3cd8` manually; verify it does match.
6. Use a source app that offers selected-text processing; verify the selected text reaches the resolver, is not replaced in the source app, and a source app that does not expose this action still works through manual paste.
7. Try `Link: https://example.com`, `Link: invalid/slash`, and ordinary prose; verify no candidate can open.
8. Check English and Traditional Chinese device languages, TalkBack button labels, narrow screens, rotation, and a browser-less device's safe resolver behavior.
