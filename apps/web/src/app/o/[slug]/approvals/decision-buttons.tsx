"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { decideApproval } from "./actions";

export function DecisionButtons({
  orgId,
  slug,
  approvalId,
  summary,
}: {
  orgId: string;
  slug: string;
  approvalId: string;
  summary: string;
}) {
  const [mode, setMode] = useState<"APPROVE" | "REJECT" | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = (decision: "APPROVE" | "REJECT") =>
    start(async () => {
      const res = await decideApproval(orgId, slug, approvalId, decision, note);
      setMode(null);
      if (res.error) toast.error(res.error);
      else if (res.result?.status === "APPROVED" && res.result.result.status !== "SUCCEEDED") {
        toast.error(`Approved, but the action failed: ${res.result.result.error ?? "unknown error"}`);
      } else toast.success(decision === "APPROVE" ? "Approved and completed. The customer has been told." : "Rejected. The customer has been told.");
    });

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => setMode("APPROVE")}>
          <Check /> Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("REJECT")}>
          <X /> Reject
        </Button>
      </div>
      <AlertDialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mode === "APPROVE" ? "Approve this action?" : "Reject this request?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "APPROVE"
                ? `This runs now and can't be undone from Groundline: ${summary}.`
                : "The action won't run. Your note (optional) is shared with the customer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mode === "REJECT" && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. This order is outside the 30-day refund window."
              aria-label="Note for the customer"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={mode === "REJECT" ? "destructive" : "default"}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (mode) submit(mode);
              }}
            >
              {mode === "APPROVE" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
