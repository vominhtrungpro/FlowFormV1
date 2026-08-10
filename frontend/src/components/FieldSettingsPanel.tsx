import { useEffect, useState } from 'react';
import { FieldDetail, removeField, saveField, SaveFieldPayload, TableColumnPayload } from '../api/forms';
import { useConfirm } from './ConfirmContext';

interface Props {
  field: FieldDetail;
  onSaved: (selectFieldId?: number) => void;
}

const FIELD_TYPES = [
  'Text', 'LongText', 'Number', 'Date', 'Dropdown', 'YesNo', 'Checklist',
  'Table', 'FileUpload', 'PeoplePicker', 'ReferenceLookup', 'ExternalLookup', 'Section',
];
const WIDTHS = ['Full', 'Half', 'Third'];

// Local-only shape for the column editor: the Dropdown options live as the raw comma-separated
// string the user is typing (optionsText), not the parsed array — parsing on every keystroke and
// feeding the result straight back into a controlled input's value means a trailing "," (or the
// gap while typing the next item) gets silently stripped before the user can type past it, so a
// comma-separated list could never actually be entered. Only split/trim/filter at submit time.
interface LocalColumn {
  name: string;
  type: 'Text' | 'Dropdown';
  optionsText: string;
}

function parseTableColumns(options: string | null): LocalColumn[] {
  if (!options) return [];
  try {
    const parsed: TableColumnPayload[] = JSON.parse(options);
    return parsed.map((c) => ({ name: c.name, type: c.type, optionsText: (c.options ?? []).join(',') }));
  } catch {
    return [];
  }
}

export function FieldSettingsPanel({ field, onSaved }: Props) {
  const confirmDialog = useConfirm();
  const [label, setLabel] = useState(field.label);
  const [helpText, setHelpText] = useState(field.helpText ?? '');
  const [type, setType] = useState(field.type);
  const [width, setWidth] = useState(field.width);
  const [required, setRequired] = useState(field.required);
  const [readOnlyAfterSubmit, setReadOnlyAfterSubmit] = useState(field.readOnlyAfterSubmit);
  const [defaultValue, setDefaultValue] = useState(field.defaultValue ?? '');
  const [options, setOptions] = useState(field.type === 'Table' ? '' : field.options ?? '');
  const [tableColumns, setTableColumns] = useState<LocalColumn[]>(field.type === 'Table' ? parseTableColumns(field.options) : []);
  const [minLength, setMinLength] = useState(field.minLength?.toString() ?? '');
  const [maxLength, setMaxLength] = useState(field.maxLength?.toString() ?? '');
  const [minValue, setMinValue] = useState(field.minValue?.toString() ?? '');
  const [maxValue, setMaxValue] = useState(field.maxValue?.toString() ?? '');
  const [minDate, setMinDate] = useState(field.minDate?.slice(0, 10) ?? '');
  const [maxDate, setMaxDate] = useState(field.maxDate?.slice(0, 10) ?? '');
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(field.maxFileSizeMb?.toString() ?? '');

  useEffect(() => {
    setLabel(field.label);
    setHelpText(field.helpText ?? '');
    setType(field.type);
    setWidth(field.width);
    setRequired(field.required);
    setReadOnlyAfterSubmit(field.readOnlyAfterSubmit);
    setDefaultValue(field.defaultValue ?? '');
    setOptions(field.type === 'Table' ? '' : field.options ?? '');
    setTableColumns(field.type === 'Table' ? parseTableColumns(field.options) : []);
    setMinLength(field.minLength?.toString() ?? '');
    setMaxLength(field.maxLength?.toString() ?? '');
    setMinValue(field.minValue?.toString() ?? '');
    setMaxValue(field.maxValue?.toString() ?? '');
    setMinDate(field.minDate?.slice(0, 10) ?? '');
    setMaxDate(field.maxDate?.slice(0, 10) ?? '');
    setMaxFileSizeMb(field.maxFileSizeMb?.toString() ?? '');
  }, [field]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: SaveFieldPayload = {
      label,
      helpText: helpText || null,
      type,
      width,
      required,
      readOnlyAfterSubmit,
      defaultValue: defaultValue || null,
      options: type === 'Dropdown' || type === 'Checklist' ? options : null,
      tableColumns:
        type === 'Table'
          ? tableColumns.map((c) => ({
              name: c.name,
              type: c.type,
              options: c.type === 'Dropdown' ? c.optionsText.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
            }))
          : undefined,
      minLength: minLength ? Number(minLength) : null,
      maxLength: maxLength ? Number(maxLength) : null,
      minValue: minValue ? Number(minValue) : null,
      maxValue: maxValue ? Number(maxValue) : null,
      minDate: minDate || null,
      maxDate: maxDate || null,
      maxFileSizeMb: maxFileSizeMb ? Number(maxFileSizeMb) : null,
    };
    await saveField(field.id, payload);
    onSaved();
  }

  async function onRemove() {
    if (!(await confirmDialog('Remove this field? This cannot be undone.'))) return;
    await removeField(field.id);
    onSaved();
  }

  function addColumn() {
    setTableColumns((prev) => [...prev, { name: '', type: 'Text', optionsText: '' }]);
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="h6 text-uppercase text-muted">Field "{field.label}" settings</h2>

      <div className="mb-3">
        <label className="form-label">Label</label>
        <input className="form-control" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="form-label">Help text</label>
        <input className="form-control" value={helpText} onChange={(e) => setHelpText(e.target.value)} />
      </div>
      <div className="row">
        <div className="col-6 mb-3">
          <label className="form-label">Type</label>
          <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'ReferenceLookup' ? 'Master data lookup' : t === 'ExternalLookup' ? 'System lookup' : t}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 mb-3">
          <label className="form-label">Width</label>
          <select className="form-select" value={width} onChange={(e) => setWidth(e.target.value)}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-check mb-1">
        <input type="checkbox" className="form-check-input" checked={required} onChange={(e) => setRequired(e.target.checked)} id="fldRequired" />
        <label className="form-check-label small" htmlFor="fldRequired">
          Required
        </label>
      </div>
      <div className="form-check mb-3">
        <input
          type="checkbox"
          className="form-check-input"
          checked={readOnlyAfterSubmit}
          onChange={(e) => setReadOnlyAfterSubmit(e.target.checked)}
          id="fldReadonly"
        />
        <label className="form-check-label small" htmlFor="fldReadonly">
          Read-only after submit
        </label>
      </div>

      {(type === 'Dropdown' || type === 'Checklist') && (
        <div className="mb-3">
          <label className="form-label">Options (comma-separated)</label>
          <input className="form-control" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Low,Medium,High" />
        </div>
      )}

      {(type === 'Text' || type === 'LongText') && (
        <div className="row">
          <div className="col-6 mb-3">
            <label className="form-label">Min length</label>
            <input type="number" className="form-control" value={minLength} onChange={(e) => setMinLength(e.target.value)} />
          </div>
          <div className="col-6 mb-3">
            <label className="form-label">Max length</label>
            <input type="number" className="form-control" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} />
          </div>
        </div>
      )}

      {type === 'Number' && (
        <div className="row">
          <div className="col-6 mb-3">
            <label className="form-label">Min value</label>
            <input type="number" className="form-control" value={minValue} onChange={(e) => setMinValue(e.target.value)} />
          </div>
          <div className="col-6 mb-3">
            <label className="form-label">Max value</label>
            <input type="number" className="form-control" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
          </div>
        </div>
      )}

      {type === 'Date' && (
        <div className="row">
          <div className="col-6 mb-3">
            <label className="form-label">Min date</label>
            <input type="date" className="form-control" value={minDate} onChange={(e) => setMinDate(e.target.value)} />
          </div>
          <div className="col-6 mb-3">
            <label className="form-label">Max date</label>
            <input type="date" className="form-control" value={maxDate} onChange={(e) => setMaxDate(e.target.value)} />
          </div>
        </div>
      )}

      {type === 'FileUpload' && (
        <div className="mb-3">
          <label className="form-label">Max file size (MB)</label>
          <input type="number" className="form-control" value={maxFileSizeMb} onChange={(e) => setMaxFileSizeMb(e.target.value)} />
        </div>
      )}

      {type === 'Table' && (
        <div className="mb-3 border rounded p-2">
          <label className="form-label">Table columns</label>
          {tableColumns.map((col, i) => (
            <div key={i} className="d-flex gap-1 mb-1 align-items-center">
              <input
                className="form-control form-control-sm"
                placeholder="Column name"
                value={col.name}
                onChange={(e) => setTableColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, name: e.target.value } : c)))}
              />
              <select
                className="form-select form-select-sm"
                style={{ width: 110 }}
                value={col.type}
                onChange={(e) =>
                  setTableColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, type: e.target.value as 'Text' | 'Dropdown' } : c)))
                }
              >
                <option value="Text">Text</option>
                <option value="Dropdown">Dropdown</option>
              </select>
              {col.type === 'Dropdown' && (
                <input
                  className="form-control form-control-sm"
                  placeholder="Options (comma), e.g. 1,2,3"
                  value={col.optionsText}
                  onChange={(e) =>
                    setTableColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, optionsText: e.target.value } : c)))
                  }
                />
              )}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => setTableColumns((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={addColumn}>
            + Add column
          </button>
        </div>
      )}

      {type === 'Section' && <div className="alert alert-secondary py-2 small">Sections hold other fields — drag fields onto it on the canvas.</div>}

      {(type === 'ReferenceLookup' || type === 'ExternalLookup' || type === 'PeoplePicker') && (
        <div className="alert alert-secondary py-2 small">No extra settings for this type in this MVP.</div>
      )}

      <div className="mb-3">
        <label className="form-label">Default value</label>
        <input className="form-control" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
      </div>

      <button type="submit" className="btn btn-primary w-100 mb-2">
        Save field
      </button>
      <button type="button" className="btn btn-outline-danger w-100" onClick={onRemove}>
        Remove field
      </button>
    </form>
  );
}
