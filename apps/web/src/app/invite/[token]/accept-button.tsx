"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitation(token);
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Accept invitation
      </Button>
    </div>
  );
}
