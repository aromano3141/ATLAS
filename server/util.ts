import { createHash, randomUUID } from "node:crypto";
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const hash = (v: unknown) =>
  createHash("sha256").update(stable(v)).digest("hex").slice(0, 32);
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function pick(source: Record<string, any>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, source[k] ?? null]));
}
export const equal = (a: unknown, b: unknown) => stable(a) === stable(b);
export function matches(
  actual: Record<string, any>,
  expected: Record<string, any>,
): boolean {
  return Object.entries(expected).every(([k, v]) =>
    equal(actual[k] ?? null, v),
  );
}
export function safeError(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 600)
    : "Operation failed";
}
