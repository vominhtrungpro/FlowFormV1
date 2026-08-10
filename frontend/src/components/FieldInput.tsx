import { FieldDto } from '../api/requests';
import { TableField } from './fields/TableField';
import { FileUploadField } from './fields/FileUploadField';
import { PeoplePickerField } from './fields/PeoplePickerField';
import { MasterLookupField } from './fields/MasterLookupField';
import { ExternalLookupField } from './fields/ExternalLookupField';

interface Props {
  field: FieldDto;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  requestId?: number;
  pendingFileName?: string;
  onPendingFile?: (file: File) => void;
}

export function FieldInput({ field, value, onChange, disabled, requestId, pendingFileName, onPendingFile }: Props) {
  // Sections are structural grouping only in the designer — they never collect a value
  // themselves, so they render nothing here (their children render as normal fields).
  if (field.type === 'Section') return null;

  const label = (
    <label className="form-label">
      {field.label}
      {field.required && <span className="text-danger"> *</span>}
    </label>
  );

  let control: JSX.Element;
  switch (field.type) {
    case 'LongText':
      control = (
        <textarea
          className="form-control"
          rows={3}
          value={value ?? ''}
          required={field.required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'Number':
      control = (
        <input
          type="number"
          className="form-control"
          value={value ?? ''}
          required={field.required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'Date':
      control = (
        <input
          type="date"
          className="form-control"
          value={value ?? ''}
          required={field.required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'Dropdown':
      control = (
        <select
          className="form-select"
          value={value ?? ''}
          required={field.required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {(field.options ?? '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
      );
      break;
    case 'YesNo':
      control = (
        <select
          className="form-select"
          value={value ?? ''}
          required={field.required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      );
      break;
    case 'Checklist':
      control = (
        <div>
          {(field.options ?? '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
            .map((o) => {
              const selected = (value ?? '').split(',').filter(Boolean);
              const checked = selected.includes(o);
              return (
                <div className="form-check" key={o}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected, o] : selected.filter((s) => s !== o);
                      onChange(next.join(','));
                    }}
                  />
                  <label className="form-check-label">{o}</label>
                </div>
              );
            })}
        </div>
      );
      break;
    case 'Table':
      control = <TableField optionsJson={field.options} value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'FileUpload':
      control = (
        <FileUploadField
          requestId={requestId}
          fieldId={field.id}
          maxFileSizeMb={field.maxFileSizeMb}
          value={value}
          onChange={onChange}
          disabled={disabled}
          pendingFileName={pendingFileName}
          onPendingFile={onPendingFile}
        />
      );
      break;
    case 'PeoplePicker':
      control = <PeoplePickerField value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'ReferenceLookup':
      control = <MasterLookupField value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'ExternalLookup':
      control = <ExternalLookupField value={value} onChange={onChange} disabled={disabled} />;
      break;
    case 'Text':
    default:
      control = (
        <input
          type="text"
          className="form-control"
          value={value ?? ''}
          required={field.required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className="mb-3">
      {label}
      {control}
      {field.helpText && <div className="form-text">{field.helpText}</div>}
    </div>
  );
}
