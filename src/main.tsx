import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/auth/AuthContext";
import { AuthGateClient } from "./app/auth/AuthGateClient";
import "./styles/index.css";

// Initialize Sentry
Sentry.init({
  dsn: "https://db553cc6bdd6e17d732fa630a7b77baa@o4511022107590657.ingest.de.sentry.io/4511022282571856",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of transactions
  // Session Replay
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
  environment: import.meta.env.MODE || "production",
});

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <AuthGateClient>
        <App />
      </AuthGateClient>
    </AuthProvider>
  </BrowserRouter>
);
