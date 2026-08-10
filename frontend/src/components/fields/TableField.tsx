import { useMemo } from 'react';

interface Column {
  name: string;
  type: 'Text' | 'Dropdown';
  options?: string[];
}

interface Props {
  optionsJson: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// Ports the Table field type's grid editor: columns come from Field.Options (JSON), the whole
// grid is carried as an array-of-arrays JSON string in the field's own value — same convention
// as the old app's hidden `grid-data` companion input.
export function TableField({ optionsJson, value, onChange, disabled }: Props) {
  const columns: Column[] = useMemo(() => {
    if (!optionsJson) return [];
    try {
      return JSON.parse(optionsJson);
    } catch {
      return [];
    }
  }, [optionsJson]);

  const rows: string[][] = useMemo(() => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }, [value]);

  function setCell(rowIdx: number, colIdx: number, cellValue: string) {
    const next = rows.map((r) => [...r]);
    next[rowIdx][colIdx] = cellValue;
    onChange(JSON.stringify(next));
  }

  function addRow() {
    onChange(JSON.stringify([...rows, columns.map(() => '')]));
  }

  function removeRow(rowIdx: number) {
    onChange(JSON.stringify(rows.filter((_, i) => i !== rowIdx)));
  }

  if (columns.length === 0) {
    return <div className="text-muted small">This table has no columns configured yet.</div>;
  }

  return (
    <div>
      <table className="table table-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.name}>{c.name}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((c, ci) =>
                c.type === 'Dropdown' ? (
                  <td key={ci}>
                    <select className="form-select form-select-sm" value={row[ci] ?? ''} disabled={disabled} onChange={(e) => setCell(ri, ci, e.target.value)}>
                      <option value=""></option>
                      {(c.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : (
                  <td key={ci}>
                    <input className="form-control form-control-sm" value={row[ci] ?? ''} disabled={disabled} onChange={(e) => setCell(ri, ci, e.target.value)} />
                  </td>
                ),
              )}
              <td>
                {!disabled && (
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeRow(ri)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={addRow}>
          + Add row
        </button>
      )}
    </div>
  );
}
