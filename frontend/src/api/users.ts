import { api } from './client';

export interface UserDto {
  id: number;
  email: string;
  role: string;
  tag: string;
}

export async function listUsers() {
  const { data } = await api.get<UserDto[]>('/api/users');
  return data;
}

export async function listRoleOptions() {
  const { data } = await api.get<string[]>('/api/users/role-options');
  return data;
}

export async function listTagOptions() {
  const { data } = await api.get<string[]>('/api/users/tag-options');
  return data;
}
