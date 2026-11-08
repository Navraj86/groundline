import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createEvalDatasetSchema,
  createFromTemplateSchema,
  evalCaseSchema,
  importEvalCasesSchema,
  updateEvalDatasetSchema,
  type CreateEvalDatasetInput,
  type CreateFromTemplateInput,
  type EvalCaseInput,
  type EvalDatasetDetail,
  type EvalDatasetSummary,
  type EvalRunDetail,
  type EvalRunSummary,
  type ImportEvalCasesInput,
  type Paginated,
  type UpdateEvalDatasetInput,
} from '@groundline/shared';
import { z } from 'zod';
import type { AuthContext, OrgContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { CurrentOrg, OrgScoped } from '../organizations/org-access.js';
import { EvaluationsService } from './evaluations.service.js';

const id = { schema: z.uuid() };
const runsQuery = z.object({
  datasetId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

/** Evaluation datasets and runs. Everyone can read the reports; managers run them. */
@Controller('orgs/:orgId/evaluations')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get('datasets')
  @OrgScoped('evaluations:read')
  listDatasets(@CurrentOrg() org: OrgContext): Promise<EvalDatasetSummary[]> {
    return this.evaluations.listDatasets(org.organizationId);
  }

  @Post('datasets')
  @OrgScoped('evaluations:manage')
  createDataset(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: createEvalDatasetSchema }) body: CreateEvalDatasetInput,
  ): Promise<EvalDatasetDetail> {
    return this.evaluations.createDataset(org, user, body);
  }

  @Post('datasets/from-template')
  @OrgScoped('evaluations:manage')
  fromTemplate(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Body({ schema: createFromTemplateSchema }) body: CreateFromTemplateInput,
  ): Promise<EvalDatasetDetail> {
    return this.evaluations.createFromTemplate(org, user, body.template);
  }

  @Get('datasets/:datasetId')
  @OrgScoped('evaluations:read')
  getDataset(@CurrentOrg() org: OrgContext, @Param('datasetId', id) datasetId: string): Promise<EvalDatasetDetail> {
    return this.evaluations.getDataset(org.organizationId, datasetId);
  }

  @Patch('datasets/:datasetId')
  @OrgScoped('evaluations:manage')
  updateDataset(
    @CurrentOrg() org: OrgContext,
    @Param('datasetId', id) datasetId: string,
    @Body({ schema: updateEvalDatasetSchema }) body: UpdateEvalDatasetInput,
  ): Promise<EvalDatasetDetail> {
    return this.evaluations.updateDataset(org.organizationId, datasetId, body);
  }

  @Delete('datasets/:datasetId')
  @OrgScoped('evaluations:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDataset(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('datasetId', id) datasetId: string,
  ): Promise<void> {
    return this.evaluations.deleteDataset(org, user, datasetId);
  }

  @Post('datasets/:datasetId/cases')
  @OrgScoped('evaluations:manage')
  addCase(
    @CurrentOrg() org: OrgContext,
    @Param('datasetId', id) datasetId: string,
    @Body({ schema: evalCaseSchema }) body: EvalCaseInput,
  ): Promise<EvalDatasetDetail> {
    return this.evaluations.addCases(org.organizationId, datasetId, [body]);
  }

  @Post('datasets/:datasetId/cases/import')
  @OrgScoped('evaluations:manage')
  importCases(
    @CurrentOrg() org: OrgContext,
    @Param('datasetId', id) datasetId: string,
    @Body({ schema: importEvalCasesSchema }) body: ImportEvalCasesInput,
  ): Promise<EvalDatasetDetail> {
    return this.evaluations.addCases(org.organizationId, datasetId, body.cases);
  }

  @Patch('datasets/:datasetId/cases/:caseId')
  @OrgScoped('evaluations:manage')
  updateCase(
    @CurrentOrg() org: OrgContext,
    @Param('datasetId', id) datasetId: string,
    @Param('caseId', id) caseId: string,
    @Body({ schema: evalCaseSchema }) body: EvalCaseInput,
  ): Promise<EvalDatasetDetail> {
    return this.evaluations.updateCase(org.organizationId, datasetId, caseId, body);
  }

  @Delete('datasets/:datasetId/cases/:caseId')
  @OrgScoped('evaluations:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCase(
    @CurrentOrg() org: OrgContext,
    @Param('datasetId', id) datasetId: string,
    @Param('caseId', id) caseId: string,
  ): Promise<void> {
    return this.evaluations.deleteCase(org.organizationId, datasetId, caseId);
  }

  @Post('datasets/:datasetId/runs')
  @OrgScoped('evaluations:manage')
  startRun(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthContext,
    @Param('datasetId', id) datasetId: string,
  ): Promise<EvalRunSummary> {
    return this.evaluations.startRun(org, user, datasetId);
  }

  @Get('runs')
  @OrgScoped('evaluations:read')
  listRuns(
    @CurrentOrg() org: OrgContext,
    @Query({ schema: runsQuery }) query: z.infer<typeof runsQuery>,
  ): Promise<Paginated<EvalRunSummary>> {
    return this.evaluations.listRuns(org.organizationId, query);
  }

  @Get('runs/:runId')
  @OrgScoped('evaluations:read')
  getRun(@CurrentOrg() org: OrgContext, @Param('runId', id) runId: string): Promise<EvalRunDetail> {
    return this.evaluations.getRun(org.organizationId, runId);
  }

  @Post('runs/:runId/cancel')
  @OrgScoped('evaluations:manage')
  @HttpCode(HttpStatus.OK)
  cancelRun(@CurrentOrg() org: OrgContext, @Param('runId', id) runId: string): Promise<EvalRunSummary> {
    return this.evaluations.cancelRun(org.organizationId, runId);
  }
}
