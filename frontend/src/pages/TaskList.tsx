import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMyTasks, revokeDelegation, TaskListItem } from '../api/tasks';

const TABS = [
  { key: 'assigned', label: 'Assigned to me' },
  { key: 'delegated', label: 'Delegated by me' },
  { key: 'completed', label: 'Completed' },
  { key: 'team', label: 'My team' },
];

const BUCKET_LABELS: Record<string, string> = {
  overdue: 'Overdue',
  dueToday: 'Due today',
  next3Days: 'Next 3 days',
  later: 'Later',
  none: 'No due date',
};
const BUCKET_ORDER = ['overdue', 'dueToday', 'next3Days', 'later', 'none'];

function statusBadgeClass(status: string) {
  if (status === 'Approved') return 'text-bg-success';
  if (status === 'Rejected' || status === 'Cancelled') return 'text-bg-danger';
  if (status === 'Returned') return 'text-bg-warning';
  return 'text-bg-primary';
}

export function TaskList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('assigned');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  async function load() {
    const data = await listMyTasks(tab, page);
    setItems(data.items);
    setTotalPages(data.totalPages);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  async function onRevoke(taskId: number, e: React.MouseEvent) {
    e.stopPropagation();
    await revokeDelegation(taskId);
    await load();
  }

  // Grouping by due bucket only makes sense for still-open work — completed/delegated/team views
  // mix statuses where "overdue" isn't a meaningful heading, so those render as a flat list.
  const grouped = tab === 'assigned' ? BUCKET_ORDER.map((b) => ({ bucket: b, items: items.filter((i) => i.dueBucket === b) })).filter((g) => g.items.length > 0) : null;

  function renderRow(t: TaskListItem) {
    return (
      <div className="card mb-2" key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/${t.id}`)}>
        <div className="card-body py-2 d-flex align-items-start gap-3">
          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="font-monospace small text-muted">{t.requestCode}</span>
              <span className="badge text-bg-secondary">{t.stepName}</span>
              {t.function && <span className="badge text-bg-light text-dark border">{t.function}</span>}
              {t.isParallel && <span className="badge text-bg-info">Parallel review</span>}
              {t.delegated && <span className="badge text-bg-warning">⇄ Delegated by {t.delegatedFromEmail}</span>}
              <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
              {t.overdue && <span className="badge text-bg-danger">Overdue</span>}
            </div>
            <div className="fw-medium mt-1">{t.requestTitle}</div>
            <div className="text-muted small mt-1">{t.reason}</div>
            {t.siblingProgress && (
              <div className="mt-1">
                <div className="small text-muted">
                  {t.siblingProgress.approved} / {t.siblingProgress.total} responded
                </div>
                <div className="progress" style={{ height: 5, maxWidth: 220 }}>
                  <div className="progress-bar" style={{ width: `${(t.siblingProgress.approved / t.siblingProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="text-end" style={{ minWidth: 130 }}>
            {t.dueAt && <div className="small text-muted">Due {new Date(t.dueAt).toLocaleDateString()}</div>}
            <button type="button" className="btn btn-sm btn-primary mt-1" onClick={(e) => { e.stopPropagation(); navigate(`/tasks/${t.id}`); }}>
              Open task →
            </button>
            {t.canRevoke && (
              <button type="button" className="btn btn-sm btn-outline-secondary mt-1 ms-1" onClick={(e) => onRevoke(t.id, e)}>
                Revoke
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <div className="text-uppercase text-muted small">Task management</div>
        <h1 className="h3">My tasks</h1>
      </div>

      <div className="btn-group btn-group-sm mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && <p className="text-muted small">Open tasks held by anyone sharing your job title/tag — FlowForm has no org chart yet, so this stands in for "team."</p>}

      {items.length === 0 && <p className="text-muted">Nothing here.</p>}

      {grouped
        ? grouped.map((g) => (
            <div key={g.bucket} className="mb-4">
              <div className="text-uppercase text-muted small fw-bold mb-2">{BUCKET_LABELS[g.bucket]}</div>
              {g.items.map(renderRow)}
            </div>
          ))
        : items.map(renderRow)}

      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3">
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
      )}
    </div>
  );
}
