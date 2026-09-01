# PureLink release checklist

[繁體中文](RELEASE_CHECKLIST.md)

## Local MVP

- [x] Preserve previous snapshots and develop on a dedicated branch.
- [x] Implement content validation, anonymous management, security headers, URL previews, formula/card rendering, abuse controls, reports, aggregate analytics, disclosures, and tests.

## Maintainer checks before launch

- [ ] Back up remote D1 and apply outstanding migrations in order through `0010`.
- [ ] Verify creation, preview, redirect, formula, card, PNG, reporting, and deletion in staging.
- [ ] Verify mobile, keyboard, error, and Turnstile accessibility paths.
- [ ] Confirm logging, access controls, and retention match public privacy disclosures.
- [ ] Establish report handling, review frequency, and emergency takedown procedures.
- [ ] Complete Lemon Squeezy and ECPay Test Mode checkout, webhook, cumulative refund, duplicate-callback, and wrong-signature/store/merchant verification before enabling live checkout.
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
