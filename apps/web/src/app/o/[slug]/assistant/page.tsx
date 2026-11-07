import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasPermission, type AssistantConfig } from "@groundline/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { PageBody, PageHeader } from "../_components/page-header";
import { AssistantForm, EmbedSnippet } from "./assistant-client";

export const metadata: Metadata = { title: "Assistant" };

async function publicOrigin(): Promise<string> {
  if (process.env.PUBLIC_WEB_URL) return process.env.PUBLIC_WEB_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function AssistantPage({ params }: PageProps<"/o/[slug]/assistant">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "knowledge:read")) notFound();

  const config = await api<AssistantConfig>(`/orgs/${org.id}/assistant`);
  const canEdit = hasPermission(org.role, "assistant:manage");
  const origin = await publicOrigin();
  const snippet = `<script src="${origin}/widget.js" data-groundline-key="${config.widgetKey}" async></script>`;

  return (
    <>
      <PageHeader title="Assistant" description="How your AI assistant introduces itself, and where it lives on your site." />
      <PageBody>
        <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Behavior</CardTitle>
                <CardDescription>Applies to new messages right away.</CardDescription>
              </CardHeader>
              <CardContent>
                <AssistantForm orgId={org.id} slug={org.slug} settings={config.settings} canEdit={canEdit} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Add the chat to your website</CardTitle>
                <CardDescription>Paste this before the closing &lt;/body&gt; tag on every page where the chat should appear.</CardDescription>
              </CardHeader>
              <CardContent>
                <EmbedSnippet snippet={snippet} orgId={org.id} slug={org.slug} canRotate={canEdit} />
              </CardContent>
            </Card>
          </div>
          <Card className="h-fit min-w-0 gap-3 overflow-hidden py-0">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="text-sm">Try it</CardTitle>
              <CardDescription>A live preview of the widget. Test chats appear in Conversations, labeled Test.</CardDescription>
            </CardHeader>
            <iframe
              title="Assistant preview"
              src={`/widget/${config.widgetKey}?preview=1`}
              className="h-[560px] w-full border-t"
            />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
