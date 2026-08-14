# PureLink product goals and boundaries

[繁體中文](PRODUCT.md)

## Purpose

PureLink is not a content platform designed to maximise attention, advertising impressions, or user data. It is a public sharing utility: make destinations easier to judge, mathematical expressions easier to read, and short messages more considerate, while making the privacy boundary inspectable in source code.

Success means people can share quickly, recipients can understand where a link leads, service costs remain sustainable, and maintainers do not collect unrelated data.

## Confirmed product principles

1. Anyone can read and create. Authentication is never a prerequisite for ordinary sharing.
2. Abuse protection applies to writes such as creation and reports, not ordinary reading.
3. The creator explicitly offers URL, Formula, and Card. Auto mode only suggests a type.
4. Appending `+` to a URL link shows its full destination and affiliate disclosure; it is not a security certification.
5. Formula sharing supports LaTeX, common Unicode input, mixed text and math, live preview, source copy, PNG export, and browser-local shortcuts.
6. Cards remain one short message, an optional signature, and three quiet themes.
7. Anonymous management uses a high-entropy credential whose hash alone is stored. A lost credential cannot be recovered.
8. Shared content and external sites are not PureLink’s recommendation, endorsement, or safety guarantee.
9. Analytics are daily aggregates needed for cost and service research, not person-level histories.
10. Google sign-in is optional cross-device management for content the user chooses to link.
11. AI formula generation is opt-in, returns one editable LaTeX draft, and does not store prompts or results.

## MVP scope

- URL, formula, and card creation and rendering.
- URL `+` destination preview and affiliate disclosure.
- Anonymous management and permanent deletion.
- Optional Google sign-in, account linking, Turnstile-protected writes, rate limiting, and reports.
- Privacy, terms, transparency, AI-credit, and refund disclosures.
- Self-hosted KaTeX and PNG export assets.
- A browser-local formula shortcut palette and an optional Cloudflare Workers AI formula draft helper.
- Quick opening of an existing short URL without creating new data.

## Explicitly outside the MVP

- Apple sign-in, passkeys/FIDO, encrypted links, and paid capabilities beyond the disclosed AI credit packs.
- Full social posting, tracking pixels, visitor fingerprinting, or personalised recommendations.
- Calling a destination “safe.” A preview is information, not scanning.
- Uploading formula shortcuts or AI prompts/results to provide cross-device synchronisation.

## Open-source and commercial boundary

Core sharing remains inspectable, usable, and self-hostable. Voluntary support does not grant product benefits. AI formula credits, if checkout is enabled, are separately disclosed one-time digital goods.
