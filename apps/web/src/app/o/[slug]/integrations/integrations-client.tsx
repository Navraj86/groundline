"use client";

import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { AgentToolName, IntegrationView } from "@groundline/shared";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState, type FormState } from "@/lib/forms";
import {
  disableIdentity,
  rotateActionsSecret,
  rotateIdentitySecret,
  saveActionsApi,
  setSandbox,
  setTool,
} from "./actions";

type Ctx = { orgId: string; slug: string };

function useRunner() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FormState>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (success) toast.success(success);
    });
  return { pending, run };
}

export function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? "bg-foreground" : "bg-muted-foreground/30"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-background shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function SecretField({ value, label }: { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs" aria-label={label}>
        {shown ? value : `${value.slice(0, 4)}${"•".repeat(24)}`}
      </code>
      <Button type="button" size="icon" variant="ghost" aria-label={shown ? "Hide secret" : "Show secret"} onClick={() => setShown(!shown)}>
        {shown ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Copy secret"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function IdentityControls({ ctx, enabled }: { ctx: Ctx; enabled: boolean }) {
  const { pending, run } = useRunner();
  return enabled ? (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => rotateIdentitySecret(ctx.orgId, ctx.slug), "New secret issued. Update your server.")}
      >
        <RefreshCw /> Rotate secret
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => disableIdentity(ctx.orgId, ctx.slug), "Identity verification turned off.")}>
        Turn off
      </Button>
    </div>
  ) : (
    <Button size="sm" disabled={pending} onClick={() => run(() => rotateIdentitySecret(ctx.orgId, ctx.slug), "Identity verification is on.")}>
      Turn on identity verification
    </Button>
  );
}

export function SandboxToggle({ ctx, enabled }: { ctx: Ctx; enabled: boolean }) {
  const { pending, run } = useRunner();
  return (
    <Toggle
      label="Sandbox store"
      checked={enabled}
      disabled={pending}
      onChange={(next) => run(() => setSandbox(ctx.orgId, ctx.slug, next), next ? "Sandbox store on." : "Sandbox store off.")}
    />
  );
}

export function ActionsApiForm({ ctx, integration }: { ctx: Ctx; integration: IntegrationView }) {
  const [state, action] = useActionState(saveActionsApi, initialFormState);
  const { pending, run } = useRunner();
  useEffect(() => {
    if (state.success) toast.success("Actions API saved.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="orgId" value={ctx.orgId} />
        <input type="hidden" name="slug" value={ctx.slug} />
        <FieldGroup>
          <TextField
            name="baseUrl"
            label="Base URL"
            placeholder="https://api.yourcompany.com/groundline"
            defaultValue={state.values?.baseUrl ?? integration.baseUrl ?? ""}
            error={state.fieldErrors?.baseUrl}
          />
        </FieldGroup>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={integration.enabled || !integration.baseUrl} className="size-4" />
          Use this API for account tools (takes priority over the sandbox)
        </label>
        <SubmitButton size="sm" pendingText="Saving…">
          Save
        </SubmitButton>
      </form>
      {integration.secret && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Signing secret</p>
          <SecretField value={integration.secret} label="Actions API signing secret" />
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => rotateActionsSecret(ctx.orgId, ctx.slug), "New signing secret issued.")}
          >
            <RefreshCw /> Rotate secret
          </Button>
        </div>
      )}
    </div>
  );
}

export function ToolToggle({ ctx, tool, enabled }: { ctx: Ctx; tool: AgentToolName; enabled: boolean }) {
  const { pending, run } = useRunner();
  return (
    <Toggle
      label={`Enable ${tool}`}
      checked={enabled}
      disabled={pending}
      onChange={(next) => run(() => setTool(ctx.orgId, ctx.slug, tool, next))}
    />
  );
}
