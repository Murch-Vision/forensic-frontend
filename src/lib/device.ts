/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : device.ts
 * Created at  : 2026-07-05
 * Author      : jeefo
 * Purpose     : A stable per-device identifier. Generated once on first use and
 *               kept in localStorage; sent with every login so DETECTIVE
 *               accounts can be locked to the machine they first signed in from.
 *               A new computer produces a new id — which the boss must approve by
 *               resetting the account's device binding.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
const DEVICE_KEY = "forensic.deviceId";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode etc.) — fall back to an ephemeral id so
    // login still works, though the lock won't persist across reloads.
    return generateId();
  }
}

function generateId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  // Last-resort (very old runtimes): index-varied, non-crypto id.
  return "dev-" + Array.from({length: 32},
    (_v, i) => ((i * 2654435761) >>> 24).toString(16)).join("");
}
