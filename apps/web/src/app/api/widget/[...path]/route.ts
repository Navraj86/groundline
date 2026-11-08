import { NextResponse, type NextRequest } from "next/server";
import { clientIpHeaders } from "@/lib/client-ip";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Only the public widget endpoints are reachable through this proxy.
const ALLOWED = [
  /^wk_[A-Za-z0-9_-]{10,64}$/, // GET config
  /^wk_[A-Za-z0-9_-]{10,64}\/conversations$/, // POST start
  /^conversations\/[0-9a-f-]{36}$/, // GET conversation
  /^conversations\/[0-9a-f-]{36}\/(messages|escalate)$/, // POST message / escalate
];

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = path.join("/");
  if (!ALLOWED.some((re) => re.test(target))) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const headers: Record<string, string> = { accept: "application/json" };
  const auth = request.headers.get("authorization");
  if (auth) headers.authorization = auth;
  if (request.method === "POST") headers["content-type"] = "application/json";
  // Let the API rate-limit by the visitor's address, not the web server's.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  if (ip) headers["x-forwarded-for"] = ip;
  Object.assign(headers, clientIpHeaders(request.headers));

  try {
    const res = await fetch(`${API_URL}/widget/${target}`, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body || null, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Chat is temporarily unavailable." }, { status: 503 });
  }
}

export async function GET(request: NextRequest, { params }: RouteContext<"/api/widget/[...path]">) {
  return forward(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: RouteContext<"/api/widget/[...path]">) {
  return forward(request, (await params).path);
}
