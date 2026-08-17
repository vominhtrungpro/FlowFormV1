import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actOnTask, delegateTask, getTask, TaskDetail as TaskDetailData } from '../api/tasks';
import { FieldGroup } from '../components/FieldGroup';

function statusBadgeClass(status: string) {
  if (status === 'Approved') return 'text-bg-success';
  if (status === 'Rejected' || status === 'Cancelled') return 'text-bg-danger';
  if (status === 'Returned') return 'text-bg-warning';
  return 'text-bg-primary';
}

export function TaskDetail() {
  const { id } = useParams();
  const taskId = Number(id);
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [delegateTo, setDelegateTo] = useState(0);

  async function load() {
    const data = await getTask(taskId);
    setTask(data);
    setValues(Object.fromEntries(Object.entries(data.fieldValues).map(([k, v]) => [k, v])));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function act(action: string) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await actOnTask(taskId, action, comment, values);
      if (result.notice) setNotice(result.notice);
      setComment('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelegate() {
    if (!delegateTo) return;
    setError(null);
    try {
      await delegateTask(taskId, delegateTo);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Delegation failed.');
    }
  }

  if (!task) return <div className="p-3 text-muted">Loading…</div>;

  // Only conditions about *this* task's own prerequisites (required fields) actually gate the
  // Approve button — a condition about siblings having answered is informational, since gating
  // on it would mean nobody could ever go first (see tasks.service.ts's getDetail comment).
  const blockingConditions = task.conditions.filter((c) => c.blocksAction && !c.met);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="font-monospace text-muted small">
            {task.code} · {task.requestCode}
          </div>
          <h1 className="h3">{task.requestTitle}</h1>
          <div className="text-muted small">
            {task.stepName} · {task.stepType}
            {task.function ? ` · ${task.function}` : ''}
          </div>
        </div>
        <span className={`badge fs-6 ${statusBadgeClass(task.status)}`}>{task.status}</span>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}
      {task.cancelReason && <div className="alert alert-secondary">Cancelled — {task.cancelReason}</div>}

      <div className="create-grid">
        <div>
          {task.conditions.length > 0 && (
            <div className="card mb-3">
              <div className="card-header d-flex justify-content-between">
                <span>Conditions</span>
                <span className="text-muted small">
                  {task.conditions.filter((c) => c.met).length} / {task.conditions.length} met
                </span>
              </div>
              <ul className="list-group list-group-flush">
                {task.conditions.map((c, i) => (
                  <li key={i} className={`list-group-item small ${c.met ? 'text-muted' : ''}`}>
                    {c.met ? '✓' : '✕'} {c.label}
                    {!c.met && !c.blocksAction && <span className="text-muted"> (informational)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.siblingTasks.length > 1 && (
            <div className="card mb-3">
              <div className="card-header">Tasks on this step</div>
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Function</th>
                    <th>Holder</th>
                    <th>Task</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {task.siblingTasks.map((s) => (
                    <tr key={s.id} className={s.id === task.id ? 'table-primary' : ''}>
                      <td className="small">{s.function ?? '—'}</td>
                      <td className="small">{s.assigneeEmail}</td>
                      <td className="font-monospace small">{s.code}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(s.status)}`}>
                          {s.requiredForResolution ? s.status : 'Not applicable'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {task.formFields.length > 0 && (
            <div className="card mb-3">
              <div className="card-header">Form for this step</div>
              <div className="card-body">
                <FieldGroup
                  fields={task.formFields}
                  values={values}
                  onChange={(fieldId, v) => setValues((prev) => ({ ...prev, [String(fieldId)]: v }))}
                  disabled={!task.canAct}
                />
              </div>
            </div>
          )}

          <button className="btn btn-outline-secondary mt-2" onClick={() => navigate('/tasks')}>
            ← Back to my tasks
          </button>
        </div>

        <div>
          {task.canAct ? (
            <div className="card mb-3">
              <div className="card-header">Actions</div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Comment</label>
                  <textarea className="form-control" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                  {(task.availableActions.some((a) => a.action === 'Return' || a.action === 'Reject')) && (
                    <div className="form-text">Required for Return / Reject.</div>
                  )}
                </div>
                <div className="d-flex flex-column gap-2">
                  {task.availableActions.map((a) => {
                    const needsComment = (a.action === 'Return' || a.action === 'Reject') && !comment.trim();
                    return (
                      <button
                        key={a.action}
                        type="button"
                        className={`btn ${a.action === 'Reject' ? 'btn-outline-danger' : a.action === 'Return' ? 'btn-outline-secondary' : 'btn-primary'}`}
                        disabled={submitting || needsComment || (a.action === 'Approve' && blockingConditions.length > 0)}
                        onClick={() => act(a.action)}
                      >
                        {a.action}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-secondary small">This task isn't open for action.</div>
          )}

          {task.canDelegate && (
            <div className="card mb-3">
              <div className="card-header">Delegate</div>
              <div className="card-body">
                <select className="form-select form-select-sm mb-2" value={delegateTo} onChange={(e) => setDelegateTo(Number(e.target.value))}>
                  <option value={0}>— Choose a person —</option>
                  {task.delegateCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm btn-outline-primary w-100" disabled={!delegateTo} onClick={onDelegate}>
                  ⇄ Delegate
                </button>
                <div className="form-text">Only people on your team (same tag) can be picked.</div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">Task info</div>
            <div className="card-body">
              <dl className="row small mb-0">
                <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                  Assigned via
                </dt>
                <dd className="col-7">{task.reason}</dd>
                <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                  Delegate allowed
                </dt>
                <dd className="col-7">{task.canDelegate ? 'Yes — same team' : 'No'}</dd>
                {task.slaValue != null && (
                  <>
                    <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                      Time given
                    </dt>
                    <dd className="col-7">
                      {task.slaValue} {task.slaUnit}
                    </dd>
                  </>
                )}
                {task.dueAt && (
                  <>
                    <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                      Due
                    </dt>
                    <dd className="col-7">{new Date(task.dueAt).toLocaleString()}</dd>
                  </>
                )}
                {task.escalateTo && (
                  <>
                    <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                      Escalates to
                    </dt>
                    <dd className="col-7">{task.escalateTo}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
