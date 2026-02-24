import { useEffect, useState } from 'react';
import {
  Package,
  Calendar,
  ClipboardList,
  AlertTriangle,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  equipmentApi,
  checklistApi,
  eventApi,
  occurrenceApi,
} from '../services/api';
import StatusBadge from '../components/StatusBadge';

interface Stats {
  equipamentos: number;
  eventos: number;
  checklists: number;
  ocorrencias: number;
}

interface RecentChecklist {
  id: number;
  nome: string;
  status: string;
  createdAt: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    equipamentos: 0,
    eventos: 0,
    checklists: 0,
    ocorrencias: 0,
  });
  const [recentChecklists, setRecentChecklists] = useState<
    RecentChecklist[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [eqRes, evRes, clRes, ocRes] = await Promise.all([
        equipmentApi.getAll(),
        eventApi.getAll(),
        checklistApi.getAll(),
        occurrenceApi.getAll(),
      ]);

      setStats({
        equipamentos: eqRes.data.length,
        eventos: evRes.data.length,
        checklists: clRes.data.length,
        ocorrencias: ocRes.data.filter(
          (o: any) => o.status === 'PENDENTE'
        ).length,
      });

      setRecentChecklists(clRes.data.slice(0, 5));
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  const cards = [
    {
      label: 'Equipamentos',
      value: stats.equipamentos,
      icon: Package,
      gradient: 'from-blue-500 to-blue-600',
      bgLight: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Eventos',
      value: stats.eventos,
      icon: Calendar,
      gradient: 'from-purple-500 to-purple-600',
      bgLight: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Checklists',
      value: stats.checklists,
      icon: ClipboardList,
      gradient: 'from-emerald-500 to-emerald-600',
      bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: 'Ocorrências Pendentes',
      value: stats.ocorrencias,
      icon: AlertTriangle,
      gradient: 'from-amber-500 to-amber-600',
      bgLight: 'bg-amber-50 dark:bg-amber-900/20',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

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

      {/* Stats Cards */}
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
                <card.icon
                  size={20}
                  className={`text-${card.gradient.split('-')[1]}-500`}
                />
              </div>
              <TrendingUp size={16} className="text-green-500" />
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">
              {card.value}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {card.label}
            </p>
          </div>
        ))}
      </div>

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