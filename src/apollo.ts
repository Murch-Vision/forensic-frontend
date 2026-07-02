/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : apollo.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {ApolloClient, HttpLink, InMemoryCache} from "@apollo/client";

// Endpoint resolution, in priority order:
//   1. VITE_GRAPHQL_URL            – explicit build-time override.
//   2. window.__API_PORT__         – desktop (Tauri release): the Rust shell
//                                    spawns the bundled API on a local port and
//                                    injects it (see src-tauri/src/lib.rs).
//   3. VITE_RC_PREVIEW_FORENSIC_API – web/dev: the linked API's public URL.
//   4. "/graphql"                  – last-resort same-origin dev proxy.
// The Apollo standalone server serves GraphQL at the root path.
const tauriPort =
  typeof window !== "undefined" ? window.__API_PORT__ : undefined;

const uri =
  import.meta.env.VITE_GRAPHQL_URL ||
  (tauriPort ? `http://localhost:${tauriPort}/` : undefined) ||
  import.meta.env.VITE_RC_PREVIEW_FORENSIC_API ||
  "/graphql";

export const client = new ApolloClient({
  link: new HttpLink({uri}),
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
