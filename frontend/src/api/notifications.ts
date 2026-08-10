import { api } from './client';

export interface NotificationItem {
  id: number;
  message: string;
  requestId: number;
  requestCode: string;
  isRead: boolean;
  createdAt: string;
}

export async function getRecentNotifications() {
  const { data } = await api.get<{ unreadCount: number; items: NotificationItem[] }>('/api/notifications/recent');
  return data;
}

export async function listNotifications(unreadOnly: boolean, page: number) {
  const { data } = await api.get('/api/notifications', { params: { unreadOnly, page } });
  return data as { page: number; totalPages: number; items: NotificationItem[] };
}

export async function openNotification(id: number) {
  const { data } = await api.get<{ requestId: number }>(`/api/notifications/${id}/open`);
  return data;
}

export async function markAllRead() {
  await api.post('/api/notifications/mark-all-read');
}
