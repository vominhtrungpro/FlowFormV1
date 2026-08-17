import { api } from './client';

export interface TaskListItem {
  id: number;
  code: string;
  requestId: number;
  requestCode: string;
  requestTitle: string;
  stepName: string;
  stepType: string;
  function: string | null;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  dueBucket: 'overdue' | 'dueToday' | 'next3Days' | 'later' | 'none';
  isParallel: boolean;
  siblingProgress: { approved: number; total: number } | null;
  delegated: boolean;
  delegatedFromEmail?: string;
  assigneeEmail?: string;
  reason: string;
  canRevoke: boolean;
}

export async function listMyTasks(tab: string, page: number) {
  const { data } = await api.get('/api/tasks/mine', { params: { tab, page } });
  return data as { page: number; totalPages: number; items: TaskListItem[] };
}

export interface TaskCondition {
  label: string;
  met: boolean;
  blocksAction: boolean;
}

export interface TaskSiblingTask {
  id: number;
  code: string;
  function: string | null;
  assigneeEmail?: string;
  status: string;
  requiredForResolution: boolean;
  comment: string | null;
}

export interface TaskDetail {
  id: number;
  code: string;
  status: string;
  requestId: number;
  requestCode: string;
  requestTitle: string;
  stepId: number;
  stepName: string;
  stepType: string;
  function: string | null;
  reason: string;
  dueAt: string | null;
  comment: string | null;
  cancelReason: string | null;
  canAct: boolean;
  canDelegate: boolean;
  availableActions: Array<{ action: string }>;
  conditions: TaskCondition[];
  siblingTasks: TaskSiblingTask[];
  formFields: Array<{
    id: number;
    parentFieldId: number | null;
    orderIndex: number;
    label: string;
    type: string;
    required: boolean;
    width: string;
    options?: string | null;
    helpText?: string | null;
    maxFileSizeMb?: number | null;
  }>;
  fieldValues: Record<number, string>;
  escalateTo: string | null;
  slaValue: number | null;
  slaUnit: string | null;
  delegateCandidates: Array<{ id: number; email: string }>;
}

export async function getTask(id: number) {
  const { data } = await api.get<TaskDetail>(`/api/tasks/${id}`);
  return data;
}

export async function actOnTask(id: number, action: string, comment: string, fieldValues: Record<string, string>) {
  const { data } = await api.post(`/api/tasks/${id}/actions`, { action, comment, fieldValues });
  return data as { ok?: boolean; notice?: string };
}

export async function delegateTask(id: number, newAssigneeId: number) {
  await api.post(`/api/tasks/${id}/delegate`, { newAssigneeId });
}

export async function revokeDelegation(id: number) {
  await api.post(`/api/tasks/${id}/revoke-delegation`);
}
