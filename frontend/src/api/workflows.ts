import { api } from './client';

export interface WorkflowListItem {
  id: number;
  requestTypeName: string;
  versionNumber: number;
  status: string;
  stepCount: number;
  publishedAt: string | null;
}

export interface Transition {
  id: number;
  action: string;
  toStepId: number | null;
}

export interface Gatekeeper {
  id: number;
  userId: number;
  function: string;
  user: { id: number; email: string };
}

export interface ConditionRule {
  id: number;
  orderIndex: number;
  isElse: boolean;
  fieldId: number | null;
  field?: { id: number; label: string } | null;
  operator: string | null;
  compareValue: string | null;
  toStepId: number | null;
  toStep?: { id: number; name: string } | null;
}

export interface StepDetail {
  id: number;
  workflowDefinitionId: number;
  orderIndex: number;
  name: string;
  type: string;
  actorType: string;
  actorRef: string;
  slaValue: number | null;
  slaUnit: string | null;
  escalateTo: string | null;
  formDefinitionId: number | null;
  sequentialApproval: boolean;
  transitionsFrom: Transition[];
  gatekeepers: Gatekeeper[];
  conditionRulesOf: ConditionRule[];
}

export interface DesignResponse {
  workflow: { id: number; requestTypeName: string; versionNumber: number; status: string };
  steps: StepDetail[];
  selected: StepDetail | null;
  forms: Array<{ id: number; name: string }>;
  users: Array<{ id: number; email: string; role: string; tag: string }>;
  roleOptions: string[];
  tagOptions: string[];
  gatekeeperFunctions: string[];
  conditionFieldOptions: Array<{ id: number; label: string; type: string }>;
  conditionTargetSteps: Array<{ id: number; name: string }>;
}

export async function listWorkflows(params: { q?: string; status?: string; page?: number }) {
  const { data } = await api.get('/api/workflows', { params });
  return data as { page: number; totalPages: number; items: WorkflowListItem[] };
}

export async function getWorkflowDesign(workflowId: number, stepId?: number) {
  const { data } = await api.get<DesignResponse>(`/api/workflows/${workflowId}`, { params: { stepId } });
  return data;
}

export async function createWorkflow(requestTypeName: string) {
  const { data } = await api.post('/api/workflows', { requestTypeName });
  return data as { id: number };
}

export async function saveWorkflowMeta(id: number, name: string, status: string) {
  await api.patch(`/api/workflows/${id}/meta`, { name, status });
}

export async function deleteWorkflow(id: number) {
  await api.delete(`/api/workflows/${id}`);
}

export async function addStep(workflowId: number, type?: string) {
  const { data } = await api.post(`/api/workflows/${workflowId}/steps`, { type });
  return data as { id: number };
}

export interface SaveStepPayload {
  name: string;
  type: string;
  actorType: string;
  actorRef?: string;
  slaValue?: number | null;
  slaUnit?: string | null;
  escalateTo?: string | null;
  formDefinitionId?: number | null;
  sequentialApproval?: boolean;
  allowReturn?: boolean;
  returnToStepId?: number | null;
  nextStepId?: number | null;
  gatekeepers?: Array<{ userId: number; function: string }>;
  conditionRules?: Array<{ fieldId: number; operator: string; compareValue?: string | null; toStepId?: number | null }>;
  conditionElseToStepId?: number | null;
}

export async function saveStep(stepId: number, payload: SaveStepPayload) {
  const { data } = await api.patch(`/api/steps/${stepId}`, payload);
  return data as { id: number };
}

export async function removeStep(stepId: number) {
  const { data } = await api.delete(`/api/steps/${stepId}`);
  return data as { selectedStepId: number | null; notice?: string };
}

export async function reorderSteps(workflowId: number, orderedIds: number[]) {
  await api.post(`/api/workflows/${workflowId}/steps/reorder`, { orderedIds });
}
