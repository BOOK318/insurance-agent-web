// Sentry on the Node.js (server / route handler) runtime.
// Lazy: only initialised if SENTRY_DSN is set, so dev runs don't ping Sentry.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    environment: process.env.NODE_ENV,
    // Filter PII out of breadcrumbs/events. Insurance data is sensitive — we'd
    // rather lose noise than leak names by accident.
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.user) delete event.user.email;
      return event;
    },
  });
}
