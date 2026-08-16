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

// The API is on the SAME MACHINE that served this page, at API_PORT. The
// Windows workstation has no static IP, so its address cannot be written into
// a config file — but whatever address the analyst typed to reach the app IS
// that machine, and the browser knows it. Read at RUN time from the location
// bar, so the same build keeps working after the DHCP lease changes.
// GraphQL is served at the ROOT of the API (index.ts mounts it on "/").
function sameHostApi(port: string): string {
  if (typeof window === "undefined") return "/graphql";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

// Endpoint resolution, in priority order:
//   1. VITE_GRAPHQL_URL – explicit build-time override of the full endpoint.
//   2. VITE_API_URL     – the API host, from API_URL/VITE_API_URL at build
//                         time (see vite.config.ts).
//   3. VITE_API_PORT    – API_PORT: same host as the page, this port.
//   4. "/graphql"        – same-origin; the dev/preview server proxies it to
//                         whatever API_URL points at.
// Nothing here may fall back to a hardcoded remote host: an install with no
// configuration must talk to its own machine, not somebody else's server.
const apiPort = (import.meta.env.VITE_API_PORT || "").trim();
const uri =
  import.meta.env.VITE_GRAPHQL_URL ||
  import.meta.env.VITE_API_URL ||
  (apiPort ? sameHostApi(apiPort) : "/graphql");

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
