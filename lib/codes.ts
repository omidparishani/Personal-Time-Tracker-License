import { randomBytes } from "crypto";

/** تولید کد خوانا مثل PTT-A3F9-K2M7 */
export function generateActivationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n: number) => {
    const buf = randomBytes(n);
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[buf[i]! % alphabet.length];
    return s;
  };
  return `PTT-${part(4)}-${part(4)}`;
}

export function generateLicenseKey(): string {
  return `LIC-${randomBytes(16).toString("hex")}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
