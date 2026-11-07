"use client";

import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, type OrgRole } from "@groundline/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FormState } from "@/lib/forms";
import { changeMemberRole, removeMember, resendInvitation, revokeInvitation } from "./actions";

function report(res: FormState | undefined) {
  if (res?.error) toast.error(res.error);
  else if (res?.success) toast.success(res.success);
}

export function RoleSelect({
  orgId,
  slug,
  memberId,
  role,
  roles,
  disabled,
}: {
  orgId: string;
  slug: string;
  memberId: string;
  role: OrgRole;
  roles: OrgRole[];
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  // Always offer the current role, even if the caller can't assign it.
  const options = roles.includes(role) ? roles : [role, ...roles];

  return (
    <Select
      value={role}
      disabled={disabled || pending}
      onValueChange={(next) => start(async () => report(await changeMemberRole(orgId, slug, memberId, next)))}
    >
      <SelectTrigger size="sm" className="w-36" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((r) => (
          <SelectItem key={r} value={r} disabled={!roles.includes(r)}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RemoveMemberButton({
  orgId,
  slug,
  memberId,
  name,
  orgName,
  isSelf,
}: {
  orgId: string;
  slug: string;
  memberId: string;
  name: string;
  orgName: string;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}>
            {isSelf ? "Leave workspace" : "Remove from workspace"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSelf ? `Leave ${orgName}?` : `Remove ${name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {isSelf
                ? "You'll lose access to this workspace until someone invites you again."
                : `${name} will lose access to ${orgName} immediately. You can invite them again later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await removeMember(orgId, slug, memberId, isSelf);
                  report(res);
                  setOpen(false);
                });
              }}
            >
              {isSelf ? "Leave" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function InvitationActions({
  orgId,
  slug,
  invitationId,
  email,
  role,
}: {
  orgId: string;
  slug: string;
  invitationId: string;
  email: string;
  role: OrgRole;
}) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending} aria-label={`Actions for invitation to ${email}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => start(async () => report(await resendInvitation(orgId, slug, email, role)))}>
          Resend invitation
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => start(async () => report(await revokeInvitation(orgId, slug, invitationId)))}
        >
          Cancel invitation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
