import { createContext, useCallback, useContext, useState } from 'react';

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Replacement for window.confirm() — a small styled overlay instead of a blocking native dialog,
// resolved via the same Promise<boolean> shape so call sites read the same either way:
// `if (!(await confirmDialog('Delete this?'))) return;`
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirmDialog = useCallback<ConfirmFn>((message) => {
    return new Promise<boolean>((resolve) => setState({ message, resolve }));
  }, []);

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      {children}
      {state && (
        <div className="confirm-overlay" onClick={() => close(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3">{state.message}</p>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => close(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => close(true)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
