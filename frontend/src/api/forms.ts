import { api } from './client';

export interface FormListItem {
  id: number;
  name: string;
  versionNumber: number;
  status: string;
  fieldCount: number;
}

export interface FieldDetail {
  id: number;
  formDefinitionId: number;
  orderIndex: number;
  parentFieldId: number | null;
  label: string;
  helpText: string | null;
  type: string;
  required: boolean;
  width: string;
  visibilityCondition: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  minDate: string | null;
  maxDate: string | null;
  maxFileSizeMb: number | null;
  readOnlyAfterSubmit: boolean;
  includeInPrintSummary: boolean;
  trackAuditLog: boolean;
  defaultValue: string | null;
  options: string | null;
  pickerActorType: string | null;
  pickerActorRef: string | null;
  useForNextStepActor: boolean;
}

export interface FormDesignResponse {
  form: { id: number; name: string; versionNumber: number; status: string };
  fields: FieldDetail[];
  selected: FieldDetail | null;
}

export async function listForms(params: { q?: string; status?: string; page?: number }) {
  const { data } = await api.get('/api/forms', { params });
  return data as { page: number; totalPages: number; items: FormListItem[] };
}

export async function getFormDesign(formId: number, fieldId?: number) {
  const { data } = await api.get<FormDesignResponse>(`/api/forms/${formId}`, { params: { fieldId } });
  return data;
}

export async function createForm(name: string) {
  const { data } = await api.post('/api/forms', { name });
  return data as { id: number };
}

export async function saveFormMeta(id: number, name: string, status: string) {
  await api.patch(`/api/forms/${id}/meta`, { name, status });
}

export async function publishForm(id: number) {
  await api.post(`/api/forms/${id}/publish`);
}

export async function deleteForm(id: number) {
  await api.delete(`/api/forms/${id}`);
}

export async function addField(formId: number, type?: string, parentFieldId?: number | null) {
  const { data } = await api.post(`/api/forms/${formId}/fields`, { type, parentFieldId });
  return data as { id: number };
}

export interface TableColumnPayload {
  name: string;
  type: 'Text' | 'Dropdown';
  options?: string[];
}

export interface SaveFieldPayload {
  label: string;
  helpText?: string | null;
  type: string;
  width: string;
  required?: boolean;
  readOnlyAfterSubmit?: boolean;
  includeInPrintSummary?: boolean;
  trackAuditLog?: boolean;
  visibilityCondition?: string | null;
  defaultValue?: string | null;
  options?: string | null;
  tableColumns?: TableColumnPayload[];
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  minDate?: string | null;
  maxDate?: string | null;
  maxFileSizeMb?: number | null;
  pickerActorType?: string | null;
  pickerActorRef?: string | null;
  useForNextStepActor?: boolean;
}

export async function saveField(fieldId: number, payload: SaveFieldPayload) {
  const { data } = await api.patch(`/api/fields/${fieldId}`, payload);
  return data as { id: number };
}

export async function removeField(fieldId: number) {
  await api.delete(`/api/fields/${fieldId}`);
}

export interface ReorderNode {
  id: number;
  children?: number[];
}

export async function reorderFields(formId: number, structure: ReorderNode[]) {
  await api.post(`/api/forms/${formId}/fields/reorder`, { structure });
}
