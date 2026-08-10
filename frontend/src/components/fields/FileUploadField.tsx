import { useRef, useState } from 'react';
import { uploadField } from '../../api/requests';

interface Props {
  requestId?: number;
  fieldId: number;
  maxFileSizeMb?: number | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  pendingFileName?: string;
  onPendingFile?: (file: File) => void;
}

function fileNameOf(path: string) {
  const rawName = path.split('/').pop() ?? path;
  return rawName.includes('_') ? rawName.split('_').slice(1).join('_') : rawName;
}

// Port of the old app's `.dropzone` — a <label> wrapping a hidden file input, click-to-browse or
// drag-and-drop, showing the chosen/uploaded file's name in place of the placeholder text.
export function FileUploadField({ requestId, fieldId, maxFileSizeMb, value, onChange, disabled, pendingFileName, onPendingFile }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (maxFileSizeMb && file.size > maxFileSizeMb * 1024 * 1024) {
      setError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — max allowed is ${maxFileSizeMb} MB.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (!requestId) {
      // No request row yet (still on the Create page) — hold the file and let the parent
      // upload it right after the request is created, so "Save and continue" stays one click.
      if (onPendingFile) {
        setError(null);
        onPendingFile(file);
      } else {
        setError('Save the request first before attaching files.');
      }
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { path } = await uploadField(requestId, fieldId, file);
      onChange(path);
    } finally {
      setUploading(false);
    }
  }

  if (disabled) {
    if (!value) {
      return (
        <div className="dropzone disabled">
          <span>No file uploaded</span>
        </div>
      );
    }
    return (
      <div>
        <a href={`${import.meta.env.VITE_API_URL}${value}`} target="_blank" rel="noreferrer" download className="btn btn-sm btn-outline-secondary">
          Download · {fileNameOf(value)}
        </a>
      </div>
    );
  }

  const label = uploading
    ? 'Uploading…'
    : value
    ? fileNameOf(value)
    : pendingFileName
    ? `${pendingFileName} (will upload on submit)`
    : `Drop a file here or browse${maxFileSizeMb ? ` · up to ${maxFileSizeMb} MB` : ''}`;

  return (
    <div>
      {value && !uploading && (
        <div className="mb-2">
          <a href={`${import.meta.env.VITE_API_URL}${value}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
            Download current file
          </a>
        </div>
      )}
      <label
        className={`dropzone ${dragging ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input ref={inputRef} type="file" style={{ display: 'none' }} disabled={uploading} onChange={(e) => handleFile(e.target.files?.[0])} />
        <span>{label}</span>
      </label>
      {error && <div className="text-danger small mt-1">{error}</div>}
    </div>
  );
}
