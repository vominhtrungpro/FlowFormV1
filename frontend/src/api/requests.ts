import { api } from './client';

export interface FieldDto {
  id: number;
  parentFieldId: number | null;
  orderIndex: number;
  label: string;
  helpText?: string | null;
  type: string;
  required: boolean;
  width: string;
  options?: string | null;
  maxFileSizeMb?: number | null;
}

export interface RequestListItem {
  id: number;
  code: string;
  title: string;
  requester: string;
  requestTypeName: string;
  currentStepName: string | null;
  status: string;
  createdAt: string;
}

export interface RequestListResponse {
  page: number;
  totalPages: number;
  items: RequestListItem[];
}

export async function listRequests(params: { q?: string; requestTypeId?: number; status?: string; page?: number }) {
  const { data } = await api.get<RequestListResponse>('/api/requests', { params });
  return data;
}

// Downloaded via axios (not a plain <a href>) so the JWT auth header attaches — a bare link can't
// carry an Authorization header, and putting the token in the URL would leak it into logs/history.
export async function exportRequestsCsv(params: { q?: string; requestTypeId?: number; status?: string }) {
  const response = await api.get('/api/requests/export', { params, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'requests.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export interface StepSummary {
  id: number;
  name: string;
  type: string;
  actorSummary: string;
}

export async function getCreateOptions(requestTypeId?: number) {
  const { data } = await api.get('/api/requests/create-options', { params: { requestTypeId } });
  return data as {
    requestTypes: Array<{ id: number; name: string }>;
    selected: { id: number; name: string } | null;
    stepName?: string;
    workflowName?: string;
    steps: StepSummary[];
    fields: FieldDto[];
  };
}

export async function createRequest(requestTypeId: number, fieldValues: Record<string, string>) {
  const { data } = await api.post('/api/requests', { requestTypeId, fieldValues });
  return data as { id: number };
}

export interface RequestDetail {
  id: number;
  code: string;
  title: string;
  requester: string;
  status: string;
  currentStep: {
    id: number;
    name: string;
    type: string;
    sequentialApproval: boolean;
    formDefinition?: { fields: FieldDto[] } | null;
    gatekeepers: Array<{ id: number; userId: number }>;
  } | null;
  steps: Array<{ id: number; name: string; type: string; orderIndex: number; actorSummary: string; formFields: FieldDto[] }>;
  personnel: Array<{ name: string; role: string }>;
  currentIndex: number;
  availableActions: Array<{ action: string; toStepId: number | null }>;
  canAct: boolean;
  fieldValues: Record<number, string>;
  gatekeeperApprovals?: Array<{ email: string; function: string; approved: boolean; approvedAt: string | null; comment: string | null }>;
  alreadyVotedWaiting?: boolean;
  notYourTurn?: boolean;
  waitingOnEmail?: string;
  histories: Array<{ id: number; action: string; actorId: string; comment: string | null; metaCreatedAt: string }>;
  attachments: Array<{ fileName: string; type: string; size: string; addedBy: string; addedAt: string; stepName: string; url: string }>;
}

export async function getRequest(id: number) {
  const { data } = await api.get<RequestDetail>(`/api/requests/${id}`);
  return data;
}

export async function actOnRequest(id: number, action: string, comment?: string, fieldValues?: Record<string, string>) {
  const { data } = await api.post(`/api/requests/${id}/actions`, { action, comment, fieldValues });
  return data as { ok?: boolean; notice?: string };
}

export async function removeRequest(id: number) {
  await api.delete(`/api/requests/${id}`);
}

export async function uploadField(id: number, fieldId: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post(`/api/requests/${id}/fields/${fieldId}/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as { path: string };
}
