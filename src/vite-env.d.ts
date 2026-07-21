/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full GraphQL endpoint override, if the API is not at the host root. */
  readonly VITE_GRAPHQL_URL?: string;
  /** API host, from API_URL / VITE_API_URL at build time. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
