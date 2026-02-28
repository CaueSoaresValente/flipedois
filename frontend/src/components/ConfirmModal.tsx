import { useState } from 'react';

interface ConfirmModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (value?: string) => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'danger' | 'warning' | 'info';
    showInput?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
    inputRequired?: boolean;
}

export default function ConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    type = 'info',
    showInput = false,
    inputLabel,
    inputPlaceholder,
    inputRequired = false,
}: ConfirmModalProps) {
    const [inputValue, setInputValue] = useState('');

    if (!open) return null;

    const typeColors = {
        danger: 'bg-red-500 hover:bg-red-600',
        warning: 'bg-amber-500 hover:bg-amber-600',
        info: 'bg-indigo-500 hover:bg-indigo-600',
    };

    const handleConfirm = () => {
        if (showInput && inputRequired && !inputValue.trim()) return;
        onConfirm(showInput ? inputValue : undefined);
        setInputValue('');
    };

    const handleClose = () => {
        setInputValue('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
            />
            <div className="relative w-full max-w-md mx-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-5">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                        {title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {message}
                    </p>
                    {showInput && (
                        <div className="mt-4">
                            {inputLabel && (
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {inputLabel}
                                </label>
                            )}
                            <input
                                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={inputPlaceholder}
                                autoFocus
                            />
                        </div>
                    )}
                </div>
                <div className="flex gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
                    <button
                        onClick={handleClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${typeColors[type]}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
