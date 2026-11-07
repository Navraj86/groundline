"use client";

import { ArrowUp, ExternalLink, Loader2, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  ChatMessage,
  ConversationDetail,
  ConversationStatus,
  SendMessageResult,
  WidgetConfig,
  WidgetSession,
} from "@groundline/shared";
import { cn } from "@/lib/utils";
import { renderAnswer } from "@/components/render-answer";

type Session = { conversationId: string; token: string };
type Pending = { id: string; content: string };

const POLL_MS = 5000;

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(`/api/widget/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    throw Object.assign(new Error(message ?? "Something went wrong"), { status: res.status });
  }
  return data as T;
}

function storageKey(widgetKey: string) {
  return `groundline:chat:${widgetKey}`;
}

function loadSession(widgetKey: string): Session | null {
  try {
    const raw = localStorage.getItem(storageKey(widgetKey));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(widgetKey: string, session: Session | null) {
  try {
    if (session) localStorage.setItem(storageKey(widgetKey), JSON.stringify(session));
    else localStorage.removeItem(storageKey(widgetKey));
  } catch {
    // Storage can be unavailable (private mode, blocked third-party storage); the chat still works.
  }
}

export function ChatWidget({
  widgetKey,
  config,
  preview,
}: {
  widgetKey: string;
  config: WidgetConfig;
  preview: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("OPEN");
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether we're inside the embed iframe (false during server rendering).
  const embedded = useSyncExternalStore(
    () => () => undefined,
    () => window.parent !== window,
    () => false,
  );

  const applyConversation = useCallback((c: ConversationDetail) => {
    setMessages(c.messages);
    setStatus(c.status);
  }, []);

  // Resume a previous conversation from this browser (not in dashboard previews).
  useEffect(() => {
    if (preview) return;
    const stored = loadSession(widgetKey);
    if (!stored) return;
    call<ConversationDetail>(`conversations/${stored.conversationId}`, { token: stored.token })
      .then((c) => {
        setSession(stored);
        applyConversation(c);
      })
      .catch(() => saveSession(widgetKey, null));
  }, [widgetKey, preview, applyConversation]);

  // Once a person has taken over, poll for their replies.
  useEffect(() => {
    if (!session || status !== "ESCALATED") return;
    const timer = setInterval(() => {
      call<ConversationDetail>(`conversations/${session.conversationId}`, { token: session.token })
        .then(applyConversation)
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [session, status, applyConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function ensureSession(): Promise<Session> {
    if (session) return session;
    const created = await call<WidgetSession>(`${widgetKey}/conversations`, {
      method: "POST",
      body: JSON.stringify({ channel: preview ? "PLAYGROUND" : "WIDGET" }),
    });
    const next = { conversationId: created.conversation.id, token: created.visitorToken };
    setSession(next);
    if (!preview) saveSession(widgetKey, next);
    return next;
  }

  async function send(content: string) {
    const text = content.trim();
    if (!text || pending) return;
    setError(null);
    setDraft("");
    setPending({ id: `pending-${Date.now()}`, content: text });
    try {
      const s = await ensureSession();
      const result = await call<SendMessageResult>(`conversations/${s.conversationId}/messages`, {
        method: "POST",
        token: s.token,
        body: JSON.stringify({ content: text }),
      });
      setMessages((prev) => [...prev, result.message, ...(result.reply ? [result.reply] : [])]);
      setStatus(result.status);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 401) {
        saveSession(widgetKey, null);
        setSession(null);
      }
      setError(e.message);
      setDraft(text);
    } finally {
      setPending(null);
    }
  }

  async function handoff(email: string, note: string) {
    const s = await ensureSession();
    const c = await call<ConversationDetail>(`conversations/${s.conversationId}/escalate`, {
      method: "POST",
      token: s.token,
      body: JSON.stringify({ ...(email ? { email } : {}), ...(note ? { note } : {}) }),
    });
    applyConversation(c);
    setHandoffOpen(false);
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "ASSISTANT");
  const suggestHandoff =
    status === "OPEN" && lastAssistant !== undefined && lastAssistant.answerStatus !== "ANSWERED";

  return (
    <div className="flex h-svh flex-col bg-background text-sm" style={{ "--brand": config.brandColor } as React.CSSProperties}>
      <header className="flex items-center gap-3 bg-[var(--brand)] px-4 py-3 text-white">
        <div className="flex size-8 items-center justify-center rounded-full bg-white/15 font-semibold">
          {config.assistantName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{config.assistantName}</p>
          <p className="truncate text-xs text-white/75">
            {status === "ESCALATED" ? `Chatting with the ${config.organizationName} team` : config.organizationName}
          </p>
        </div>
        {embedded && (
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => window.parent.postMessage({ type: "groundline:close" }, "*")}
            className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X className="size-5" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {config.greeting && <Bubble role="ASSISTANT">{config.greeting}</Bubble>}
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {pending && (
          <>
            <Bubble role="CUSTOMER">{pending.content}</Bubble>
            {status !== "ESCALATED" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {config.assistantName} is looking that up…
              </div>
            )}
          </>
        )}
        {suggestHandoff && !handoffOpen && (
          <button
            type="button"
            onClick={() => setHandoffOpen(true)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <UserRound className="size-3.5" /> Talk to a person
          </button>
        )}
        {handoffOpen && <HandoffForm onSubmit={handoff} onCancel={() => setHandoffOpen(false)} />}
      </div>

      {error && <p className="px-4 pb-2 text-xs text-destructive">{error}</p>}
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={status === "ESCALATED" ? "Message the team…" : "Ask a question…"}
          aria-label="Message"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || pending !== null}
          aria-label="Send"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
      <p className="pb-2 text-center text-[10px] text-muted-foreground">
        Answers come from {config.organizationName}&apos;s help resources · Powered by Groundline
      </p>
    </div>
  );
}

function Bubble({ role, children }: { role: ChatMessage["role"]; children: React.ReactNode }) {
  const mine = role === "CUSTOMER";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed",
          mine ? "rounded-br-sm bg-[var(--brand)] text-white" : "rounded-bl-sm bg-muted",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "CUSTOMER") return <Bubble role="CUSTOMER">{message.content}</Bubble>;
  return (
    <div className="space-y-1.5">
      {message.role === "AGENT" && <p className="pl-1 text-[11px] font-medium text-muted-foreground">Team member</p>}
      <Bubble role={message.role}>
        <div className="space-y-2">{renderAnswer(message.content)}</div>
      </Bubble>
      {message.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {message.sources.map((s) =>
            s.url ? (
              <a
                key={s.index}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                <span className="font-medium">{s.index}</span> <span className="truncate">{s.title}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span
                key={s.index}
                title={s.snippet}
                className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <span className="font-medium">{s.index}</span> <span className="truncate">{s.title}</span>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function HandoffForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (email: string, note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2 rounded-xl border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(email.trim(), note.trim());
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-medium">Talk to a person</p>
      <p className="text-xs text-muted-foreground">Leave your email so the team can follow up if you close this chat.</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="w-full rounded-md border px-2.5 py-1.5"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Anything else we should know? (optional)"
        aria-label="Note"
        className="w-full resize-none rounded-md border px-2.5 py-1.5"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Connect me"}
        </button>
      </div>
    </form>
  );
}
