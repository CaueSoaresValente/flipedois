import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType>({} as ToastContextType);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    // NEVER allow empty messages — always show something
    const safeMessage = message || (type === 'error' ? 'Ocorreu um erro' : 'Operação realizada');
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message: safeMessage }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const typeConfig: Record<ToastType, { bg: string; border: string; iconBg: string; icon: string; textColor: string }> = {
    success: {
      bg: 'bg-white dark:bg-slate-800',
      border: 'border-emerald-200 dark:border-emerald-700',
      iconBg: 'bg-emerald-500',
      icon: '✓',
      textColor: 'text-slate-800 dark:text-slate-100',
    },
    error: {
      bg: 'bg-white dark:bg-slate-800',
      border: 'border-red-200 dark:border-red-700',
      iconBg: 'bg-red-500',
      icon: '✕',
      textColor: 'text-slate-800 dark:text-slate-100',
    },
    warning: {
      bg: 'bg-white dark:bg-slate-800',
      border: 'border-amber-200 dark:border-amber-700',
      iconBg: 'bg-amber-500',
      icon: '⚠',
      textColor: 'text-slate-800 dark:text-slate-100',
    },
    info: {
      bg: 'bg-white dark:bg-slate-800',
      border: 'border-blue-200 dark:border-blue-700',
      iconBg: 'bg-blue-500',
      icon: 'ℹ',
      textColor: 'text-slate-800 dark:text-slate-100',
    },
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container — top right, above everything */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((toast) => {
          const config = typeConfig[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium min-w-[320px] max-w-[440px] ${config.bg} ${config.border}`}
              style={{ animation: 'toastSlideIn 0.3s ease-out' }}
            >
              <div
                className={`w-7 h-7 rounded-full ${config.iconBg} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}
              >
                {config.icon}
              </div>
              <span className={`flex-1 ${config.textColor} leading-snug`}>
                {toast.message}
              </span>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors text-lg leading-none flex-shrink-0 mt-0.5"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
