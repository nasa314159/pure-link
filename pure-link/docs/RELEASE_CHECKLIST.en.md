# PureLink release checklist

[繁體中文](RELEASE_CHECKLIST.md)

## Local MVP

- [x] Preserve previous snapshots and develop on a dedicated branch.
- [x] Implement content validation, anonymous management, security headers, URL previews, formula/card rendering, abuse controls, reports, aggregate analytics, disclosures, and tests.

## Maintainer checks before launch

- [ ] Back up remote D1 and apply outstanding migrations in order.
- [ ] Verify creation, preview, redirect, formula, card, PNG, reporting, and deletion in staging.
- [ ] Verify mobile, keyboard, error, and Turnstile accessibility paths.
- [ ] Confirm logging, access controls, and retention match public privacy disclosures.
- [ ] Establish report handling, review frequency, and emergency takedown procedures.
- [ ] Configure Lemon Squeezy’s US$5/150, US$10/400, US$20/1,000 credit variants and a separate Pay What You Want support variant; keep API key and webhook secret in Worker secrets.
- [ ] Point Lemon Squeezy test webhooks at `/api/webhooks/lemon-squeezy`, then verify payment, duplicate delivery, unknown variants, refunds, and support contribution totals before enabling checkout.
- [ ] Verify the public source, documentation, and quiet voluntary-support path are current.

## Release order

1. Create staging resources and secrets.
2. Apply remote database migrations.
3. Deploy to staging and complete acceptance testing.
4. Check that public disclosures match actual provider configuration.
5. Establish production backup and recovery.
6. Deploy production and run a short smoke test.
7. Only then announce the public site and source.

If write-protection secrets are missing, reads must remain available and public writes must return `503`; never bypass protection to meet a release date.
