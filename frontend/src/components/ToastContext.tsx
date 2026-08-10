import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

type NotifyFn = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<NotifyFn | null>(null);

// Lightweight replacement for window.alert() — a small stack of auto-dismissing cards instead of
// a blocking native browser dialog.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const notify = useCallback<NotifyFn>((message, variant = 'info') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.variant}`}>
            <span>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
