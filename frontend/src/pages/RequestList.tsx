import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportRequestsCsv, listRequests, removeRequest, RequestListItem } from '../api/requests';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmContext';

const statusClass: Record<string, string> = {
  Completed: 'text-bg-success',
  Terminated: 'text-bg-danger',
  Returned: 'text-bg-danger',
  Draft: 'text-bg-secondary',
};

export function RequestList() {
  const { user } = useAuth();
  const isAdmin = user?.role.toLowerCase() === 'admin';
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<RequestListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listRequests({ q: q || undefined, page });
      setItems(data.items);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function onExport() {
    setExporting(true);
    try {
      await exportRequestsCsv({ q: q || undefined });
    } finally {
      setExporting(false);
    }
  }

  async function onRemove(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirmDialog('Remove this request? This cannot be undone.'))) return;
    await removeRequest(id);
    await load();
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-end mb-3">
        <div>
          <div className="text-uppercase text-muted small">Request register</div>
          <h1 className="h3">Requests</h1>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={onExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          <Link to="/requests/new" className="btn btn-primary">
            + Create request
          </Link>
        </div>
      </div>

      <form
        className="d-flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <input
          className="form-control"
          placeholder="Search by number, title or requester"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-outline-secondary" type="submit">
          Filter
        </button>
      </form>

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Code</th>
              <th>Title</th>
              <th>Type</th>
              <th>Requester</th>
              <th>Current step</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center text-muted p-3">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted p-3">
                  No requests match this filter.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }}>
                <td>
                  <Link to={`/requests/${r.id}`} className="font-monospace text-decoration-none">
                    {r.code}
                  </Link>
                </td>
                <td>{r.title}</td>
                <td className="small text-muted">{r.requestTypeName}</td>
                <td className="small text-muted">{r.requester}</td>
                <td className="small text-muted">{r.currentStepName ?? '—'}</td>
                <td>
                  <span className={`badge ${statusClass[r.status] ?? 'text-bg-primary'}`}>{r.status}</span>
                </td>
                <td>
                  {isAdmin && (
                    <button className="btn btn-sm btn-outline-danger" onClick={(e) => onRemove(e, r.id)}>
                      Remove
                    </button>
                  )}
                </td>
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
            <button
              className="btn btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
