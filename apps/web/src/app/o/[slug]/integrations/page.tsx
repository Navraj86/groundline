import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission, type IdentitySettings, type IntegrationView } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { PageBody, PageHeader } from "../_components/page-header";
import { ActionsApiForm, IdentityControls, SandboxToggle, SecretField } from "./integrations-client";

export const metadata: Metadata = { title: "Integrations" };

const SIGNING_EXAMPLE = `// On your server, after the customer signs in:
import { SignJWT } from "jose";

const userToken = await new SignJWT({ email: user.email, name: user.name })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(String(user.id))          // your customer id
  .setExpirationTime("10m")
  .sign(new TextEncoder().encode(process.env.GROUNDLINE_IDENTITY_SECRET));

// In your page:
<script src=".../widget.js" data-groundline-key="wk_..." data-user-token="{userToken}" async></script>`;

const VERIFY_EXAMPLE = `// Each action is POST {baseUrl}/{action} with JSON { organizationId, customer, input }
// Actions: get_customer_profile, get_subscription, list_orders, request_refund, cancel_subscription
const [t, v1] = header("x-groundline-signature").split(",").map((p) => p.split("=")[1]);
const expected = hmacSha256Hex(secret, \`\${t}.\${rawBody}\`);
if (!timingSafeEqual(expected, v1) || Math.abs(Date.now() / 1000 - Number(t)) > 300) reject(401);`;

export default async function IntegrationsPage({ params }: PageProps<"/o/[slug]/integrations">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "integrations:manage")) notFound();

  const [identity, integrations] = await Promise.all([
    api<IdentitySettings>(`/orgs/${org.id}/identity`),
    api<IntegrationView[]>(`/orgs/${org.id}/integrations`),
  ]);
  const sandbox = integrations.find((i) => i.kind === "SANDBOX")!;
  const actions = integrations.find((i) => i.kind === "ACTIONS_API")!;
  const ctx = { orgId: org.id, slug: org.slug };
  const activeConnector = actions.enabled && actions.baseUrl ? "Actions API" : sandbox.enabled ? "Sandbox store" : null;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Let the assistant look up and act on your customers' accounts, safely."
      />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Identity verification <Badge variant={identity.enabled ? "secondary" : "outline"}>{identity.enabled ? "On" : "Off"}</Badge>
            </CardTitle>
            <CardDescription>
              Account tools only work for customers your website vouches for. Your server signs a short-lived token for the
              signed-in customer, and the assistant can then act for that customer and no one else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {identity.secret && <SecretField value={identity.secret} label="Identity secret" />}
            <IdentityControls ctx={ctx} enabled={identity.enabled} />
            {identity.enabled && (
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
                <code>{SIGNING_EXAMPLE}</code>
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account system</CardTitle>
            <CardDescription>
              {activeConnector
                ? `Account tools currently use the ${activeConnector}.`
                : "No account system is connected, so the assistant can only answer questions and open tickets."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="font-medium">Sandbox store</p>
                <p className="text-sm text-muted-foreground">
                  Realistic demo customers, orders and subscriptions, so you can try lookups, refunds and cancellations
                  end to end before connecting your own system.
                </p>
              </div>
              <SandboxToggle ctx={ctx} enabled={sandbox.enabled} />
            </div>
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="font-medium">Actions API</p>
                <p className="text-sm text-muted-foreground">
                  Groundline calls your backend with signed requests. Implement the endpoints below and verify the
                  signature on every request.
                </p>
              </div>
              <ActionsApiForm ctx={ctx} integration={actions} />
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
                <code>{VERIFY_EXAMPLE}</code>
              </pre>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
