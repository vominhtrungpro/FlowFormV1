import { FieldInput } from './FieldInput';

interface GroupField {
  id: number;
  parentFieldId: number | null;
  orderIndex: number;
  label: string;
  helpText?: string | null;
  type: string;
  required: boolean;
  width: string;
  options?: string | null;
  maxFileSizeMb?: number | null;
}

interface Props {
  fields: GroupField[];
  values: Record<string, string>;
  onChange: (fieldId: number, value: string) => void;
  disabled?: boolean;
  requestId?: number;
  pendingFiles?: Record<string, File>;
  onPendingFile?: (fieldId: number, file: File) => void;
}

const widthClass: Record<string, string> = { Full: 'col-12', Half: 'col-md-6', Third: 'col-md-4' };

// Mirrors _FieldGroup.cshtml: top-level fields flow left-to-right by width (Full/Half/Third), and a
// Section field renders as its own bordered box holding its children — sections can't nest, so this
// only ever needs one level of recursion, done here inline rather than via a self-reference.
export function FieldGroup({ fields, values, onChange, disabled, requestId, pendingFiles, onPendingFile }: Props) {
  const topLevel = fields.filter((f) => f.parentFieldId == null).sort((a, b) => a.orderIndex - b.orderIndex);
  const childrenOf = (sectionId: number) =>
    fields.filter((f) => f.parentFieldId === sectionId).sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="row">
      {topLevel.map((f) => (
        <div key={f.id} className={`mb-3 ${widthClass[f.width] ?? 'col-12'}`}>
          {f.type === 'Section' ? (
            <div className="card h-100 mb-0">
              <div className="card-header">{f.label}</div>
              <div className="card-body">
                {f.helpText && <p className="text-muted small mb-2">{f.helpText}</p>}
                <div className="row">
                  {childrenOf(f.id).map((c) => (
                    <div key={c.id} className={`mb-3 ${widthClass[c.width] ?? 'col-12'}`}>
                      <FieldInput
                        field={c}
                        value={values[String(c.id)] ?? ''}
                        onChange={(v) => onChange(c.id, v)}
                        disabled={disabled}
                        requestId={requestId}
                        pendingFileName={pendingFiles?.[String(c.id)]?.name}
                        onPendingFile={onPendingFile ? (file) => onPendingFile(c.id, file) : undefined}
                      />
                    </div>
                  ))}
                  {childrenOf(f.id).length === 0 && <p className="text-muted small mb-0">No fields in this section yet.</p>}
                </div>
              </div>
            </div>
          ) : (
            <FieldInput
              field={f}
              value={values[String(f.id)] ?? ''}
              onChange={(v) => onChange(f.id, v)}
              disabled={disabled}
              requestId={requestId}
              pendingFileName={pendingFiles?.[String(f.id)]?.name}
              onPendingFile={onPendingFile ? (file) => onPendingFile(f.id, file) : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}
