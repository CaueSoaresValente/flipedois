import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface Equipment {
    id: number;
    nome: string;
    descricao: string;
    quantidadeDisponivel: number;
    origem: string;
}

interface EquipmentSearchProps {
    equipments: Equipment[];
    value: string;
    onChange: (equipmentId: string) => void;
    placeholder?: string;
}

export default function EquipmentSearch({
    equipments,
    value,
    onChange,
    placeholder = 'Buscar equipamento...',
}: EquipmentSearchProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const selected = equipments.find((eq) => String(eq.id) === value);

    const filtered = equipments.filter((eq) =>
        eq.nome.toLowerCase().includes(query.toLowerCase()),
    );

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className="relative">
            {selected && !isOpen ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700">
                    <div>
                        <span className="text-sm font-medium text-slate-800 dark:text-white">
                            {selected.nome}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">
                            (disp: {selected.quantidadeDisponivel})
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            onChange('');
                            setQuery('');
                            setIsOpen(true);
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        placeholder={placeholder}
                    />
                </div>
            )}

            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="p-3 text-sm text-slate-400 text-center">
                            Nenhum equipamento encontrado
                        </div>
                    ) : (
                        filtered.map((eq) => (
                            <button
                                key={eq.id}
                                type="button"
                                className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                                onClick={() => {
                                    onChange(String(eq.id));
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                        {eq.nome}
                                    </span>
                                    <span
                                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${eq.quantidadeDisponivel > 0
                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                            }`}
                                    >
                                        {eq.origem === 'alugado'
                                            ? 'Alugado'
                                            : `${eq.quantidadeDisponivel} disp.`}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5 truncate">
                                    {eq.descricao}
                                </p>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
