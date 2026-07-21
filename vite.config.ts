/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : vite.config.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";

// Where the backend lives. Set API_URL (or VITE_API_URL) in the environment or
// in a .env file next to package.json:
//
//     API_URL=http://localhost:4000
//
// Unset means a backend on this machine. There is deliberately NO hardcoded
// remote fallback — baking one in is what made an on-premise Windows install
// phone home to somebody else's server.
const LOCAL_API = "http://localhost:4000";

export default defineConfig(({mode}) => {
  // "" = load every key from .env, not just the VITE_-prefixed ones. A real
  // environment variable still wins over the file.
  const env = {...loadEnv(mode, process.cwd(), ""), ...process.env} as
    Record<string, string>;
  // Only pin an absolute URL into the bundle when one was configured on
  // purpose. Otherwise the app calls same-origin /graphql and the server below
  // proxies it, so the built files stay portable between machines.
  const explicit = env.API_URL || env.VITE_API_URL || "";
  const apiUrl = explicit || LOCAL_API;
  const proxy = {
    // Fallback for the same-origin /graphql path: proxy it to the API.
    "/graphql": {
      target: apiUrl,
      changeOrigin: true,
      secure: false,
      rewrite: () => "/",
    },
  };

  return {
    plugins: [react()],
    // Tauri picks up build errors itself; don't let Vite wipe the terminal.
    clearScreen: false,
    // Expose the API URL to the browser bundle so the Apollo client can talk to
    // the API directly (the API serves GraphQL with permissive CORS).
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(explicit),
    },
    server: {
      port: 5173,
      // Tauri expects the dev server on a fixed port; fail rather than hop ports.
      strictPort: true,
      proxy,
    },
    // `npm run start` serves the built app from here. Same port and the same
    // /graphql proxy as the dev server, so nothing downstream has to change.
    preview: {
      port: 5173,
      strictPort: true,
      proxy,
    },
  };
});
