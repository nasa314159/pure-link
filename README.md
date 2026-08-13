# PureLink

**Just share.**<br>
No ads. No needless data.

[Use PureLink](https://no-no.uk) · [繁體中文版](README.zh-Hant.md)

PureLink is a quiet, open-source sharing tool whose privacy promises can be inspected rather than merely trusted. Its MVP focuses on three things:

- **Short links:** recipients can append `+` to inspect the complete destination and any referral or affiliate disclosure before continuing.
- **Formulas:** LaTeX and common Unicode math input, mixed text and formulas, browser-local custom shortcuts, live preview, source copying, and PNG export. Signed-in users may optionally turn a natural-language description into an editable LaTeX draft with Cloudflare Workers AI.
- **Small cards:** one short message, an optional signature, and three quiet themes.

Anyone can read and create without an account. Auto mode only suggests a content type; it never makes an invisible choice for the user. Anonymous creators receive a unique management URL. PureLink stores only its credential hash, so a lost anonymous credential cannot be recovered. Google sign-in is optional and exists only for cross-device management of content a user chooses to attach to an account.

## Run locally

Requirements: Node.js 20+ and npm. Run the following commands from the application directory.

```sh
cd pure-link
npm install
npx wrangler d1 migrations apply pure-link-production --local
npm run dev
```

For a new local database, the complete schema can also be applied directly:

```sh
npx wrangler d1 execute pure-link-production --local --file schema.sql
```

Checks before deployment:

```sh
npm test -- --run
npm run assets:prepare
npx wrangler deploy --dry-run
```

`npm run assets:prepare` bundles the self-hosted KaTeX assets and the browser-side PNG export code into `public/assets`. Content tools do not depend on a third-party CDN.

## iOS share shortcut

The first release does not expose an anonymous write API that could bypass Turnstile. An iPhone or iPad Shortcut can receive a URL from the share sheet, URL-encode it, and open:

```text
https://no-no.uk/#url=[Shortcut Input]
```

PureLink fills the creation form while still letting the user inspect the destination, choose cleanup rules, and explicitly confirm creation. Because the URL is placed after `#`, it is not sent to the server as a query parameter when the page first opens.

## Production configuration

Public writes fail closed. If required protection is missing, creation and reporting return `503` instead of silently disabling safeguards.

- `TURNSTILE_SITE_KEY`: public Turnstile site key.
- `TURNSTILE_SECRET_KEY`: set with `wrangler secret put`.
- `RATE_LIMIT_SECRET`: at least 32 random bytes, set with `wrangler secret put`.
- `GOOGLE_CLIENT_ID`: Google OAuth web client ID.
- `GOOGLE_CLIENT_SECRET`: set with `wrangler secret put`.
- Google OAuth redirect URI: `https://no-no.uk/auth/google/callback`.
- Workers AI binding: `AI`, already declared in `wrangler.jsonc`; no API key belongs in the repository.

Never commit real secrets. Copy `.dev.vars.example` to `.dev.vars` for local development.

## Privacy design

| Category | Stored data | Purpose / lifetime |
| --- | --- | --- |
| Shared content | Content, type, settings, status, timestamps, and management-credential hash | Delivery and anonymous deletion |
| Daily analytics | Date, action, content type, country code, and aggregate count | Cost and service health; no raw IP or personal browsing history |
| Rate limiting | Short-lived HMAC identifier, count, and expiry | Prevent automated abuse; removed after expiry |
| Reports | Category, minimal optional details, status, and timestamps | Content-safety review; no name or email required |
| Daily AI allowance | Account, date, and count | Five daily generations for regular accounts and 100 for the operator; prompts and results are not stored |

PureLink does not serve behavioral advertising, track people across sites, sell data, build interest profiles, or train models on shared content. See [`/privacy`](https://no-no.uk/privacy), [`/terms`](https://no-no.uk/terms), and [`/transparency`](https://no-no.uk/transparency) for the complete public disclosures.

## AI credits and payment boundary

Signed-in accounts receive five free AI formula drafts per day. Optional extra credits are one-time digital purchases, not subscriptions: US$5 for 300, US$10 for 800, or US$20 for 2,000 generations. Credits are delivered only after confirmed payment, are tied to the account that started checkout, and do not expire while the AI formula service continues to operate.

Creem acts as merchant of record only for AI formula credit purchases. Voluntary open-source support is separate and grants no credits or product benefits. Public details are available at [`/ai-credits`](https://no-no.uk/ai-credits) and [`/refund-policy`](https://no-no.uk/refund-policy).

## Project structure

- `pure-link/src/index.js`: routing and use-case coordination.
- `pure-link/src/content.js`: validation and normalization for all three content types.
- `pure-link/src/repository.js`: D1 data access.
- `pure-link/src/abuse.js`: Turnstile and privacy-friendly rate limiting.
- `pure-link/src/analytics.js`: daily aggregate analytics.
- `pure-link/src/pages.js`: server-rendered public UI and disclosures.
- `pure-link/migrations/`: ordered D1 schema migrations.
- `pure-link/test/`: unit and workflow tests that run without external services.

Product boundaries and the release checklist live in [`docs/PRODUCT.md`](pure-link/docs/PRODUCT.md) and [`docs/RELEASE_CHECKLIST.md`](pure-link/docs/RELEASE_CHECKLIST.md).

## License

PureLink is released under the [MIT License](LICENSE), allowing people, schools, communities, and small projects to inspect, use, modify, and self-host it while retaining the copyright and license notice.

---

[閱讀繁體中文版](README.zh-Hant.md)
