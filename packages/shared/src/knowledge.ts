import { z } from 'zod';

export const KNOWLEDGE_SOURCE_TYPES = ['FILE', 'URL', 'TEXT'] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const KNOWLEDGE_SOURCE_STATUSES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

/** File types the knowledge base accepts, by extension. */
export const KNOWLEDGE_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
};
export const KNOWLEDGE_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_MAX_TEXT_CHARS = 200_000;

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  title: string;
  fileName: string | null;
  sizeBytes: number | null;
  url: string | null;
  chunkCount: number;
  characterCount: number | null;
  error: string | null;
  attempts: number;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; email: string; fullName: string | null } | null;
}

const title = z.string().trim().min(1, 'Enter a title').max(200);

export const addUrlSourceSchema = z.object({
  url: z
    .url({ protocol: /^https?$/, error: 'Enter a valid http(s) URL' })
    .trim()
    .max(2000),
  title: title.optional(),
});
export type AddUrlSourceInput = z.infer<typeof addUrlSourceSchema>;

export const addTextSourceSchema = z.object({
  title,
  content: z
    .string()
    .trim()
    .min(20, 'Add at least a sentence or two')
    .max(KNOWLEDGE_MAX_TEXT_CHARS, 'Text is too long; upload it as a file instead'),
});
export type AddTextSourceInput = z.infer<typeof addTextSourceSchema>;

export const renameSourceSchema = z.object({ title });
export type RenameSourceInput = z.infer<typeof renameSourceSchema>;
