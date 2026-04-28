import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { auditLogApi } from '../services/api';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface LogEntry {
    id: number;
    userId: number;
    userEmail: string;
    action: string;
    entity: string;
    entityId: number;
    changes: string;
    description: string;
    createdAt: string;
}

export default function Logs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [entityFilter, setEntityFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [page, setPage] = useState(0);
    const limit = 20;

    useEffect(() => {
        loadLogs();
    }, [entityFilter, actionFilter, page]);

    useAutoRefresh(loadLogs, 10000);

    async function loadLogs() {
        try {
            setLoading(true);
            const res = await auditLogApi.getAll({
                entity: entityFilter || undefined,
                action: actionFilter || undefined,
                limit,
                offset: page * limit,
            });
            setLogs(res.data.data);
            setTotal(res.data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const actionColors: Record<string, string> = {
        CREATE: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
        UPDATE: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
        DELETE: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
        LIBERAR: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
        SEPARAR: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400',
        DEVOLVER: 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400',
        CANCELAR: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
        DESATIVAR: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        FINALIZAR: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
        CLONAR: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
        ARQUIVAR: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
        REATIVAR: 'bg-lime-50 text-lime-600 dark:bg-lime-900/20 dark:text-lime-400',
        CANCELAR_SEPARACAO: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
        APROVAR_LOTE: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <ScrollText className="text-indigo-500" size={24} />
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                        Logs de Auditoria
                    </h1>
                    <p className="text-sm text-slate-500">
                        {total} registro(s) encontrado(s)
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <select
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={entityFilter}
                    onChange={(e) => { setEntityFilter(e.target.value); setPage(0); }}
                >
                    <option value="">Todas entidades</option>
                    <option value="checklist">Checklist</option>
                    <option value="checklist_item">Item de Checklist</option>
                    <option value="equipment">Equipamento</option>
                    <option value="event">Evento</option>
                    <option value="equipment_occurrence">Ocorrência</option>
                </select>
                <select
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
                >
                    <option value="">Todas ações</option>
                    <option value="CREATE">Criar</option>
                    <option value="UPDATE">Atualizar</option>
                    <option value="DELETE">Remover</option>
                    <option value="LIBERAR">Liberar</option>
                    <option value="SEPARAR">Separar</option>
                    <option value="DEVOLVER">Devolver</option>
                    <option value="CANCELAR">Cancelar</option>
                    <option value="DESATIVAR">Desativar</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-700/50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                                        Data
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                                        Usuário
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                                        Ação
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                                        Entidade
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                                        Descrição
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                            {log.userEmail || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`text-xs font-medium px-2 py-1 rounded-lg ${actionColors[log.action] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                                    }`}
                                            >
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-500">
                                            {log.entity}
                                            {log.entityId ? ` #${log.entityId}` : ''}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">
                                            {log.description || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {logs.length === 0 && (
                            <div className="p-8 text-center text-slate-400">
                                Nenhum log encontrado
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {total > limit && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        Mostrando {page * limit + 1}-{Math.min((page + 1) * limit, total)} de {total}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Anterior
                        </button>
                        <button
                            onClick={() => setPage(page + 1)}
                            disabled={(page + 1) * limit >= total}
                            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
