import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  Calendar,
  ClipboardList,
  AlertTriangle,
  Activity,
  TrendingDown,
  Clock,
  ArrowRight,
} from 'lucide-react';
import {
  dashboardApi,
  checklistApi,
} from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface DashboardStats {
  equipamentos: {
    total: number;
    unidadesEmUso: number;
    unidadesDisponiveis: number;
    estoqueBaixo: { id: number; nome: string; disponivel: number; total: number }[];
  };
  eventos: {
    total: number;
    ativos: number;
  };
  checklists: {
    total: number;
    porStatus: Record<string, number>;
  };
  ocorrencias: {
    pendentes: number;
  };
}

interface RecentChecklist {
  id: number;
  nome: string;
  status: string;
  createdAt: string;
  eventId?: number;
  items?: { quantidadePlanejada: number; quantidadeSeparada: number; quantidadeDevolvida: number }[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentChecklists, setRecentChecklists] = useState<RecentChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  useAutoRefresh(loadData);

  async function loadData() {
    try {
      const clRes = await checklistApi.getAll({ page: 1, limit: 5 });
      setRecentChecklists(clRes.data.data);

      if (isAdmin) {
        const statsRes = await dashboardApi.getStats();
        setStats(statsRes.data);
      }
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#1A237E] border-t-transparent rounded-full" />
      </div>
    );
  }

  const cards = stats
    ? [
      {
        label: 'Equipamentos',
        value: stats.equipamentos.total,
        sub: `${stats.equipamentos.unidadesDisponiveis} unid. disponíveis`,
        icon: Package,
        bgLight: 'bg-[#1A237E]/10 dark:bg-[#1A237E]/20',
        color: 'text-[#1A237E] dark:text-[#00BCD4]',
      },
      {
        label: 'Eventos em Andamento',
        value: stats.eventos.ativos,
        sub: `${stats.eventos.total} eventos cadastrados`,
        icon: Calendar,
        bgLight: 'bg-purple-50 dark:bg-purple-900/20',
        color: 'text-purple-600 dark:text-purple-400',
      },
      {
        label: 'Itens em Uso',
        value: stats.equipamentos.unidadesEmUso,
        sub: 'unidades fora do estoque',
        icon: Activity,
        bgLight: 'bg-[#2E7D32]/10 dark:bg-[#2E7D32]/20',
        color: 'text-[#2E7D32] dark:text-emerald-400',
      },
      {
        label: 'Ocorrências Pendentes',
        value: stats.ocorrencias.pendentes,
        sub: 'aguardando confirmação',
        icon: AlertTriangle,
        bgLight: 'bg-[#D32F2F]/10 dark:bg-[#D32F2F]/20',
        color: 'text-[#D32F2F] dark:text-red-400',
      },
    ]
    : [];

  // Employee tasks: only show checklists that have been released (not drafts)
  const employeeTasks = recentChecklists.filter(
    (cl) => ['liberado', 'em_evento', 'pendente_devolucao'].includes(cl.status)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="text-[#1A237E] dark:text-[#00BCD4]" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            {isAdmin ? 'Dashboard - Gestão' : 'Dashboard - Operacional'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAdmin ? 'Visão geral do sistema' : 'Suas tarefas do dia'}
          </p>
        </div>
      </div>

      {/* Stats Cards - ADMIN only */}
      {isAdmin && stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 ${card.bgLight} rounded-lg flex items-center justify-center`}
                  >
                    <card.icon size={20} className={card.color} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {card.value}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {card.label}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Low Stock Alert */}
          {stats.equipamentos.estoqueBaixo.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={18} className="text-amber-500" />
                <h3 className="font-semibold text-amber-700 dark:text-amber-400 text-sm">
                  Estoque Baixo
                </h3>
              </div>
              <div className="space-y-1">
                {stats.equipamentos.estoqueBaixo.map((eq) => (
                  <p
                    key={eq.id}
                    className="text-sm text-amber-600 dark:text-amber-300"
                  >
                    {eq.nome}: <strong>{eq.disponivel}</strong>/{eq.total}{' '}
                    disponíveis
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Employee Operational View */}
      {!isAdmin && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <Clock size={18} className="text-[#FF8C00]" />
            <h2 className="font-semibold text-slate-800 dark:text-white">
              Tarefas Pendentes
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {employeeTasks.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <p className="text-lg">✅</p>
                <p className="mt-1">Nenhuma tarefa pendente no momento</p>
              </div>
            ) : (
              employeeTasks.map((cl) => (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => navigate(cl.eventId ? `/eventos/${cl.eventId}` : '/eventos')}
                  className="w-full text-left flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-700 dark:text-white text-sm">
                        {cl.nome}
                      </p>
                      <StatusBadge status={cl.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {cl.status === 'liberado' && '🔧 Aguardando separação'}
                      {cl.status === 'em_evento' && '📦 Em uso no evento'}
                      {cl.status === 'pendente_devolucao' && '↩️ Devolução pendente'}
                    </p>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-[#00BCD4] transition-colors" />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Recent Checklists */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white">
            Checklist Recente
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {recentChecklists.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              Nenhum checklist encontrado
            </div>
          ) : (
            recentChecklists.map((cl) => (
              <div
                key={cl.id}
                className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-700 dark:text-white text-sm">
                    {cl.nome}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(cl.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <StatusBadge status={cl.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}