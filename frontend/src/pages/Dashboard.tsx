import { useEffect, useState } from 'react';
import {
  Package,
  Calendar,
  ClipboardList,
  AlertTriangle,
  Activity,
  TrendingDown,
} from 'lucide-react';
import {
  dashboardApi,
  checklistApi,
} from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';

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
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentChecklists, setRecentChecklists] = useState<RecentChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const clRes = await checklistApi.getAll();
      setRecentChecklists(clRes.data.slice(0, 5));

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
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
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
        bgLight: 'bg-blue-50 dark:bg-blue-900/20',
        color: 'text-blue-500',
      },
      {
        label: 'Eventos Ativos',
        value: stats.eventos.ativos,
        sub: `${stats.eventos.total} total`,
        icon: Calendar,
        bgLight: 'bg-purple-50 dark:bg-purple-900/20',
        color: 'text-purple-500',
      },
      {
        label: 'Checklists',
        value: stats.checklists.total,
        sub: `${stats.checklists.porStatus?.liberado ?? 0} liberados`,
        icon: ClipboardList,
        bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
        color: 'text-emerald-500',
      },
      {
        label: 'Ocorrências Pendentes',
        value: stats.ocorrencias.pendentes,
        sub: 'aguardando confirmação',
        icon: AlertTriangle,
        bgLight: 'bg-amber-50 dark:bg-amber-900/20',
        color: 'text-amber-500',
      },
    ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="text-indigo-500" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visão geral do sistema
          </p>
        </div>
      </div>

      {/* Stats Cards — ADMIN only */}
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
                <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
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

      {/* Recent Checklists */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white">
            Checklists Recentes
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
                  <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                    {cl.nome}
                  </p>
                  <p className="text-xs text-slate-400">
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