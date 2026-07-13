/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : vite.config.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

// The linked forensic-api runs in its own container, reachable only at its
// public URL (localhost:PORT and in-network aliases don't resolve here). Prefer
// the platform-injected env var; fall back to the known public preview URL.
const API_PUBLIC_URL = "https://f2121093.longbinarycity.com";
const apiUrl =
  process.env.MAESTRO_LINK_FORENSIC_API ||
  process.env.MAESTRO_PREVIEW_FORENSIC_API ||
  process.env.API_URL ||
  API_PUBLIC_URL;

export default defineConfig({
  plugins: [react()],
  // Tauri picks up build errors itself; don't let Vite wipe the terminal.
  clearScreen: false,
  // Expose the API URL to the browser bundle so the Apollo client can talk to
  // the API directly (the API serves GraphQL with permissive CORS).
  define: {
    "import.meta.env.VITE_MAESTRO_PREVIEW_FORENSIC_API": JSON.stringify(
      process.env.MAESTRO_PREVIEW_FORENSIC_API || API_PUBLIC_URL,
    ),
  },
  server: {
    port: 5173,
    // Tauri expects the dev server on a fixed port; fail rather than hop ports.
    strictPort: true,
    proxy: {
      // Fallback for the same-origin /graphql path: proxy it to the API.
      "/graphql": {
        target: apiUrl,
        changeOrigin: true,
        secure: false,
        rewrite: () => "/",
      },
    },
  },
});
