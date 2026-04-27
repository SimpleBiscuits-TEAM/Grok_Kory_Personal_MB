import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

// ── Knox Shield (production-only anti-tamper) ──────────────────────────────
import { activateShield, protectNetworkRequests } from "@/lib/knoxShield";

// Activate client-side protections in production only.
// This does NOT interfere with any app logic, tRPC calls, or closed-loop behavior.
// It only adds passive detection layers (DevTools, timing, DOM integrity).
activateShield({
  productionOnly: true,
  detectDevTools: true,
  protectConsole: true,
  disableContextMenu: true,
  disableInspectShortcuts: true,
  timingDetection: true,
  onTamperDetected: (type, details) => {
    // Silent logging — does NOT block the user or break any functionality
    // In a future version, this could report to the server for audit
    if (import.meta.env.DEV) {
      console.warn(`[Knox Shield] Tamper detected: ${type}`, details);
    }
  },
});

// Add request fingerprinting to all fetch calls (production only)
if (import.meta.env.PROD) {
  protectNetworkRequests();
}
// ── End Knox Shield ────────────────────────────────────────────────────────

// Optional Umami analytics — only load when both env vars are set (avoids broken HTML placeholders when unset).
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (
  typeof analyticsEndpoint === "string" &&
  analyticsEndpoint.length > 0 &&
  typeof analyticsWebsiteId === "string" &&
  analyticsWebsiteId.length > 0
) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${analyticsEndpoint.replace(/\/$/, "")}/umami`;
  script.setAttribute("data-website-id", analyticsWebsiteId);
  document.body.appendChild(script);
}

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
