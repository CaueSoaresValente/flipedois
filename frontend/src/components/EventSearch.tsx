import { useState, useEffect, useRef } from 'react';
import { Search, X, Calendar } from 'lucide-react';

interface EventItem {
  id: number;
  nome: string;
  cliente?: string;
  local?: string;
  dataInicio?: string;
}

interface EventSearchProps {
  events: EventItem[];
  value: string;
  onChange: (eventId: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export default function EventSearch({
  events,
  value,
  onChange,
  placeholder = 'Buscar evento...',
  allowEmpty = true,
  emptyLabel = 'Sem evento (do Disponível)',
}: EventSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = events.find((ev) => String(ev.id) === value);

  const filtered = events.filter((ev) => {
    const q = query.toLowerCase();
    return (
      ev.nome.toLowerCase().includes(q) ||
      (ev.cliente && ev.cliente.toLowerCase().includes(q)) ||
      (ev.local && ev.local.toLowerCase().includes(q))
    );
  });

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

  function formatDate(dateStr?: string) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      {value !== '' && selected && !isOpen ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar size={14} className="text-indigo-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-800 dark:text-white">
                {selected.nome}
              </span>
              {selected.cliente && (
                <span className="text-xs text-slate-400 ml-2">
                  · {selected.cliente}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setQuery('');
              setIsOpen(true);
            }}
            className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        </div>
      ) : value === '' && !isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-left"
        >
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-400">{emptyLabel}</span>
        </button>
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
            autoFocus
          />
        </div>
      )}

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {/* "Sem evento" option */}
          {allowEmpty && (
            <button
              type="button"
              className={`w-full text-left px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border-b border-slate-100 dark:border-slate-700/50 ${
                value === '' ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
              }`}
              onClick={() => {
                onChange('');
                setQuery('');
                setIsOpen(false);
              }}
            >
              <span className="text-sm text-slate-500 dark:text-slate-400 italic">
                {emptyLabel}
              </span>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-slate-400 text-center">
              Nenhum evento encontrado
            </div>
          ) : (
            filtered.map((ev) => (
              <button
                key={ev.id}
                type="button"
                className={`w-full text-left px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0 ${
                  String(ev.id) === value ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                }`}
                onClick={() => {
                  onChange(String(ev.id));
                  setQuery('');
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {ev.nome}
                  </span>
                  {ev.dataInicio && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar size={10} />
                      {formatDate(ev.dataInicio)}
                    </span>
                  )}
                </div>
                {(ev.cliente || ev.local) && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {[ev.cliente, ev.local].filter(Boolean).join(' · ')}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
