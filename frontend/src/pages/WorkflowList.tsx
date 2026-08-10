import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorkflow, deleteWorkflow, listWorkflows, WorkflowListItem } from '../api/workflows';
import { useConfirm } from '../components/ConfirmContext';
import { useToast } from '../components/ToastContext';

const statusClass: Record<string, string> = {
  Published: 'text-bg-success',
  Draft: 'text-bg-secondary',
  Retired: 'text-bg-danger',
};

export function WorkflowList() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const notify = useToast();
  const [items, setItems] = useState<WorkflowListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listWorkflows({ q: q || undefined, page });
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

  async function onCreate() {
    setCreating(true);
    try {
      const { id } = await createWorkflow('Untitled workflow');
      navigate(`/workflows/${id}`);
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirmDialog('Delete this workflow? This cannot be undone.'))) return;
    try {
      await deleteWorkflow(id);
      await load();
    } catch (err: any) {
      notify(err?.response?.data?.message ?? 'Could not delete this workflow.', 'error');
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-end mb-3">
        <div>
          <div className="text-uppercase text-muted small">Workflow builder</div>
          <h1 className="h3">Workflow design</h1>
        </div>
        <button className="btn btn-primary" onClick={onCreate} disabled={creating}>
          {creating ? 'Creating…' : '+ New workflow'}
        </button>
      </div>

      <form
        className="d-flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <input className="form-control" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-outline-secondary" type="submit">
          Filter
        </button>
      </form>

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Status</th>
              <th>Steps</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center text-muted p-3">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted p-3">
                  No workflows yet.
                </td>
              </tr>
            )}
            {items.map((w) => (
              <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/workflows/${w.id}`)}>
                <td>{w.requestTypeName}</td>
                <td className="small text-muted">v{w.versionNumber}</td>
                <td>
                  <span className={`badge ${statusClass[w.status] ?? 'text-bg-primary'}`}>{w.status}</span>
                </td>
                <td className="small text-muted">{w.stepCount}</td>
                <td className="small text-muted">{w.publishedAt ? new Date(w.publishedAt).toLocaleString() : '—'}</td>
                <td>
                  <button className="btn btn-sm btn-outline-danger" onClick={(e) => onDelete(e, w.id)}>
                    Delete
                  </button>
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
            <button className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
