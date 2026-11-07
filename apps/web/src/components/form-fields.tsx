"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type TextFieldProps = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
};

export function TextField({ name, label, error, hint, id, ...props }: TextFieldProps) {
  const inputId = id ?? name;
  return (
    <Field data-invalid={error ? true : undefined}>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        {hint}
      </div>
      <Input id={inputId} name={name} aria-invalid={error ? true : undefined} {...props} />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

export function SubmitButton({
  children,
  pendingText,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
