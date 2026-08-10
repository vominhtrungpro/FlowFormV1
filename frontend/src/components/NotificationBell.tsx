import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../notifications/NotificationsContext';
import { openNotification } from '../api/notifications';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { items, unreadCount, markAllRead, markLocalRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const visible = filter === 'unread' ? items.filter((n) => !n.isRead) : items;

  async function handleClick(id: number, requestId: number) {
    markLocalRead(id);
    await openNotification(id);
    setOpen(false);
    navigate(`/requests/${requestId}`);
  }

  return (
    <div className="position-relative" ref={wrapperRef}>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary position-relative"
        onClick={() => setOpen((o) => !o)}
      >
        🔔
        {unreadCount > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="card position-absolute end-0 mt-1 shadow" style={{ width: 340, zIndex: 1050 }}>
          <div className="card-header d-flex justify-content-between align-items-center py-2">
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`btn ${filter === 'unread' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFilter('unread')}
              >
                Unread
              </button>
            </div>
            <button type="button" className="btn btn-sm btn-link" onClick={() => markAllRead()}>
              Mark all read
            </button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {visible.length === 0 && <div className="text-muted text-center p-3 small">No notifications yet.</div>}
            {visible.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`d-block w-100 text-start border-0 border-bottom p-2 bg-white ${n.isRead ? '' : 'bg-light fw-semibold'}`}
                onClick={() => handleClick(n.id, n.requestId)}
              >
                <div className="small">{n.message}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {n.requestCode} · {timeAgo(n.createdAt)}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-light w-100 border-top rounded-0"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
