import { api } from './client';

export interface LimsSpec {
  attribute: string;
  method: string;
  standard: string;
}

export interface LimsLookupResult {
  found: boolean;
  code: string;
  description?: string;
  specs?: LimsSpec[];
}

export async function lookupLimsGrade(code: string, simulateError: boolean) {
  const { data } = await api.get<LimsLookupResult>('/api/lims/lookup', { params: { code, simulateError } });
  return data;
}
