// Sentry in the browser. Public DSN only — never expose private keys here.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    environment: process.env.NODE_ENV,
    beforeSend(event) {
      // Strip free-text breadcrumbs that might contain client names typed
      // into form fields. Insurance app — privacy >> debugging convenience.
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter(b => b.category !== 'ui.input');
      }
      return event;
    },
  });
}
