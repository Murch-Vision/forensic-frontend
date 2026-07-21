/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : download.ts
 * Created at  : 2026-07-21
 * Author      : maestro
 * Purpose     : Shared browser-download helper for base64 report payloads.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/

export interface ReportFile {
  filename: string;
  mimeType: string;
  base64: string;
}

// Decode a base64 payload into a Blob and trigger a browser download.
export function downloadBase64(file: ReportFile): void {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type: file.mimeType}));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  // Anchor must be in the DOM for the click to reliably trigger a download in
  // some browsers.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
