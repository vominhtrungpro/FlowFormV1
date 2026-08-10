import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRequest, getCreateOptions, uploadField, FieldDto, StepSummary } from '../api/requests';
import { FieldGroup } from '../components/FieldGroup';
import { GateRail } from '../components/GateRail';

export function RequestCreate() {
  const navigate = useNavigate();
  const [requestTypes, setRequestTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [steps, setSteps] = useState<StepSummary[]>([]);
  const [fields, setFields] = useState<FieldDto[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [noneAvailable, setNoneAvailable] = useState(false);

  async function load(requestTypeId?: number) {
    const data = await getCreateOptions(requestTypeId);
    setRequestTypes(data.requestTypes);
    setNoneAvailable(data.requestTypes.length === 0);
    setSelectedId(data.selected?.id ?? null);
    setWorkflowName(data.workflowName ?? '');
    setSteps(data.steps ?? []);
    setFields(data.fields);
    setValues({});
    setPendingFiles({});
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    setSubmitting(true);
    try {
      const { id } = await createRequest(selectedId, values);
      for (const [fieldId, file] of Object.entries(pendingFiles)) {
        try {
          await uploadField(id, Number(fieldId), file);
        } catch {
          // The request itself was created fine — don't block navigation over an attachment
          // that failed to upload; the field will just show up empty on the detail page.
        }
      }
      navigate(`/requests/${id}`);
    } catch {
      setError('Could not create the request. Check the required fields.');
    } finally {
      setSubmitting(false);
    }
  }

  if (noneAvailable) {
    return <div className="alert alert-warning">No request types are available for you to raise right now.</div>;
  }

  return (
    <div>
      <div className="mb-3">
        <div className="text-uppercase small text-muted" style={{ fontFamily: 'var(--f-disp)', letterSpacing: '.16em', fontSize: 11 }}>
          Create · Step 1 of {steps.length} · {steps[0]?.name}
        </div>
        <h1 className="h3">Create a request</h1>
        <p className="text-muted">Pick a request type, then describe what you want to do. Submitting moves it to the next step of that type's workflow.</p>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="mb-0" style={{ maxWidth: 340 }}>
            <label className="form-label">Request type</label>
            <select className="form-select" value={selectedId ?? ''} onChange={(e) => load(Number(e.target.value))}>
              {requestTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {steps.length > 0 && <GateRail steps={steps} currentIndex={0} />}

      <div className="create-grid">
        <div className="card mb-0">
          <div className="card-body">
            <form onSubmit={onSubmit}>
              <FieldGroup
                fields={fields}
                values={values}
                onChange={(fieldId, v) => setValues((prev) => ({ ...prev, [String(fieldId)]: v }))}
                pendingFiles={pendingFiles}
                onPendingFile={(fieldId, file) => setPendingFiles((prev) => ({ ...prev, [String(fieldId)]: file }))}
              />

              {error && <div className="alert alert-danger">{error}</div>}

              <div className="d-flex gap-2 mt-2">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Save and continue'}
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => navigate('/requests')}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card mb-0">
          <div className="card-header">Route</div>
          <div className="card-body">
            <dl className="row small mb-0">
              <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                Workflow
              </dt>
              <dd className="col-7">
                {workflowName} · {steps.length} step(s)
              </dd>
              <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                This step
              </dt>
              <dd className="col-7">
                {steps[0]?.name} · handled by {steps[0]?.actorSummary}
              </dd>
              {steps.length > 1 && (
                <>
                  <dt className="col-5 text-muted text-uppercase" style={{ fontSize: 11 }}>
                    Next step
                  </dt>
                  <dd className="col-7">
                    {steps[1]?.name} · {steps[1]?.actorSummary}
                  </dd>
                </>
              )}
            </dl>
            <p className="hint mt-2 mb-0">Steps and who acts on them come from the Workflow design for this request type.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
