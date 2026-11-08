import "server-only";
import { headers as requestHeaders } from "next/headers";
import type { ApiErrorBody } from "@groundline/shared";
import { clientIpHeaders } from "./client-ip";
import { getAccessToken } from "./session";

export const API_URL = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody & { code?: string },
  ) {
    super(Array.isArray(body.message) ? body.message.join(", ") : body.message);
  }

  /** Validation messages from the API look like `field: message`; group them by field. */
  get fieldErrors(): Record<string, string> {
    const messages = Array.isArray(this.body.message) ? this.body.message : [];
    const out: Record<string, string> = {};
    for (const m of messages) {
      const idx = m.indexOf(": ");
      if (idx > 0) out[m.slice(0, idx)] ??= m.slice(idx + 2);
    }
    return out;
  }
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Send the signed-in user's access token. Defaults to true. */
  auth?: boolean;
  /** Use this token instead of the session cookie (e.g. right after sign-in). */
  token?: string;
};

/** Calls the Groundline API from the server. Throws `ApiError` on non-2xx responses. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const isForm = opts.body instanceof FormData;
  // FormData sets its own multipart content type (with the boundary).
  if (opts.body !== undefined && !isForm) headers["content-type"] = "application/json";

  if (opts.auth !== false) {
    const token = opts.token ?? (await getAccessToken());
    if (token) headers.authorization = `Bearer ${token}`;
  }
  try {
    Object.assign(headers, clientIpHeaders(await requestHeaders()));
  } catch {
    // Called outside a request (nothing to forward).
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, { statusCode: 503, message: "Groundline is temporarily unavailable. Try again shortly." });
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, { statusCode: res.status, message: "Something went wrong", ...data });
  }
  return data as T;
}
