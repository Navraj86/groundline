import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnswerStatus } from '@groundline/shared';
import type { Env } from '../config/env.js';

export interface AnswerRequest {
  organizationId: string;
  question: string;
  history: { role: 'CUSTOMER' | 'ASSISTANT' | 'AGENT'; content: string }[];
  assistant: { name: string; companyName: string; instructions: string };
}

export interface AnswerResult {
  status: AnswerStatus;
  answer: string;
  sources: {
    index: number;
    source_id: string;
    chunk_id: string;
    title: string;
    url: string | null;
    pages: number[];
    snippet: string;
    score: number;
  }[];
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
}

const UNAVAILABLE =
  "Sorry, I'm having trouble answering right now. You can ask to speak with someone from the team and they'll follow up.";

/** Client for the internal AI service. Never throws: failures become an error reply. */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('AI_SERVICE_URL', { infer: true }).replace(/\/+$/, '');
    this.token = config.get('AI_SERVICE_TOKEN', { infer: true });
  }

  async answer(request: AnswerRequest): Promise<AnswerResult> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/answer`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          organization_id: request.organizationId,
          question: request.question,
          history: request.history,
          assistant: {
            name: request.assistant.name,
            company_name: request.assistant.companyName,
            instructions: request.assistant.instructions,
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`AI service responded ${res.status}: ${await res.text()}`);
      return (await res.json()) as AnswerResult;
    } catch (err) {
      this.logger.error(`Answer failed: ${(err as Error).message}`);
      return {
        status: 'ERROR',
        answer: UNAVAILABLE,
        sources: [],
        provider: null,
        model: null,
        input_tokens: null,
        output_tokens: null,
        latency_ms: Date.now() - started,
      };
    }
  }
}
