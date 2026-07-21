/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : apollo.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {ApolloClient, HttpLink, InMemoryCache} from "@apollo/client";
import {setContext} from "@apollo/client/link/context";

// Where the bearer token lives. AuthProvider reads/writes the same key.
export const TOKEN_KEY = "forensic.authToken";

// Endpoint resolution, in priority order:
//   1. VITE_GRAPHQL_URL   – explicit build-time override of the full endpoint.
//   2. window.__API_PORT__ – desktop (Tauri release): the Rust shell spawns the
//                            bundled API on a local port and injects it
//                            (see src-tauri/src/lib.rs).
//   3. VITE_API_URL       – the API host, from API_URL/VITE_API_URL at build
//                            time (see vite.config.ts).
//   4. "/graphql"          – same-origin; the dev/preview server proxies it to
//                            whatever API_URL points at.
// Nothing here may fall back to a hardcoded remote host: an install with no
// configuration must talk to its own machine, not somebody else's server.
const tauriPort =
  typeof window !== "undefined" ? window.__API_PORT__ : undefined;

const uri =
  import.meta.env.VITE_GRAPHQL_URL ||
  (tauriPort ? `http://localhost:${tauriPort}/` : undefined) ||
  import.meta.env.VITE_API_URL ||
  "/graphql";

// Attach the stored bearer token to every request so the API knows the caller.
const authLink = setContext((_op, {headers}) => {
  const token = typeof localStorage !== "undefined"
    ? localStorage.getItem(TOKEN_KEY) : null;
  return {headers: {...headers,
    ...(token ? {authorization: `Bearer ${token}`} : {})}};
});

export const client = new ApolloClient({
  link: authLink.concat(new HttpLink({uri})),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: Object.fromEntries(
          // Root list queries are replaced wholesale on refetch; an explicit
          // replace-merge silences apollo's "cache data may be lost" warning.
          ["suspects", "transactions", "bankAccounts", "callRecords",
            "caseFiles", "suspectLinks", "correlations", "evidenceForCase",
            "globalPeople", "analysisResults", "patterns",
            "travelCorrelations", "accessLogEntries", "auditEvents"]
            .map((f) => [f, {merge: (_e: unknown, i: unknown) => i}])
        ),
      },
    },
  }),
});

export default client;
