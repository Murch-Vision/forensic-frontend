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
//   1. VITE_GRAPHQL_URL – explicit build-time override of the full endpoint.
//   2. VITE_API_URL     – an absolute API host, only if one was set on purpose.
//   3. "/api/"          – same-origin, the normal case. Whatever serves this
//                         app also answers /api: the vite dev/preview server
//                         proxies it to API_URL, and on a maestro preview
//                         nginx sends it to the forensic-api container. Both
//                         strip the prefix, so the API sees its own root.
// Nothing here may fall back to a hardcoded remote host: an install with no
// configuration must talk to its own machine, not somebody else's server.
// The trailing slash is load-bearing — nginx answers a bare /api with a 301,
// and a redirected POST arrives at the API as a GET with no body.
const uri =
  import.meta.env.VITE_GRAPHQL_URL ||
  import.meta.env.VITE_API_URL ||
  "/api/";

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
