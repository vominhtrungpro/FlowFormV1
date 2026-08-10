import { useMemo, useState } from 'react';
import { lookupLimsGrade, LimsLookupResult } from '../../api/lims';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const QUICK_CODES = ['H5604', 'H4560', 'P3125'];

export function ExternalLookupField({ value, onChange, disabled }: Props) {
  const stored: LimsLookupResult | null = useMemo(() => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }, [value]);

  const [code, setCode] = useState(stored?.code ?? '');
  const [simulateError, setSimulateError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LimsLookupResult | null>(stored);
  const [error, setError] = useState<string | null>(null);

  async function doLookup(lookupCode?: string) {
    const c = (lookupCode ?? code).trim();
    if (!c) return;
    setLoading(true);
    setError(null);
    try {
      const data = await lookupLimsGrade(c, simulateError);
      setResult(data);
      if (data.found) onChange(JSON.stringify(data));
      else onChange('');
    } catch {
      setError('Could not reach LIMS just now. Try again.');
      onChange('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="d-flex gap-2 mb-2">
        <input className="form-control" value={code} disabled={disabled} onChange={(e) => setCode(e.target.value)} placeholder="Grade code" />
        <button type="button" className="btn btn-outline-primary text-nowrap" disabled={disabled || loading} onClick={() => doLookup()}>
          Look up
        </button>
      </div>
      <div className="d-flex gap-2 mb-2 align-items-center">
        {QUICK_CODES.map((c) => (
          <button
            key={c}
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={disabled}
            onClick={() => {
              setCode(c);
              doLookup(c);
            }}
          >
            {c}
          </button>
        ))}
        <div className="form-check ms-2">
          <input type="checkbox" className="form-check-input" checked={simulateError} onChange={(e) => setSimulateError(e.target.checked)} id="simErr" />
          <label className="form-check-label small" htmlFor="simErr">
            Simulate error
          </label>
        </div>
      </div>

      {loading && <p className="text-muted small">Looking up…</p>}
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {!loading && result && !result.found && <div className="alert alert-warning py-2 small">Grade "{result.code}" wasn't found in LIMS.</div>}
      {!loading && result?.found && (
        <div>
          <div className="d-flex gap-2 align-items-center mb-2">
            <span className="badge text-bg-info">Fetched from LIMS</span>
            <span className="font-monospace small">{result.code}</span>
            <span className="text-muted small">— {result.description}</span>
          </div>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Method</th>
                <th>Standard</th>
              </tr>
            </thead>
            <tbody>
              {(result.specs ?? []).map((s, i) => (
                <tr key={i}>
                  <td>{s.attribute}</td>
                  <td className="font-monospace small">{s.method}</td>
                  <td className="font-monospace small">{s.standard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
