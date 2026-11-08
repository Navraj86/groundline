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
  prompt_version?: string;
}

export interface GradeResult {
  relevance: number;
  groundedness: number;
  correctness: number | null;
  unsupported_claims: string[];
  notes: string;
  judge: string;
  input_tokens: number;
  output_tokens: number;
}

export interface EvalCaseRequest extends AnswerRequest {
  expectedAnswer: string | null;
  expectedSourceIds: string[];
  expectInsufficient: boolean;
}

export interface EvalCaseResult {
  status: AnswerStatus;
  answer: string;
  sources: AnswerResult['sources'];
  retrieved_source_ids: string[];
  retrieval_hit: boolean | null;
  reciprocal_rank: number | null;
  grade: GradeResult | null;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  prompt_version: string;
}

export interface AgentStepRequest extends AnswerRequest {
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
  steps: { call_id: string; name: string; arguments: string; output: string }[];
  customerSignedIn: boolean;
}

export interface AgentStepResult extends Omit<AnswerResult, 'status'> {
  status: AnswerResult['status'] | 'TOOL_CALLS';
  tool_calls: { call_id: string; name: string; arguments: string }[];
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

  /** One agent step: the final answer, or tool calls for us to vet and run. */
  async respond(request: AgentStepRequest): Promise<AgentStepResult> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/agent/respond`, {
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
          tools: request.tools,
          steps: request.steps,
          customer_signed_in: request.customerSignedIn,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`AI service responded ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as AgentStepResult;
      return { ...body, tool_calls: body.tool_calls ?? [], sources: body.sources ?? [] };
    } catch (err) {
      this.logger.error(`Agent step failed: ${(err as Error).message}`);
      return {
        status: 'ERROR',
        answer: UNAVAILABLE,
        tool_calls: [],
        sources: [],
        provider: null,
        model: null,
        input_tokens: null,
        output_tokens: null,
        latency_ms: Date.now() - started,
      };
    }
  }

  /** Grades a live answer against the chunks it cited. Throws on failure, so jobs can retry. */
  async gradeAnswer(input: {
    organizationId: string;
    question: string;
    answer: string;
    chunkIds: string[];
  }): Promise<GradeResult> {
    return this.post<GradeResult>('/v1/eval/grade', {
      organization_id: input.organizationId,
      question: input.question,
      answer: input.answer,
      chunk_ids: input.chunkIds,
    });
  }

  /** Answers and scores one evaluation case. Throws on failure, so jobs can retry. */
  async evalCase(request: EvalCaseRequest): Promise<EvalCaseResult> {
    return this.post<EvalCaseResult>('/v1/eval/case', {
      organization_id: request.organizationId,
      question: request.question,
      history: request.history,
      assistant: {
        name: request.assistant.name,
        company_name: request.assistant.companyName,
        instructions: request.assistant.instructions,
      },
      expected_answer: request.expectedAnswer,
      expected_source_ids: request.expectedSourceIds,
      expect_insufficient: request.expectInsufficient,
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`AI service ${path} responded ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return (await res.json()) as T;
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
