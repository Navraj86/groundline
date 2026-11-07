"use client";

import { MailPlus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type OrgRole } from "@groundline/shared";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialFormState } from "@/lib/forms";
import { inviteMember } from "./actions";

export function InviteDialog({ orgId, slug, roles }: { orgId: string; slug: string; roles: OrgRole[] }) {
  const [open, setOpen] = useState(false);
  // Remount the form each time the dialog opens so it starts empty.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <MailPlus /> Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to join this workspace.</DialogDescription>
        </DialogHeader>
        <InviteForm key={formKey} orgId={orgId} slug={slug} roles={roles} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  orgId,
  slug,
  roles,
  onDone,
}: {
  orgId: string;
  slug: string;
  roles: OrgRole[];
  onDone: () => void;
}) {
  const [state, action] = useActionState(inviteMember, initialFormState);
  const [role, setRole] = useState<OrgRole>((state.values?.role as OrgRole) ?? "AGENT");

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="role" value={role} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          name="email"
          label="Email"
          type="email"
          placeholder="teammate@company.com"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
          autoFocus
          required
        />
        <Field>
          <FieldLabel htmlFor="invite-role">Role</FieldLabel>
          <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{ROLE_DESCRIPTIONS[role]}</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
      </DialogFooter>
    </form>
  );
}
