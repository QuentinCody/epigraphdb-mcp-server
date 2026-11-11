export function fail(message: string, status = 400, data?: unknown): never {
  throw Object.assign(new Error(message), { status, ...(data === undefined ? {} : { data }) });
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Provider returned an invalid object", 502);
  return value as Record<string, unknown>;
}
export async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
import {canonicalJson} from "@bio-mcp/shared";
