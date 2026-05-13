# Changelog

## 2026-05-14

- Security: admin user delete now requires the target account's email as a typed confirmation, preventing accidental cascade-wipe of every client / policy / claim / document the agent owned.
- Security: admin user delete records the cascade impact (clients/policies/claims/documents counts) in the audit log so the destruction is recoverable forensically.
- Security: admin user delete now also purges the agent's document directory on disk so orphan PDFs/images don't linger after a hard delete.
- Security: hardened the on-disk purge with a strict UUID guard (8-4-4-4-12 hex) plus a path-under-`ROOT` check — caught and fixed during testing where the original looser regex accepted any 32-character hex-ish string.
- Feature: reminders page is now an email-style inbox — every reminder is listed (read and unread), unread rows show a blue dot, "全部標記為已讀" sweeps all unread to read, and clicking a single reminder Gmail-style marks it read while navigating.
- Feature: new `POST /api/reminders/mark-all-read` and `PATCH /api/reminders/[id]` endpoints back the inbox actions; both are scoped to the calling agent so cross-tenant marks are no-ops.
- Behaviour: reminders worker now only writes `pushed_at` after a push (reverted from earlier same-day intent to also write `is_sent`). Read/unread is owned by the user; the worker tracks delivery only.
- Tests: added `tests/purge-agent-dir.test.mjs`, `tests/admin-delete-user.test.mjs`, `tests/worker-reminders.test.mjs`, and `tests/reminders-inbox.test.mjs` covering the on-disk purge contract, the nine control-flow branches of the admin delete handler, the worker's three contract cases (including a guard that throws if the worker ever writes is_sent again), and the ten endpoint cases for the inbox model.

## 2026-05-12

- Security: disabled the framework `X-Powered-By` response header.
- Security: moved login throttling from process memory into a durable Postgres-backed `login_attempts` table.
- Security: encrypted admin-managed settings at rest and added audit events for settings updates and deletion.
- Security: added app-wide CSP without `unsafe-eval`, HSTS, frame, referrer, MIME sniffing, DNS prefetch, and permissions-policy headers.
- Security: changed AI chat client context to a server-resolved `clientId` flow so raw caller-supplied context is never trusted.
- Security: validated uploaded document magic bytes server-side and served non-previewable files as attachments with `nosniff`.
- Security: upgraded Next.js to 15.5.18 to pick up patched middleware, cache, SSRF, XSS, and DoS fixes reported by `npm audit`.
