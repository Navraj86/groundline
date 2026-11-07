import type { Metadata } from "next";
import type { WidgetConfig } from "@groundline/shared";
import { api, ApiError } from "@/lib/api";
import { ChatWidget } from "./chat-widget";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function WidgetPage({ params, searchParams }: PageProps<"/widget/[key]">) {
  const { key } = await params;
  const { preview } = await searchParams;

  let config: WidgetConfig | null = null;
  try {
    config = await api<WidgetConfig>(`/widget/${encodeURIComponent(key)}`, { auth: false });
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 400)) throw err;
  }

  if (!config) {
    return (
      <main className="flex h-svh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        This chat isn&apos;t available.
      </main>
    );
  }
  return <ChatWidget widgetKey={key} config={config} preview={preview === "1"} />;
}
