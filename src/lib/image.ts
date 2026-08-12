/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : image.ts
 * Created at  : 2026-08-13
 * Author      : jeefo
 * Purpose     : Shrink a picked image before it leaves the machine.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/

// Downscale to a JPEG data URL (longest side ≤1600px) — a full-resolution phone
// screenshot goes from ~4MB to a few hundred KB, which is the difference between
// a report that sends and one that hits the request cap. Returns null when the
// browser cannot decode the file as an image.
export async function compressImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Browser · OS · window size — enough to reproduce what the sender saw without
// asking them to describe their setup.
export function clientEnv(): string {
  const ua = navigator.userAgent;
  const browser = ua.includes("Edg/") ? "Edge"
    : ua.includes("Firefox/") ? "Firefox"
      : ua.includes("Chrome/") ? "Chrome"
        : ua.includes("Safari/") ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS"
    : ua.includes("Android") ? "Android"
      : ua.includes("Mac OS X") ? "macOS"
        : ua.includes("Windows") ? "Windows"
          : ua.includes("Linux") ? "Linux" : "OS";
  return `${browser} · ${os} · ${window.innerWidth}×${window.innerHeight}`;
}
