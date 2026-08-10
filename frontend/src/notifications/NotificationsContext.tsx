import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';
import { getRecentNotifications, markAllRead as apiMarkAllRead, NotificationItem } from '../api/notifications';

interface NotificationsContextValue {
  items: NotificationItem[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  markLocalRead: (id: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const TOKEN_KEY = 'flowform.token';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    getRecentNotifications()
      .then((data) => {
        setItems(data.items);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => {});

    const token = localStorage.getItem(TOKEN_KEY);
    const socket = io(import.meta.env.VITE_SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('notify', (payload: { id: number; message: string; requestId: number; requestCode: string; createdAt: string }) => {
      setItems((prev) => [{ ...payload, isRead: false }, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function markLocalRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await apiMarkAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, markAllRead, markLocalRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
