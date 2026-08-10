import { api } from './client';

export async function getConditionOperators() {
  const { data } = await api.get<Record<string, string[]>>('/api/condition-operators');
  return data;
}
