import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { App } from "./app/App";
import { useApp } from "./store/app";
import { api } from "./services/api";
import { useGlobes } from "./store/globes";

// Dev-only automation hook used by scripts/shots.mjs to drive views for screenshots.
if (import.meta.env.DEV) Object.assign(window, { __terratwin: { useApp, api, useGlobes } });

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
