"use server";

import { redirect } from "next/navigation";
import {
  forgotPasswordSchema,
  resendConfirmationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type AuthSession,
  type SignUpResult,
} from "@groundline/shared";
import { api, ApiError } from "@/lib/api";
import { formValues, safeNext, zodFieldErrors, type FormState } from "@/lib/forms";
import { clearSession, setSession } from "@/lib/session";

function failure(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof ApiError) {
    return { error: err.message, code: err.body.code, fieldErrors: err.fieldErrors, values };
  }
  throw err;
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };

  try {
    const session = await api<AuthSession>("/auth/sign-in", { method: "POST", body: parsed.data, auth: false });
    await setSession(session);
  } catch (err) {
    return failure(err, values);
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["fullName", "email"]);
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };

  let result: SignUpResult;
  try {
    result = await api<SignUpResult>("/auth/sign-up", { method: "POST", body: parsed.data, auth: false });
  } catch (err) {
    return failure(err, values);
  }

  if (result.session) {
    await setSession(result.session);
    redirect(safeNext(formData.get("next"), "/onboarding"));
  }
  return { success: parsed.data.email, values };
}

export async function resendConfirmation(email: string): Promise<FormState> {
  const parsed = resendConfirmationSchema.safeParse({ email });
  if (!parsed.success) return { error: "Enter a valid email address" };
  try {
    await api("/auth/resend-confirmation", { method: "POST", body: parsed.data, auth: false });
    return { success: "Confirmation email sent." };
  } catch (err) {
    return failure(err);
  }
}

export async function forgotPassword(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  try {
    await api("/auth/forgot-password", { method: "POST", body: parsed.data, auth: false });
  } catch (err) {
    return failure(err, values);
  }
  return { success: parsed.data.email, values };
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = formData.get("password");
  if (password !== formData.get("confirmPassword")) {
    return { fieldErrors: { confirmPassword: "Passwords don't match" } };
  }
  const parsed = resetPasswordSchema.safeParse({ password });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };

  try {
    await api("/auth/reset-password", { method: "POST", body: parsed.data });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { error: "Your reset link has expired. Request a new one." };
    }
    return failure(err);
  }
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  await api("/auth/sign-out", { method: "POST" }).catch(() => undefined);
  await clearSession();
  redirect("/login");
}
