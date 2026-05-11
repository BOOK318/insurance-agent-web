# Changelog

## 2026-05-12

- Security: changed AI chat client context to a server-resolved `clientId` flow so raw caller-supplied context is never trusted.
- Security: validated uploaded document magic bytes server-side and served non-previewable files as attachments with `nosniff`.
- Security: upgraded Next.js to 15.5.18 to pick up patched middleware, cache, SSRF, XSS, and DoS fixes reported by `npm audit`.
