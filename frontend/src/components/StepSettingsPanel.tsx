import { useEffect, useState } from 'react';
import {
  ConditionRule,
  DesignResponse,
  Gatekeeper,
  StepDetail,
  removeStep,
  saveStep,
  SaveStepPayload,
} from '../api/workflows';
import { getConditionOperators } from '../api/conditionOperators';
import { TagSelect } from './TagSelect';
import { useConfirm } from './ConfirmContext';
import { useToast } from './ToastContext';

interface Props {
  step: StepDetail;
  design: DesignResponse;
  onSaved: (selectStepId?: number) => void;
}

const STEP_TYPES = ['ApprovalGate', 'ActionTask', 'Condition', 'SystemCall', 'Notification'];
const ACTOR_TYPES = ['User', 'Role', 'Tag', 'Dynamic'];

function splitRef(ref: string) {
  return ref
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function StepSettingsPanel({ step, design, onSaved }: Props) {
  const confirmDialog = useConfirm();
  const notify = useToast();
  const [name, setName] = useState(step.name);
  const [type, setType] = useState(step.type);
  const [actorType, setActorType] = useState(step.actorType);
  const [actorRefValues, setActorRefValues] = useState<string[]>(splitRef(step.actorRef));
  const [dynamicRef, setDynamicRef] = useState(step.actorType === 'Dynamic' ? step.actorRef : '');
  const [slaValue, setSlaValue] = useState<string>(step.slaValue?.toString() ?? '');
  const [slaUnit, setSlaUnit] = useState(step.slaUnit ?? '');
  const [escalateTo, setEscalateTo] = useState<string[]>(splitRef(step.escalateTo ?? ''));
  const [formDefinitionId, setFormDefinitionId] = useState(step.formDefinitionId ?? 0);
  const [sequentialApproval, setSequentialApproval] = useState(step.sequentialApproval);
  const [taskFanOutMode, setTaskFanOutMode] = useState(step.taskFanOutMode);
  const [resolutionRule, setResolutionRule] = useState(step.resolutionRule);
  const [quorumCount, setQuorumCount] = useState<string>(step.quorumCount?.toString() ?? '');
  const [allowReturn, setAllowReturn] = useState(step.transitionsFrom.some((t) => t.action === 'Return'));
  const [returnToStepId, setReturnToStepId] = useState<number>(step.transitionsFrom.find((t) => t.action === 'Return')?.toStepId ?? 0);
  const [nextStepId, setNextStepId] = useState<number>(
    step.transitionsFrom.find((t) => t.action === (step.type === 'ActionTask' ? 'Submit' : 'Approve'))?.toStepId ?? 0,
  );
  const [gatekeepers, setGatekeepers] = useState<Array<{ userId: number; function: string }>>(
    step.gatekeepers.map((g) => ({ userId: g.userId, function: g.function })),
  );
  const [gkUserId, setGkUserId] = useState(design.users[0]?.id ?? 0);
  const [gkFunction, setGkFunction] = useState(design.gatekeeperFunctions[0] ?? '');

  const [conditionRules, setConditionRules] = useState<
    Array<{ fieldId: number; operator: string; compareValue: string; toStepId: number }>
  >(
    step.conditionRulesOf
      .filter((r) => !r.isElse)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((r) => ({ fieldId: r.fieldId ?? 0, operator: r.operator ?? '', compareValue: r.compareValue ?? '', toStepId: r.toStepId ?? 0 })),
  );
  const [elseToStepId, setElseToStepId] = useState<number>(
    step.conditionRulesOf.find((r) => r.isElse)?.toStepId ?? 0,
  );
  const [operatorsByType, setOperatorsByType] = useState<Record<string, string[]>>({});

  useEffect(() => {
    getConditionOperators().then(setOperatorsByType);
  }, []);

  // Reset local state whenever a different step gets selected.
  useEffect(() => {
    setName(step.name);
    setType(step.type);
    setActorType(step.actorType);
    setActorRefValues(splitRef(step.actorRef));
    setDynamicRef(step.actorType === 'Dynamic' ? step.actorRef : '');
    setSlaValue(step.slaValue?.toString() ?? '');
    setSlaUnit(step.slaUnit ?? '');
    setEscalateTo(splitRef(step.escalateTo ?? ''));
    setFormDefinitionId(step.formDefinitionId ?? 0);
    setSequentialApproval(step.sequentialApproval);
    setTaskFanOutMode(step.taskFanOutMode);
    setResolutionRule(step.resolutionRule);
    setQuorumCount(step.quorumCount?.toString() ?? '');
    setAllowReturn(step.transitionsFrom.some((t) => t.action === 'Return'));
    setReturnToStepId(step.transitionsFrom.find((t) => t.action === 'Return')?.toStepId ?? 0);
    setNextStepId(step.transitionsFrom.find((t) => t.action === (step.type === 'ActionTask' ? 'Submit' : 'Approve'))?.toStepId ?? 0);
    setGatekeepers(step.gatekeepers.map((g) => ({ userId: g.userId, function: g.function })));
    setConditionRules(
      step.conditionRulesOf
        .filter((r) => !r.isElse)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((r) => ({ fieldId: r.fieldId ?? 0, operator: r.operator ?? '', compareValue: r.compareValue ?? '', toStepId: r.toStepId ?? 0 })),
    );
    setElseToStepId(step.conditionRulesOf.find((r) => r.isElse)?.toStepId ?? 0);
  }, [step]);

  const isApprovalGate = type === 'ApprovalGate';
  const isCondition = type === 'Condition';
  const otherSteps = design.steps.filter((s) => s.id !== step.id);
  const returnTargetSteps = otherSteps.filter((s) => s.type !== 'Condition');

  // What spawnTasksForStep would actually create — computed client-side from gatekeepers ×
  // fan-out mode, no API round-trip needed (mock legend C.5: see the effect before publishing).
  // ClaimFirst fans out the same way PerPerson does (everyone sees it); only OneForStep narrows
  // to a single recipient.
  const previewTasks =
    taskFanOutMode !== 'OneForStep'
      ? gatekeepers.map((g) => ({ email: design.users.find((u) => u.id === g.userId)?.email, function: g.function }))
      : gatekeepers.slice(0, 1).map((g) => ({ email: design.users.find((u) => u.id === g.userId)?.email, function: g.function }));
  const actorOptions = actorType === 'Role' ? design.roleOptions : actorType === 'Tag' ? design.tagOptions : design.users.map((u) => u.email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: SaveStepPayload = {
      name,
      type,
      actorType,
      actorRef: actorType === 'Dynamic' ? dynamicRef : actorRefValues.join(','),
      slaValue: slaValue ? Number(slaValue) : null,
      slaUnit: slaUnit || null,
      escalateTo: escalateTo.join(',') || null,
      formDefinitionId: formDefinitionId || null,
      sequentialApproval,
      taskFanOutMode,
      resolutionRule,
      quorumCount: resolutionRule === 'Quorum' ? Number(quorumCount) || null : null,
      allowReturn,
      returnToStepId: allowReturn ? returnToStepId || null : null,
      nextStepId: nextStepId || null,
      gatekeepers,
      conditionRules: conditionRules.map((r) => ({
        fieldId: r.fieldId,
        operator: r.operator,
        compareValue: r.compareValue,
        toStepId: r.toStepId || null,
      })),
      conditionElseToStepId: elseToStepId || null,
    };
    await saveStep(step.id, payload);
    onSaved();
  }

  async function onRemove() {
    if (!(await confirmDialog('Remove this step? This cannot be undone.'))) return;
    const result = await removeStep(step.id);
    if (result.notice) notify(result.notice, 'info');
    onSaved(result.selectedStepId ?? undefined);
  }

  function addGatekeeper() {
    if (!gkUserId || !gkFunction) return;
    if (gatekeepers.some((g) => g.userId === gkUserId && g.function === gkFunction)) return;
    setGatekeepers((prev) => [...prev, { userId: gkUserId, function: gkFunction }]);
  }

  function addConditionRule() {
    const firstField = design.conditionFieldOptions[0];
    if (!firstField) return;
    setConditionRules((prev) => [
      ...prev,
      { fieldId: firstField.id, operator: (operatorsByType[firstField.type] ?? [])[0] ?? 'Equals', compareValue: '', toStepId: 0 },
    ]);
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="h6 text-uppercase text-muted">Step "{step.name}" settings</h2>

      <div className="mb-3">
        <label className="form-label">Name</label>
        <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="mb-3">
        <label className="form-label">Step type</label>
        <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
          {STEP_TYPES.filter((t) => !(step.orderIndex === 0 && t === 'Condition')).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {isApprovalGate && (
        <div className="mb-3 border rounded p-2">
          <label className="form-label">Gatekeepers</label>
          <ul className="list-group list-group-flush mb-2">
            {gatekeepers.map((g, i) => {
              const user = design.users.find((u) => u.id === g.userId);
              return (
                <li key={i} className="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                  <span className="small">
                    {user?.email} · {g.function}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setGatekeepers((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
            {gatekeepers.length === 0 && <li className="list-group-item px-0 text-muted small">No gatekeepers assigned yet.</li>}
          </ul>
          <div className="d-flex gap-2">
            <select className="form-select form-select-sm" value={gkUserId} onChange={(e) => setGkUserId(Number(e.target.value))}>
              {design.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
            <select className="form-select form-select-sm" value={gkFunction} onChange={(e) => setGkFunction(e.target.value)}>
              {design.gatekeeperFunctions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm btn-primary text-nowrap" onClick={addGatekeeper}>
              + Add
            </button>
          </div>
          <div className="form-check mt-2">
            <input
              type="checkbox"
              className="form-check-input"
              checked={sequentialApproval}
              onChange={(e) => setSequentialApproval(e.target.checked)}
              id="seqApproval"
            />
            <label className="form-check-label small" htmlFor="seqApproval">
              Require gatekeepers to approve in order (sequential)
            </label>
          </div>

          <div className="mt-3">
            <label className="form-label small">How many tasks to spawn</label>
            <select
              className="form-select form-select-sm"
              value={taskFanOutMode}
              onChange={(e) => {
                const mode = e.target.value;
                setTaskFanOutMode(mode);
                if (mode === 'ClaimFirst') setResolutionRule('Any');
              }}
            >
              <option value="PerPerson">One task per gatekeeper</option>
              <option value="OneForStep">One task for the whole step</option>
              <option value="ClaimFirst">One shared task, first to claim keeps it</option>
            </select>
            <div className="form-text">
              {taskFanOutMode === 'PerPerson'
                ? `${gatekeepers.length} gatekeeper(s) → ${gatekeepers.length} task(s), each with its own SLA clock.`
                : taskFanOutMode === 'ClaimFirst'
                ? 'Every gatekeeper sees it; whoever acts first keeps it and the rest are cancelled.'
                : 'Only the first-listed gatekeeper gets a task, even if more are assigned.'}
            </div>
          </div>

          <div className="mt-3">
            <label className="form-label small">Step passes when</label>
            {taskFanOutMode === 'ClaimFirst' ? (
              <div className="form-text mb-0">Locked to "just one task is approved" — that's what claim-first means.</div>
            ) : (
              <>
                <select className="form-select form-select-sm" value={resolutionRule} onChange={(e) => setResolutionRule(e.target.value)}>
                  <option value="All">All required tasks are approved</option>
                  <option value="Any">Just one task is approved</option>
                  <option value="Quorum">A minimum number are approved</option>
                </select>
                {resolutionRule === 'Quorum' && (
                  <input
                    type="number"
                    className="form-control form-control-sm mt-1"
                    style={{ width: 120 }}
                    placeholder="Count"
                    value={quorumCount}
                    onChange={(e) => setQuorumCount(e.target.value)}
                  />
                )}
              </>
            )}
          </div>

          {previewTasks.length > 0 && (
            <div className="mt-3 border-top pt-2">
              <div className="text-uppercase text-muted small fw-bold mb-1" style={{ fontSize: 10.5 }}>
                Preview — tasks this step will create
              </div>
              {previewTasks.map((p, i) => (
                <div key={i} className="small">
                  <span className="badge text-bg-secondary me-1">{step.orderIndex + 1}</span>
                  {name || step.name} — {p.function} <span className="text-muted">({p.email})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isCondition && (
        <div className="mb-3 border rounded p-2">
          <label className="form-label">Condition rules</label>
          {conditionRules.map((r, i) => {
            const field = design.conditionFieldOptions.find((f) => f.id === r.fieldId);
            const legalOps = field ? operatorsByType[field.type] ?? [] : [];
            const needsValue = r.operator !== 'IsEmpty' && r.operator !== 'IsNotEmpty';
            return (
              <div key={i} className="d-flex gap-1 mb-1 align-items-center flex-wrap">
                <select
                  className="form-select form-select-sm"
                  style={{ width: 140 }}
                  value={r.fieldId}
                  onChange={(e) => {
                    const fieldId = Number(e.target.value);
                    const f = design.conditionFieldOptions.find((x) => x.id === fieldId);
                    const ops = f ? operatorsByType[f.type] ?? [] : [];
                    setConditionRules((prev) => prev.map((x, idx) => (idx === i ? { ...x, fieldId, operator: ops[0] ?? '' } : x)));
                  }}
                >
                  {design.conditionFieldOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 130 }}
                  value={r.operator}
                  onChange={(e) => setConditionRules((prev) => prev.map((x, idx) => (idx === i ? { ...x, operator: e.target.value } : x)))}
                >
                  {legalOps.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                {needsValue && (
                  <input
                    className="form-control form-control-sm"
                    style={{ width: 100 }}
                    placeholder="Value"
                    value={r.compareValue}
                    onChange={(e) => setConditionRules((prev) => prev.map((x, idx) => (idx === i ? { ...x, compareValue: e.target.value } : x)))}
                  />
                )}
                <span className="small">→</span>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 130 }}
                  value={r.toStepId}
                  onChange={(e) => setConditionRules((prev) => prev.map((x, idx) => (idx === i ? { ...x, toStepId: Number(e.target.value) } : x)))}
                >
                  <option value={0}>— End request —</option>
                  {design.conditionTargetSteps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setConditionRules((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button type="button" className="btn btn-sm btn-outline-primary mt-1" onClick={addConditionRule}>
            + Add rule
          </button>
          <div className="d-flex gap-2 align-items-center mt-2 pt-2 border-top">
            <span className="small fw-bold">Else</span>
            <select className="form-select form-select-sm" value={elseToStepId} onChange={(e) => setElseToStepId(Number(e.target.value))}>
              <option value={0}>— End request —</option>
              {design.conditionTargetSteps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!isApprovalGate && !isCondition && (
        <>
          <div className="mb-3">
            <label className="form-label">Actor type</label>
            <select className="form-select" value={actorType} onChange={(e) => setActorType(e.target.value)}>
              {ACTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Who acts</label>
            {actorType === 'Dynamic' ? (
              <input className="form-control" value={dynamicRef} onChange={(e) => setDynamicRef(e.target.value)} />
            ) : (
              <TagSelect
                options={actorOptions.map((o) => ({ value: o, label: o }))}
                selected={actorRefValues}
                onChange={setActorRefValues}
              />
            )}
          </div>
        </>
      )}

      {!isCondition && (
        <>
          <div className="row">
            <div className="col-6 mb-3">
              <label className="form-label">SLA value</label>
              <input type="number" className="form-control" value={slaValue} onChange={(e) => setSlaValue(e.target.value)} />
            </div>
            <div className="col-6 mb-3">
              <label className="form-label">SLA unit</label>
              <select className="form-select" value={slaUnit} onChange={(e) => setSlaUnit(e.target.value)}>
                <option value="">—</option>
                <option value="Hours">Hours</option>
                <option value="CalendarDays">CalendarDays</option>
                <option value="WorkingDays">WorkingDays</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Escalate to</label>
            <TagSelect options={design.users.map((u) => ({ value: u.email, label: u.email }))} selected={escalateTo} onChange={setEscalateTo} />
            <div className="form-text">Who gets notified when this step's SLA is breached.</div>
          </div>

          <div className="mb-3">
            <label className="form-label">Form shown at this step</label>
            <select className="form-select" value={formDefinitionId} onChange={(e) => setFormDefinitionId(Number(e.target.value))}>
              <option value={0}>— none —</option>
              {design.forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {isApprovalGate && step.orderIndex > 0 && (
            <div className="mb-3 border rounded p-2">
              <label className="form-label">Actions allowed at this step</label>
              <div className="form-check">
                <input type="checkbox" className="form-check-input" checked disabled id="allowApprove" />
                <label className="form-check-label small" htmlFor="allowApprove">
                  Approve
                </label>
              </div>
              <div className="form-check">
                <input type="checkbox" className="form-check-input" checked disabled id="allowReject" />
                <label className="form-check-label small" htmlFor="allowReject">
                  Reject
                </label>
              </div>
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={allowReturn}
                  onChange={(e) => setAllowReturn(e.target.checked)}
                  id="allowReturn"
                />
                <label className="form-check-label small" htmlFor="allowReturn">
                  Return
                </label>
              </div>
              {allowReturn && (
                <select
                  className="form-select form-select-sm mt-2"
                  value={returnToStepId}
                  onChange={(e) => setReturnToStepId(Number(e.target.value))}
                >
                  <option value={0}>— Choose a step to return to —</option>
                  {returnTargetSteps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">Next step (on {type === 'ActionTask' ? 'Submit' : 'Approve'})</label>
            <select className="form-select" value={nextStepId} onChange={(e) => setNextStepId(Number(e.target.value))}>
              <option value={0}>— End request —</option>
              {otherSteps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <button type="submit" className="btn btn-primary w-100 mb-2">
        Save step
      </button>
      <button type="button" className="btn btn-outline-danger w-100" onClick={onRemove}>
        Remove step
      </button>
    </form>
  );
}
