import * as Sentry from "@sentry/react";

export function initSentry() {
  if (!import.meta.env.PROD || typeof window === "undefined") return;

  Sentry.init({
    dsn: "https://76ba2c9a59763cc89ab07d35dbcdf826@o4511786411753472.ingest.us.sentry.io/4511786428268544",
    integrations: [Sentry.replayIntegration()],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export { Sentry };
