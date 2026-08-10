import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actOnRequest, getRequest, RequestDetail } from '../api/requests';
import { FieldGroup } from '../components/FieldGroup';
import { GateRail } from '../components/GateRail';

const statusClass: Record<string, string> = {
  Completed: 'text-bg-success',
  Terminated: 'text-bg-danger',
  Returned: 'text-bg-danger',
  Draft: 'text-bg-secondary',
};

function initials(name: string) {
  const parts = name.split(/[ ._@]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function RequestProcess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const requestId = Number(id);
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');

  async function load() {
    const data = await getRequest(requestId);
    setRequest(data);
    setValues(Object.fromEntries(Object.entries(data.fieldValues).map(([k, v]) => [k, v])));
    setActiveTab((prev) => {
      if (prev) return prev;
      const defaultStepId = data.currentStep?.id ?? data.steps[data.steps.length - 1]?.id;
      return defaultStepId != null ? `step-${defaultStepId}` : 'history';
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function act(action: string) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await actOnRequest(requestId, action, comment, values);
      if (result.notice) setNotice(result.notice);
      setComment('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!request) return <div className="p-3 text-muted">Loading…</div>;

  const isOpen = request.status !== 'Completed' && request.status !== 'Terminated';

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="font-monospace text-muted small">{request.code}</div>
          <h1 className="h3">{request.title}</h1>
        </div>
        <span className={`badge fs-6 ${statusClass[request.status] ?? 'text-bg-primary'}`}>{request.status}</span>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}

      <GateRail steps={request.steps} currentIndex={request.currentIndex} />

      {!isOpen && (
        <div className="alert alert-success">This request is {request.status.toLowerCase()} and is read-only.</div>
      )}

      <div className="create-grid">
        <div>
          <div className="step-tabs">
            {request.steps.map((s) => (
              <button key={s.id} type="button" className={`step-tab ${activeTab === `step-${s.id}` ? 'on' : ''}`} onClick={() => setActiveTab(`step-${s.id}`)}>
                {s.name}
              </button>
            ))}
            <button type="button" className={`step-tab ${activeTab === 'attachments' ? 'on' : ''}`} onClick={() => setActiveTab('attachments')}>
              Attachments{request.attachments.length > 0 ? ` (${request.attachments.length})` : ''}
            </button>
            <button type="button" className={`step-tab ${activeTab === 'history' ? 'on' : ''}`} onClick={() => setActiveTab('history')}>
              History
            </button>
          </div>

          {request.steps.map((s) => {
            if (activeTab !== `step-${s.id}`) return null;

            if (s.orderIndex < request.currentIndex) {
              return (
                <div className="card" key={s.id}>
                  <div className="card-header">{s.name} · submitted</div>
                  <div className="card-body">
                    {s.formFields.length > 0 ? (
                      <FieldGroup fields={s.formFields} values={values} onChange={() => {}} disabled />
                    ) : (
                      <p className="text-muted small mb-0">No form on this step — nothing was submitted here.</p>
                    )}
                  </div>
                </div>
              );
            }

            if (s.id === request.currentStep?.id) {
              return (
                <div key={s.id}>
                  {request.gatekeeperApprovals && request.gatekeeperApprovals.length > 0 && (
                    <div className="card mb-3">
                      <div className="card-header">Gatekeeper approvals</div>
                      <table className="table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Function</th>
                            <th>Approver</th>
                            <th>Decision</th>
                            <th>Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {request.gatekeeperApprovals.map((g, i) => (
                            <tr key={i}>
                              <td>{g.function}</td>
                              <td className="small">{g.email}</td>
                              <td>
                                <span className={`badge ${g.approved ? 'text-bg-success' : 'text-bg-secondary'}`}>
                                  {g.approved ? 'Approved' : 'Pending'}
                                </span>
                              </td>
                              <td className="small text-muted">{g.comment}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="hint p-2 mb-0">Every gatekeeper listed here must Approve before this step moves on; any single Reject sends it back immediately.</p>
                    </div>
                  )}

                  {!isOpen ? null : !request.canAct ? (
                    <div className="alert alert-secondary small">
                      You're not the actor for this step — read-only.
                    </div>
                  ) : request.alreadyVotedWaiting ? (
                    <div className="alert alert-secondary small">Your vote is recorded — waiting on the other gatekeepers.</div>
                  ) : request.notYourTurn ? (
                    <div className="alert alert-secondary small">Not your turn yet — waiting on {request.waitingOnEmail}.</div>
                  ) : (
                    <div className="card">
                      <div className="card-body">
                        {s.formFields.length > 0 && (
                          <>
                            <h3 className="h6 text-uppercase mb-3">Step form: {s.name}</h3>
                            <FieldGroup
                              fields={s.formFields}
                              values={values}
                              onChange={(fieldId, v) => setValues((prev) => ({ ...prev, [String(fieldId)]: v }))}
                              disabled={!request.canAct}
                              requestId={request.id}
                            />
                          </>
                        )}

                        <div className="mb-3">
                          <label className="form-label">Comment</label>
                          <textarea className="form-control" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                        </div>
                        <div className="d-flex gap-2">
                          {request.availableActions.map((a) => (
                            <button
                              key={a.action}
                              type="button"
                              className={`btn ${a.action === 'Reject' ? 'btn-outline-danger' : a.action === 'Return' ? 'btn-outline-secondary' : 'btn-primary'}`}
                              disabled={submitting}
                              onClick={() => act(a.action)}
                            >
                              {a.action}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="card" key={s.id}>
                <div className="card-body text-muted small">Not reached yet.</div>
              </div>
            );
          })}

          {activeTab === 'attachments' && (
            <div className="card">
              <div className="card-header">Attachments</div>
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Added by</th>
                    <th>Added at</th>
                    <th>Step</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {request.attachments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted p-3">
                        No attachments on this request.
                      </td>
                    </tr>
                  )}
                  {request.attachments.map((a, i) => (
                    <tr key={i}>
                      <td className="small">{a.fileName}</td>
                      <td className="small text-muted">{a.type}</td>
                      <td className="small text-muted">{a.size}</td>
                      <td className="small text-muted">{a.addedBy}</td>
                      <td className="font-monospace small">{new Date(a.addedAt).toLocaleString()}</td>
                      <td className="small text-muted">{a.stepName}</td>
                      <td>
                        <a href={`${import.meta.env.VITE_API_URL}${a.url}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="card">
              <div className="card-header">History</div>
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {request.histories.map((h) => (
                    <tr key={h.id}>
                      <td className="font-monospace small">{new Date(h.metaCreatedAt).toLocaleString()}</td>
                      <td>{h.action}</td>
                      <td className="small">{h.actorId}</td>
                      <td className="small text-muted">{h.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn btn-outline-secondary mt-2" onClick={() => navigate('/requests')}>
            ← Back to list
          </button>
        </div>

        <div>
          <div className="card">
            <div className="card-header">Request info</div>
            <div className="card-body">
              <dl className="row small mb-0">
                <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                  Requester
                </dt>
                <dd className="col-7">{request.requester}</dd>
                <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                  Status
                </dt>
                <dd className="col-7">
                  <span className="badge text-bg-primary">{request.status}</span>
                </dd>
                <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                  Current step
                </dt>
                <dd className="col-7">{request.currentStep?.name ?? '—'}</dd>
              </dl>
            </div>
          </div>
          <div className="card">
            <div className="card-header">Personnel</div>
            <div className="card-body">
              {request.personnel.map((p, i) => (
                <div className="personnel-row" key={i}>
                  <div className="ff-av" style={{ width: 24, height: 24, fontSize: 10 }}>
                    {initials(p.name)}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                    <div className="font-monospace text-muted" style={{ fontSize: 10 }}>
                      {p.role}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
