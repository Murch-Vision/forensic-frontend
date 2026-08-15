/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : vite.config.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-08-11
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
    // At boot the Windows launcher is the only reader of this output and it
    // logs to a file — wiping the terminal would erase the build error with it.
    clearScreen: false,
    // Expose the API URL to the browser bundle so the Apollo client can talk to
    // the API directly (the API serves GraphQL with permissive CORS).
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(explicit),
    },
    server: {
      // 0.0.0.0 — the workstation serves the whole department over LAN, not
      // just the machine it runs on.
      host: true,
      port: 5173,
      // The Windows launcher and the nginx preview both address :5173 by
      // number, so fail loudly rather than silently hopping to a free port.
      strictPort: true,
      // pnpm drops its content-addressed store at the project root, and vite
      // ignores node_modules by default but NOT .pnpm-store — the dev server took
      // tens of thousands of inotify watches on files nobody imports until the host
      // hit `ENOSPC: System limit for number of file watchers reached` and no
      // preview could start. .git is here for the same reason: a commit makes the
      // watcher read zlib blobs as source and red-screen the app.
      watch: {
        ignored: ["**/.git/**", "**/.pnpm-store/**", "**/dist/**"],
      },
      proxy,
    },
    // `npm run start` serves the built app from here. Same host/port and the
    // same /graphql proxy as the dev server, so nothing downstream has to
    // change.
    preview: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy,
    },
  };
});
