# Changelog

## 2026-05-12

- Security: disabled the framework `X-Powered-By` response header.
- Security: moved login throttling from process memory into a durable Postgres-backed `login_attempts` table.
- Security: encrypted admin-managed settings at rest and added audit events for settings updates and deletion.
- Security: added app-wide CSP without `unsafe-eval`, HSTS, frame, referrer, MIME sniffing, DNS prefetch, and permissions-policy headers.
- Security: changed AI chat client context to a server-resolved `clientId` flow so raw caller-supplied context is never trusted.
- Security: validated uploaded document magic bytes server-side and served non-previewable files as attachments with `nosniff`.
- Security: upgraded Next.js to 15.5.18 to pick up patched middleware, cache, SSRF, XSS, and DoS fixes reported by `npm audit`.
