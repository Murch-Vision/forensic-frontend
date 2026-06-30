export {};

declare global {
  interface Window {
    /**
     * Local port of the bundled API sidecar. Injected by the Tauri desktop
     * shell in release builds (see src-tauri/src/lib.rs); undefined on the web.
     */
    __API_PORT__?: number;
  }
}
