import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import type { AgentToolName, ApprovalStatus, ApprovalView, DecideApprovalInput, Paginated } from '@groundline/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolExecutor } from './tool-executor.service.js';
import { TOOLS_BY_NAME } from './tools.js';

const approvalInclude = {
  toolCall: true,
  ticket: { select: { number: true } },
  decidedBy: { select: { id: true, email: true, fullName: true } },
  conversation: { select: { customer: { select: { externalId: true, email: true, name: true } } } },
} satisfies Prisma.ApprovalRequestInclude;

type ApprovalRow = Prisma.ApprovalRequestGetPayload<{ include: typeof approvalInclude }>;

/** Human review of sensitive agent actions (workflow 7.5, FR-054). */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: ToolExecutor,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    opts: { status?: ApprovalStatus; limit: number; cursor?: string },
  ): Promise<Paginated<ApprovalView>> {
    await this.expireOverdue(organizationId);
    const rows = await this.prisma.approvalRequest.findMany({
      where: { organizationId, ...(opts.status ? { status: opts.status } : {}) },
      include: approvalInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, opts.limit).map(toView);
    return { items, nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null };
  }

  async pendingCount(organizationId: string): Promise<number> {
    return this.prisma.approvalRequest.count({ where: { organizationId, status: 'PENDING', expiresAt: { gt: new Date() } } });
  }

  async decide(
    organizationId: string,
    actorUserId: string,
    approvalId: string,
    input: DecideApprovalInput,
  ): Promise<ApprovalView> {
    // Claim the decision under a row lock so two reviewers can't both act on it.
    const approval = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM approval_requests WHERE id = ${approvalId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundException('Approval request not found');
      const current = await tx.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
      if (current.status !== 'PENDING') throw new ConflictException(`This request was already ${current.status.toLowerCase()}.`);
      if (current.expiresAt <= new Date()) {
        await tx.approvalRequest.update({ where: { id: approvalId }, data: { status: 'EXPIRED' } });
        throw new GoneException('This request expired before it was reviewed.');
      }
      const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: { status, decidedById: actorUserId, decidedAt: new Date(), decisionNote: input.note ?? null },
        include: { toolCall: true },
      });
      if (status === 'REJECTED') {
        await tx.toolCall.update({
          where: { id: updated.toolCallId },
          data: { status: 'REJECTED', error: input.note ?? 'Rejected by the support team', completedAt: new Date() },
        });
      }
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: status === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
          targetType: 'approval',
          targetId: approvalId,
          metadata: { tool: updated.toolCall.tool, summary: updated.summary, note: input.note ?? null },
        },
        tx,
      );
      return updated;
    });

    // Only after the decision is committed does the action actually run.
    let customerMessage: string;
    if (approval.status === 'APPROVED') {
      const outcome = await this.executor.runApproved(approval.toolCall);
      customerMessage =
        outcome.status === 'SUCCEEDED'
          ? `Update: your request has been approved and completed. ${describe(approval.summary)}`
          : `Update: your request was approved, but it couldn't be completed (${String(outcome.output.error)}). The team will follow up.`;
    } else {
      customerMessage = `Update: the team reviewed your request and couldn't approve it.${input.note ? ` ${input.note}` : ''}`;
    }

    if (approval.conversationId) {
      await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            conversationId: approval.conversationId!,
            organizationId,
            role: 'AGENT',
            content: customerMessage,
          },
        });
        await tx.conversation.update({ where: { id: approval.conversationId! }, data: { lastMessageAt: message.createdAt } });
      });
    }

    const row = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId }, include: approvalInclude });
    return toView(row);
  }

  private async expireOverdue(organizationId: string): Promise<void> {
    const overdue = await this.prisma.approvalRequest.findMany({
      where: { organizationId, status: 'PENDING', expiresAt: { lte: new Date() } },
      select: { id: true, toolCallId: true },
    });
    if (overdue.length === 0) return;
    await this.prisma.$transaction([
      this.prisma.approvalRequest.updateMany({ where: { id: { in: overdue.map((o) => o.id) } }, data: { status: 'EXPIRED' } }),
      this.prisma.toolCall.updateMany({
        where: { id: { in: overdue.map((o) => o.toolCallId) } },
        data: { status: 'REJECTED', error: 'Expired without review', completedAt: new Date() },
      }),
    ]);
  }
}

function describe(summary: string): string {
  return `(${summary.replace(/\s*\(reason:.*\)$/, '')}.)`;
}

function toView(row: ApprovalRow): ApprovalView {
  const tool = TOOLS_BY_NAME.get(row.toolCall.tool as AgentToolName);
  return {
    id: row.id,
    status: row.status,
    summary: row.summary,
    tool: row.toolCall.tool,
    toolLabel: tool?.label ?? row.toolCall.tool,
    input: row.toolCall.input as Record<string, unknown>,
    result: { status: row.toolCall.status, output: row.toolCall.output, error: row.toolCall.error },
    conversationId: row.conversationId,
    ticketNumber: row.ticket?.number ?? null,
    customer: row.conversation?.customer ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote,
  };
}
