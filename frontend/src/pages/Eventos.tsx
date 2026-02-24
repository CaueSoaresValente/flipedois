import { useEffect, useState } from 'react';
import { Calendar, Plus, Users as UsersIcon } from 'lucide-react';
import { eventApi, checklistApi } from '../services/api';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';

interface EventTeam {
  id: number;
  nome: string;
  funcao: string;
}

interface EventItem {
  id: number;
  nome: string;
  cliente: string;
  local: string;
  dataInicio: string;
  dataFim: string;
  observacoes: string;
  checklist: { id: number; nome: string; status: string } | null;
  equipe: EventTeam[];
}

interface ChecklistOption {
  id: number;
  nome: string;
  status: string;
}

export default function Eventos() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [checklists, setChecklists] = useState<ChecklistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCreate, setModalCreate] = useState(false);
  const [modalTeam, setModalTeam] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const { isAdmin } = useAuth();

  // Form
  const [nome, setNome] = useState('');
  const [cliente, setCliente] = useState('');
  const [local, setLocal] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [checklistId, setChecklistId] = useState('');

  // Team form
  const [teamNome, setTeamNome] = useState('');
  const [teamFuncao, setTeamFuncao] = useState('montagem');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [evRes, clRes] = await Promise.all([
        eventApi.getAll(),
        checklistApi.getAll(),
      ]);
      setEvents(evRes.data);
      setChecklists(clRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await eventApi.create({
        nome,
        cliente,
        local,
        dataInicio,
        dataFim,
        observacoes,
        checklistId: Number(checklistId),
      });
      setModalCreate(false);
      resetForm();
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao criar evento');
    }
  }

  function resetForm() {
    setNome('');
    setCliente('');
    setLocal('');
    setDataInicio('');
    setDataFim('');
    setObservacoes('');
    setChecklistId('');
  }

  function openTeam(ev: EventItem) {
    setSelectedEvent(ev);
    setModalTeam(true);
  }

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) return;
    try {
      await eventApi.addTeamMember(selectedEvent.id, {
        nome: teamNome,
        funcao: teamFuncao,
      });
      setTeamNome('');
      // Reload
      const res = await eventApi.getAll();
      setEvents(res.data);
      const updated = res.data.find(
        (ev: EventItem) => ev.id === selectedEvent.id
      );
      if (updated) setSelectedEvent(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  async function handleRemoveTeam(memberId: number) {
    try {
      await eventApi.removeTeamMember(memberId);
      const res = await eventApi.getAll();
      setEvents(res.data);
      if (selectedEvent) {
        const updated = res.data.find(
          (ev: EventItem) => ev.id === selectedEvent.id
        );
        if (updated) setSelectedEvent(updated);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Eventos
            </h1>
            <p className="text-sm text-slate-500">
              {events.length} evento(s)
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setModalCreate(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={18} /> Novo Evento
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-700 dark:text-white">
                  {ev.nome}
                </h3>
                <p className="text-sm text-slate-500">{ev.cliente}</p>
              </div>
              <button
                onClick={() => openTeam(ev)}
                className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Equipe"
              >
                <UsersIcon size={18} />
              </button>
            </div>
            <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
              <p>📍 {ev.local}</p>
              <p>
                📅 {new Date(ev.dataInicio).toLocaleDateString('pt-BR')} -{' '}
                {new Date(ev.dataFim).toLocaleDateString('pt-BR')}
              </p>
              {ev.checklist && (
                <p className="text-xs">
                  📋 Checklist: {ev.checklist.nome}
                </p>
              )}
              {ev.equipe?.length > 0 && (
                <p className="text-xs">
                  👥 {ev.equipe.length} membro(s) na equipe
                </p>
              )}
            </div>
            {ev.observacoes && (
              <p className="text-xs text-slate-400 mt-2 italic">
                {ev.observacoes}
              </p>
            )}
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          Nenhum evento cadastrado
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={modalCreate}
        onClose={() => setModalCreate(false)}
        title="Novo Evento"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome do Evento
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cliente
              </label>
              <input
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Local
              </label>
              <input
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Início
              </label>
              <input
                type="datetime-local"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data Fim
              </label>
              <input
                type="datetime-local"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Checklist
            </label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={checklistId}
              onChange={(e) => setChecklistId(e.target.value)}
              required
            >
              <option value="">Selecione um checklist...</option>
              {checklists.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.nome} ({cl.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Observações
            </label>
            <textarea
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Criar Evento
          </button>
        </form>
      </Modal>

      {/* Team Modal */}
      <Modal
        open={modalTeam}
        onClose={() => setModalTeam(false)}
        title={`Equipe - ${selectedEvent?.nome ?? ''}`}
      >
        <div className="space-y-4">
          {/* Add member form */}
          <form
            onSubmit={handleAddTeam}
            className="flex gap-2 items-end"
          >
            <div className="flex-1">
              <input
                placeholder="Nome do membro"
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                value={teamNome}
                onChange={(e) => setTeamNome(e.target.value)}
                required
              />
            </div>
            <select
              className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
              value={teamFuncao}
              onChange={(e) => setTeamFuncao(e.target.value)}
            >
              <option value="montagem">Montagem</option>
              <option value="operacao">Operação</option>
              <option value="desmontagem">Desmontagem</option>
            </select>
            <button
              type="submit"
              className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
            </button>
          </form>

          {/* Team list */}
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {selectedEvent?.equipe?.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {m.nome}
                  </p>
                  <p className="text-xs text-slate-400">{m.funcao}</p>
                </div>
                <button
                  onClick={() => handleRemoveTeam(m.id)}
                  className="text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors"
                >
                  Remover
                </button>
              </div>
            ))}
            {(!selectedEvent?.equipe ||
              selectedEvent.equipe.length === 0) && (
              <p className="text-sm text-center text-slate-400 py-4">
                Nenhum membro na equipe
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
