import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addStep, DesignResponse, getWorkflowDesign, removeStep, reorderSteps, saveWorkflowMeta } from '../api/workflows';
import { StepSettingsPanel } from '../components/StepSettingsPanel';
import { useConfirm } from '../components/ConfirmContext';
import { useToast } from '../components/ToastContext';

const PALETTE = ['ApprovalGate', 'ActionTask', 'Condition', 'SystemCall', 'Notification'];

export function WorkflowDesign() {
  const { id } = useParams();
  const workflowId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const stepId = searchParams.get('stepId') ? Number(searchParams.get('stepId')) : undefined;
  const navigate = useNavigate();

  const [design, setDesign] = useState<DesignResponse | null>(null);
  const [draggedStepId, setDraggedStepId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaName, setMetaName] = useState('');
  const [saving, setSaving] = useState(false);
  const confirmDialog = useConfirm();
  const notify = useToast();

  async function load(selectStepId?: number) {
    const data = await getWorkflowDesign(workflowId, selectStepId ?? stepId);
    setDesign(data);
    setMetaName(data.workflow.requestTypeName);
    if (data.selected) setSearchParams({ stepId: String(data.selected.id) }, { replace: true });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  async function onAddStep(type?: string) {
    setError(null);
    try {
      const { id: newId } = await addStep(workflowId, type);
      await load(newId);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not add the step.');
    }
  }

  async function onRemoveStep(stepToRemoveId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirmDialog('Remove this step? This cannot be undone.'))) return;
    setError(null);
    try {
      const result = await removeStep(stepToRemoveId);
      if (result.notice) notify(result.notice, 'info');
      await load(result.selectedStepId ?? undefined);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not remove the step.');
    }
  }

  async function onDropReorder(targetStepId: number) {
    if (!design || draggedStepId == null || draggedStepId === targetStepId) return;
    const ids = design.steps.map((s) => s.id);
    const from = ids.indexOf(draggedStepId);
    const to = ids.indexOf(targetStepId);
    ids.splice(from, 1);
    ids.splice(to, 0, draggedStepId);
    setDraggedStepId(null);
    setDropTarget(false);
    setError(null);
    try {
      await reorderSteps(workflowId, ids);
      await load(design.selected?.id);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Reorder refused.');
    }
  }

  async function onSaveDraft() {
    setSaving(true);
    try {
      await saveWorkflowMeta(workflowId, metaName, 'Draft');
      await load(design?.selected?.id);
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    setSaving(true);
    try {
      await saveWorkflowMeta(workflowId, metaName, 'Published');
      await load(design?.selected?.id);
    } finally {
      setSaving(false);
    }
  }

  if (!design) return <div className="p-3 text-muted">Loading…</div>;

  return (
    <div>
      <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigate('/workflows')}>
        ← Back to list
      </button>

      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="text-uppercase text-muted small">Workflow builder</div>
          <h1 className="h3">{design.workflow.requestTypeName}</h1>
          <div className="text-muted small">
            v{design.workflow.versionNumber} · {design.workflow.status}
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <input className="form-control form-control-sm" value={metaName} onChange={(e) => setMetaName(e.target.value)} style={{ width: 180 }} />
          <button className="btn btn-sm btn-outline-primary" disabled={saving} onClick={onSaveDraft}>
            Save as draft
          </button>
          <button className="btn btn-sm btn-success" disabled={saving} onClick={onPublish}>
            Publish
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="designer">
        <div className="dz-side">
          <div className="text-uppercase small text-muted mb-2" style={{ fontFamily: 'var(--f-disp)', letterSpacing: '.1em', fontSize: 11 }}>
            Step types
          </div>
          {PALETTE.filter((t) => !(design.steps.length === 0 && t === 'Condition')).map((t) => (
            <div
              key={t}
              className="palette-i"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('new-step-type', t);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onDoubleClick={() => onAddStep(t)}
              title="Drag onto the canvas, or double-click to add"
            >
              {t}
            </div>
          ))}
          <div className="hint" style={{ marginTop: 6 }}>
            Drag a type onto the canvas, or double-click to add.
          </div>
        </div>

        <div
          className={`dz-canvas ${dropTarget ? 'drop-target' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(false);
          }}
          onDrop={(e) => {
            setDropTarget(false);
            const newType = e.dataTransfer.getData('new-step-type');
            if (newType) onAddStep(newType);
          }}
        >
          <div className="canvas-label">
            {design.workflow.requestTypeName} · v{design.workflow.versionNumber} · {design.workflow.status}
          </div>
          {design.steps.length === 0 && <p className="text-muted small mb-3">No steps yet — add the first one below.</p>}
          {design.steps.map((s, i) => (
            <a
              key={s.id}
              className={`node ${s.id === design.selected?.id ? 'on' : ''} ${s.id === draggedStepId ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => {
                setDraggedStepId(s.id);
                // Some browsers/webviews silently abort a drag session that never calls
                // setData() on dragstart — matching the old app's wireDrag().
                e.dataTransfer.setData('reorder-step-id', String(s.id));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(true);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(false);
                const newType = e.dataTransfer.getData('new-step-type');
                if (newType) onAddStep(newType);
                else onDropReorder(s.id);
              }}
              onClick={() => load(s.id)}
            >
              <div className="nh d-flex align-items-center gap-2">
                <span className="nn">{i + 1}</span>
                <span className="nt">{s.name}</span>
                <span className="ms-auto badge text-bg-secondary">{s.type}</span>
                <button type="button" className="row-remove" title="Remove step" onClick={(e) => onRemoveStep(s.id, e)}>
                  ✕
                </button>
              </div>
              <div className="nm">{s.actorType === 'User' || s.actorType === 'Role' || s.actorType === 'Tag' ? s.actorRef : s.type}</div>
            </a>
          ))}
          <button type="button" className="dz-add" onClick={() => onAddStep()}>
            + Add step
          </button>
        </div>

        <div className="dz-side r">
          {design.selected ? (
            <StepSettingsPanel step={design.selected} design={design} onSaved={(selectId) => load(selectId)} />
          ) : (
            <p className="text-muted small">No step selected — add or pick one from the canvas.</p>
          )}
        </div>
      </div>
    </div>
  );
}
