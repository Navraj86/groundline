import type { z } from "zod";

/** Result returned by server actions that back a form. */
export type FormState = {
  error?: string;
  /** Machine-readable error code from the API, when there is one. */
  code?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Submitted values, echoed back so inputs keep their content after an error. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Only allow same-site relative redirect targets, never `//evil.com` or absolute URLs. */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
