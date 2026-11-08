"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEvalDatasetSchema,
  evalCaseSchema,
  type EvalDatasetDetail,
  type EvalRunSummary,
  type EvalTemplate,
} from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

const ctx = z.object({ orgId: z.uuid(), slug: z.string().min(1) });
const uuid = z.uuid();

function failure(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors, values };
  throw err;
}

export async function createDataset(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const values = formValues(formData, ["name", "description"]);
  const parsed = createEvalDatasetSchema.safeParse({ name: values.name, description: values.description || undefined });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  let dataset: EvalDatasetDetail;
  try {
    dataset = await api<EvalDatasetDetail>(`/orgs/${orgId}/evaluations/datasets`, { method: "POST", body: parsed.data });
  } catch (err) {
    return failure(err, values);
  }
  redirect(`/o/${slug}/evaluations/${dataset.id}`);
}

export async function createFromTemplate(orgId: string, slug: string, template: EvalTemplate): Promise<FormState> {
  let dataset: EvalDatasetDetail;
  try {
    dataset = await api<EvalDatasetDetail>(`/orgs/${uuid.parse(orgId)}/evaluations/datasets/from-template`, {
      method: "POST",
      body: { template },
    });
  } catch (err) {
    return failure(err);
  }
  redirect(`/o/${slug}/evaluations/${dataset.id}`);
}

export async function deleteDataset(orgId: string, slug: string, datasetId: string): Promise<FormState> {
  try {
    await api(`/orgs/${uuid.parse(orgId)}/evaluations/datasets/${uuid.parse(datasetId)}`, { method: "DELETE" });
  } catch (err) {
    return failure(err);
  }
  redirect(`/o/${slug}/evaluations`);
}

export async function addCase(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const datasetId = uuid.parse(formData.get("datasetId"));
  const values = formValues(formData, ["question", "expectedAnswer"]);
  const expectInsufficient = formData.get("expectInsufficient") === "on";
  const parsed = evalCaseSchema.safeParse({
    question: values.question,
    expectedAnswer: values.expectedAnswer || null,
    expectedSourceIds: formData.getAll("expectedSourceIds").map(String).filter(Boolean),
    expectInsufficient,
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  try {
    await api(`/orgs/${orgId}/evaluations/datasets/${datasetId}/cases`, { method: "POST", body: parsed.data });
  } catch (err) {
    return failure(err, values);
  }
  revalidatePath(`/o/${slug}/evaluations/${datasetId}`);
  return { success: "Question added." };
}

export async function deleteCase(orgId: string, slug: string, datasetId: string, caseId: string): Promise<FormState> {
  try {
    await api(`/orgs/${uuid.parse(orgId)}/evaluations/datasets/${uuid.parse(datasetId)}/cases/${uuid.parse(caseId)}`, {
      method: "DELETE",
    });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/o/${slug}/evaluations/${datasetId}`);
  return { success: "Question removed." };
}

export async function startRun(orgId: string, slug: string, datasetId: string): Promise<FormState> {
  let run: EvalRunSummary;
  try {
    run = await api<EvalRunSummary>(`/orgs/${uuid.parse(orgId)}/evaluations/datasets/${uuid.parse(datasetId)}/runs`, {
      method: "POST",
    });
  } catch (err) {
    return failure(err);
  }
  redirect(`/o/${slug}/evaluations/runs/${run.id}`);
}

export async function cancelRun(orgId: string, slug: string, runId: string): Promise<FormState> {
  try {
    await api(`/orgs/${uuid.parse(orgId)}/evaluations/runs/${uuid.parse(runId)}/cancel`, { method: "POST" });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/o/${slug}/evaluations/runs/${runId}`);
  return { success: "Run cancelled." };
}
