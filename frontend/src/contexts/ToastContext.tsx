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
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const typeStyles: Record<ToastType, string> = {
        success: 'bg-emerald-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-blue-500',
    };

    const typeIcons: Record<ToastType, string> = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            {/* Toast container */}
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-medium animate-slide-in min-w-[300px] max-w-[420px]"
                        style={{
                            animation: 'slideIn 0.3s ease-out',
                        }}
                    >
                        <div
                            className={`w-7 h-7 rounded-full ${typeStyles[toast.type]} flex items-center justify-center text-xs font-bold flex-shrink-0`}
                        >
                            {typeIcons[toast.type]}
                        </div>
                        <span className="flex-1 text-slate-800 dark:text-white">
                            {toast.message}
                        </span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors text-lg leading-none flex-shrink-0"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
            <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .fixed .pointer-events-auto {
          background: white;
          border: 1px solid #e2e8f0;
        }
        @media (prefers-color-scheme: dark) {
          .fixed .pointer-events-auto {
            background: #1e293b;
            border-color: #334155;
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
