"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/forms";
import { replyToConversation, setConversationStatus } from "../actions";

type Ids = { orgId: string; slug: string; conversationId: string };

export function ReplyBox(ids: Ids) {
  const [state, action] = useActionState(replyToConversation, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="orgId" value={ids.orgId} />
      <input type="hidden" name="slug" value={ids.slug} />
      <input type="hidden" name="conversationId" value={ids.conversationId} />
      <textarea
        name="content"
        rows={3}
        required
        maxLength={4000}
        defaultValue={state.values?.content}
        placeholder="Reply to the customer… They'll see it in the chat."
        aria-label="Reply"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.fieldErrors?.content && <p className="text-xs text-destructive">{state.fieldErrors.content}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Replying hands the conversation to your team; the AI stops answering.</p>
        <SubmitButton size="sm" pendingText="Sending…">
          Send reply
        </SubmitButton>
      </div>
    </form>
  );
}

export function StatusButton({ resolved, ...ids }: Ids & { resolved: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={resolved ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setConversationStatus(ids.orgId, ids.slug, ids.conversationId, resolved ? "OPEN" : "RESOLVED");
          if (res.error) toast.error(res.error);
          else toast.success(res.success);
        })
      }
    >
      {resolved ? <RotateCcw /> : <CheckCircle2 />} {resolved ? "Reopen" : "Mark resolved"}
    </Button>
  );
}

/** Keeps the thread current while the customer may still be typing. */
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
