import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, markAllRead, NotificationItem, openNotification } from '../api/notifications';

export function NotificationList() {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  async function load() {
    const data = await listNotifications(unreadOnly, page);
    setItems(data.items);
    setTotalPages(data.totalPages);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly, page]);

  async function onOpen(n: NotificationItem) {
    await openNotification(n.id);
    navigate(`/requests/${n.requestId}`);
  }

  async function onMarkAllRead() {
    await markAllRead();
    await load();
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-end mb-3">
        <div>
          <div className="text-uppercase text-muted small">Notification center</div>
          <h1 className="h3">Notifications</h1>
        </div>
        <button className="btn btn-outline-secondary" onClick={onMarkAllRead}>
          Mark all as read
        </button>
      </div>

      <div className="btn-group btn-group-sm mb-3">
        <button
          className={`btn ${!unreadOnly ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => {
            setUnreadOnly(false);
            setPage(1);
          }}
        >
          All
        </button>
        <button
          className={`btn ${unreadOnly ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => {
            setUnreadOnly(true);
            setPage(1);
          }}
        >
          Unread
        </button>
      </div>

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Request</th>
              <th>Message</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted p-3">
                  No notifications here.
                </td>
              </tr>
            )}
            {items.map((n) => (
              <tr key={n.id} style={{ cursor: 'pointer', fontWeight: n.isRead ? 400 : 600 }} onClick={() => onOpen(n)}>
                <td className="font-monospace small">{n.requestCode}</td>
                <td>{n.message}</td>
                <td className="small text-muted">{new Date(n.createdAt).toLocaleString()}</td>
                <td>{!n.isRead && '●'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="d-flex justify-content-between align-items-center p-2 border-top">
          <span className="text-muted small">
            Page {page} of {totalPages}
          </span>
          <div className="btn-group btn-group-sm">
            <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <button className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
