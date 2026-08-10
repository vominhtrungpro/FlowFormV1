import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addField,
  FieldDetail,
  FormDesignResponse,
  getFormDesign,
  removeField,
  reorderFields,
  ReorderNode,
  saveFormMeta,
} from '../api/forms';
import { FieldSettingsPanel } from '../components/FieldSettingsPanel';
import { FieldGroup } from '../components/FieldGroup';
import { useConfirm } from '../components/ConfirmContext';

const PALETTE = [
  'Text', 'LongText', 'Number', 'Date', 'Dropdown', 'YesNo', 'Checklist',
  'Table', 'FileUpload', 'PeoplePicker', 'ReferenceLookup', 'ExternalLookup', 'Section',
];

function computeStructure(fields: FieldDetail[]): ReorderNode[] {
  const topLevel = fields.filter((f) => f.parentFieldId == null).sort((a, b) => a.orderIndex - b.orderIndex);
  return topLevel.map((f) => {
    if (f.type === 'Section') {
      const children = fields
        .filter((c) => c.parentFieldId === f.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => c.id);
      return { id: f.id, children };
    }
    return { id: f.id };
  });
}

function removeFromStructure(structure: ReorderNode[], id: number): ReorderNode[] {
  return structure
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: n.children.filter((c) => c !== id) } : n));
}

export function FormDesign() {
  const { id } = useParams();
  const formId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const fieldId = searchParams.get('fieldId') ? Number(searchParams.get('fieldId')) : undefined;
  const navigate = useNavigate();

  const [design, setDesign] = useState<FormDesignResponse | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [metaName, setMetaName] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const confirmDialog = useConfirm();

  async function load(selectFieldId?: number) {
    const data = await getFormDesign(formId, selectFieldId ?? fieldId);
    setDesign(data);
    setMetaName(data.form.name);
    if (data.selected) setSearchParams({ fieldId: String(data.selected.id) }, { replace: true });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  async function onAddField(type: string, parentFieldId?: number) {
    const { id: newId } = await addField(formId, type, parentFieldId);
    await load(newId);
  }

  function onFieldDragStart(e: React.DragEvent, id: number) {
    setDraggedId(id);
    // Some browsers/webviews silently abort a drag session that never calls setData() on
    // dragstart — matching the old app's wireDrag(), which always sets a payload even though
    // the actual reorder here only ever reads React state (draggedId) back on drop.
    e.dataTransfer.setData('reorder-field-id', String(id));
    e.dataTransfer.effectAllowed = 'move';
  }

  async function onRemoveField(fieldToRemoveId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirmDialog('Remove this field? This cannot be undone.'))) return;
    const keepSelection = design?.selected?.id !== fieldToRemoveId ? design?.selected?.id : undefined;
    await removeField(fieldToRemoveId);
    await load(keepSelection);
  }

  async function submitStructure(structure: ReorderNode[]) {
    await reorderFields(formId, structure);
    await load(design?.selected?.id);
  }

  async function onDropOnTopLevel(e: React.DragEvent, beforeId?: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const newType = e.dataTransfer.getData('new-field-type');
    if (newType) return onAddField(newType);
    if (!design || draggedId == null) return;

    let structure = removeFromStructure(computeStructure(design.fields), draggedId);
    const insertAt = beforeId != null ? structure.findIndex((n) => n.id === beforeId) : structure.length;
    structure.splice(insertAt < 0 ? structure.length : insertAt, 0, { id: draggedId });
    setDraggedId(null);
    await submitStructure(structure);
  }

  async function onDropOnSection(e: React.DragEvent, sectionId: number, beforeChildId?: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const newType = e.dataTransfer.getData('new-field-type');
    if (newType) {
      if (newType === 'Section') return; // sections can't nest
      return onAddField(newType, sectionId);
    }
    if (!design || draggedId == null || draggedId === sectionId) return;
    const draggedField = design.fields.find((f) => f.id === draggedId);
    if (draggedField?.type === 'Section') return; // sections can't nest

    const structure = removeFromStructure(computeStructure(design.fields), draggedId);
    const section = structure.find((n) => n.id === sectionId);
    if (!section) return;
    section.children = section.children ?? [];
    const insertAt = beforeChildId != null ? section.children.indexOf(beforeChildId) : section.children.length;
    section.children.splice(insertAt < 0 ? section.children.length : insertAt, 0, draggedId);
    setDraggedId(null);
    await submitStructure(structure);
  }

  async function onSaveDraft() {
    setSaving(true);
    try {
      await saveFormMeta(formId, metaName, 'Draft');
      await load(design?.selected?.id);
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    setSaving(true);
    try {
      await saveFormMeta(formId, metaName, 'Published');
      await load(design?.selected?.id);
    } finally {
      setSaving(false);
    }
  }

  if (!design) return <div className="p-3 text-muted">Loading…</div>;

  const topLevelFields = design.fields.filter((f) => f.parentFieldId == null).sort((a, b) => a.orderIndex - b.orderIndex);
  const childrenOf = (parentId: number) => design.fields.filter((f) => f.parentFieldId === parentId).sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div>
      <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigate('/forms')}>
        ← Back to list
      </button>

      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="text-uppercase text-muted small">Form builder</div>
          <h1 className="h3">{design.form.name}</h1>
          <div className="text-muted small">
            v{design.form.versionNumber} · {design.form.status}
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <input className="form-control form-control-sm" value={metaName} onChange={(e) => setMetaName(e.target.value)} style={{ width: 180 }} />
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setPreviewOpen(true)}>
            Preview
          </button>
          <button className="btn btn-sm btn-outline-primary" disabled={saving} onClick={onSaveDraft}>
            Save as draft
          </button>
          <button className="btn btn-sm btn-success" disabled={saving} onClick={onPublish}>
            Publish
          </button>
        </div>
      </div>

      <div className="designer">
        <div className="dz-side">
          <div className="text-uppercase small text-muted mb-2" style={{ fontFamily: 'var(--f-disp)', letterSpacing: '.1em', fontSize: 11 }}>
            Field types
          </div>
          {PALETTE.map((t) => (
            <div
              key={t}
              className="palette-i"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('new-field-type', t);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onDoubleClick={() => onAddField(t)}
              title="Drag onto the canvas, or double-click to add"
            >
              {t === 'ReferenceLookup' ? 'Master data lookup' : t === 'ExternalLookup' ? 'System lookup' : t}
            </div>
          ))}
          <div className="hint" style={{ marginTop: 6 }}>
            Drag a type onto the canvas, or double-click to add.
          </div>
        </div>

        <div
          className={`dz-canvas ${dropTarget === 'top' ? 'drop-target' : ''}`}
          id="fieldCanvas"
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget('top');
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
          }}
          onDrop={(e) => onDropOnTopLevel(e)}
        >
          <div className="canvas-label">
            {design.form.name} · v{design.form.versionNumber} · {design.form.status}
          </div>
          {topLevelFields.length === 0 && <p className="text-muted small mb-3">No fields yet — drag a type onto the canvas.</p>}
          {topLevelFields.map((f) =>
            f.type === 'Section' ? (
              <div key={f.id} className={`fb-section ${f.id === draggedId ? 'dragging' : ''}`}>
                <a
                  className={`fb-section-h d-flex align-items-center justify-content-between ${f.id === design.selected?.id ? 'on' : ''}`}
                  draggable
                  onDragStart={(e) => onFieldDragStart(e, f.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget('top');
                  }}
                  onDrop={(e) => onDropOnTopLevel(e, f.id)}
                  onClick={() => load(f.id)}
                >
                  <span>
                    <strong>{f.label}</strong> <span className="badge text-bg-secondary ms-1">Section</span>
                  </span>
                  <button type="button" className="row-remove" title="Remove section" onClick={(e) => onRemoveField(f.id, e)}>
                    ✕
                  </button>
                </a>
                <div
                  className={`fb-section-children ${dropTarget === `section-${f.id}` ? 'drop-target' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget(`section-${f.id}`);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                  }}
                  onDrop={(e) => onDropOnSection(e, f.id)}
                >
                  {childrenOf(f.id).map((c) => (
                    <a
                      key={c.id}
                      className={`fb-field small d-flex align-items-center justify-content-between ${c.id === design.selected?.id ? 'on' : ''} ${c.id === draggedId ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        onFieldDragStart(e, c.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropTarget(`section-${f.id}`);
                      }}
                      onDrop={(e) => onDropOnSection(e, f.id, c.id)}
                      onClick={() => load(c.id)}
                    >
                      <span>
                        {c.label} <span className="text-muted">({c.type})</span>
                      </span>
                      <button type="button" className="row-remove" title="Remove field" onClick={(e) => onRemoveField(c.id, e)}>
                        ✕
                      </button>
                    </a>
                  ))}
                  {childrenOf(f.id).length === 0 && <div className="text-muted small">Drop fields here.</div>}
                </div>
              </div>
            ) : (
              <a
                key={f.id}
                className={`fb-field d-flex align-items-center justify-content-between ${f.id === design.selected?.id ? 'on' : ''} ${f.id === draggedId ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => onFieldDragStart(e, f.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget('top');
                }}
                onDrop={(e) => onDropOnTopLevel(e, f.id)}
                onClick={() => load(f.id)}
              >
                <span>
                  <strong>{f.label}</strong> <span className="ms-2 badge text-bg-secondary">{f.type}</span>
                  {f.required && <span className="ms-1 text-danger">*</span>}
                </span>
                <button type="button" className="row-remove" title="Remove field" onClick={(e) => onRemoveField(f.id, e)}>
                  ✕
                </button>
              </a>
            ),
          )}
          <button type="button" className="dz-add" onClick={() => onAddField('Text')}>
            + Add field
          </button>
        </div>

        <div className="dz-side r">
          {design.selected ? (
            <FieldSettingsPanel field={design.selected} onSaved={(selectId) => load(selectId)} />
          ) : (
            <p className="text-muted small">No field selected — add or pick one from the canvas.</p>
          )}
        </div>
      </div>

      {previewOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(14,23,32,.45)', zIndex: 1050 }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="card"
            style={{ width: 640, maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header d-flex align-items-center">
              <span>Preview · {design.form.name}</span>
              <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            <div className="card-body">
              {design.fields.length === 0 ? (
                <p className="text-muted small mb-0">No fields yet — nothing to preview.</p>
              ) : (
                <FieldGroup
                  fields={design.fields}
                  values={previewValues}
                  onChange={(fieldId, v) => setPreviewValues((prev) => ({ ...prev, [String(fieldId)]: v }))}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
