import { useEffect, useState } from 'react';
import { Calendar, Plus, Users as UsersIcon, Edit3, CheckCircle, XCircle } from 'lucide-react';
import { eventApi, checklistApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

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
  status: 'ativo' | 'finalizado';
  finalizadoEm?: string;
  finalizadoPor?: string;
  checklists: { id: number; nome: string; status: string }[];
  equipe: EventTeam[];
}

interface ChecklistOption {
  id: number;
  nome: string;
  status: string;
  eventId?: number;
}

export default function Eventos() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [checklists, setChecklists] = useState<ChecklistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(false);
  const [modalTeam, setModalTeam] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [confirmFinalizar, setConfirmFinalizar] = useState<EventItem | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  // Create form
  const [nome, setNome] = useState('');
  const [cliente, setCliente] = useState('');
  const [local, setLocal] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [checklistId, setChecklistId] = useState('');

  // Edit form
  const [editNome, setEditNome] = useState('');
  const [editCliente, setEditCliente] = useState('');
  const [editLocal, setEditLocal] = useState('');
  const [editDataInicio, setEditDataInicio] = useState('');
  const [editDataFim, setEditDataFim] = useState('');
  const [editObservacoes, setEditObservacoes] = useState('');

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
        checklistId: checklistId ? Number(checklistId) : undefined,
      });
      setModalCreate(false);
      resetForm();
      addToast('success', 'Evento criado com sucesso');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao criar evento');
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

  function openEdit(ev: EventItem) {
    setSelectedEvent(ev);
    setEditNome(ev.nome);
    setEditCliente(ev.cliente);
    setEditLocal(ev.local);
    setEditDataInicio(ev.dataInicio ? ev.dataInicio.slice(0, 16) : '');
    setEditDataFim(ev.dataFim ? ev.dataFim.slice(0, 16) : '');
    setEditObservacoes(ev.observacoes || '');
    setModalEdit(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) return;
    try {
      await eventApi.update(selectedEvent.id, {
        nome: editNome,
        cliente: editCliente,
        local: editLocal,
        dataInicio: editDataInicio,
        dataFim: editDataFim,
        observacoes: editObservacoes,
      });
      setModalEdit(false);
      addToast('success', 'Evento atualizado com sucesso');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao editar evento');
    }
  }

  async function handleFinalizar() {
    if (!confirmFinalizar) return;
    try {
      await eventApi.finalizar(confirmFinalizar.id);
      setConfirmFinalizar(null);
      addToast('success', `Evento "${confirmFinalizar.nome}" finalizado`);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao finalizar evento');
      setConfirmFinalizar(null);
    }
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
      const res = await eventApi.getAll();
      setEvents(res.data);
      const updated = res.data.find((ev: EventItem) => ev.id === selectedEvent.id);
      if (updated) setSelectedEvent(updated);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao adicionar membro');
    }
  }

  async function handleRemoveTeam(memberId: number) {
    try {
      await eventApi.removeTeamMember(memberId);
      const res = await eventApi.getAll();
      setEvents(res.data);
      if (selectedEvent) {
        const updated = res.data.find((ev: EventItem) => ev.id === selectedEvent.id);
        if (updated) setSelectedEvent(updated);
      }
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover membro');
    }
  }

  function canFinalizar(ev: EventItem): boolean {
    if (!isAdmin) return false;
    if (ev.status === 'finalizado') return false;
    if (!ev.checklists?.length) return false;
    return ev.checklists.every((cl) => ['concluido', 'cancelado'].includes(cl.status));
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
            onClick={() => { setModalCreate(true); resetForm(); }}
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
            className={`bg-white dark:bg-slate-800 rounded-xl border p-5 hover:shadow-lg transition-shadow ${
              ev.status === 'finalizado'
                ? 'border-emerald-300 dark:border-emerald-700 opacity-80'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-700 dark:text-white">
                    {ev.nome}
                  </h3>
                  {ev.status === 'finalizado' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                      ✓ Finalizado
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                      Em andamento
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{ev.cliente}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                {isAdmin && ev.status !== 'finalizado' && (
                  <button
                    onClick={() => openEdit(ev)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    title="Editar evento"
                  >
                    <Edit3 size={16} />
                  </button>
                )}
                <button
                  onClick={() => openTeam(ev)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                  title="Equipe"
                >
                  <UsersIcon size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
              <p>📍 {ev.local}</p>
              <p>
                📅 {new Date(ev.dataInicio).toLocaleDateString('pt-BR')} –{' '}
                {new Date(ev.dataFim).toLocaleDateString('pt-BR')}
              </p>
              {ev.checklists?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {ev.checklists.map((cl) => (
                    <p key={cl.id} className="text-xs flex items-center gap-1">
                      📋 {cl.nome}
                      <span className={`ml-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                        cl.status === 'concluido' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20' :
                        cl.status === 'liberado' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20' :
                        cl.status === 'em_evento' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20' :
                        cl.status === 'cancelado' ? 'bg-red-100 text-red-700 dark:bg-red-900/20' :
                        'bg-slate-100 text-slate-600'
                      }`}>{cl.status}</span>
                    </p>
                  ))}
                </div>
              )}
              {ev.equipe?.length > 0 && (
                <p className="text-xs">👥 {ev.equipe.length} membro(s) na equipe</p>
              )}
              {ev.finalizadoPor && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ Finalizado por {ev.finalizadoPor}
                  {ev.finalizadoEm ? ` em ${new Date(ev.finalizadoEm).toLocaleDateString('pt-BR')}` : ''}
                </p>
              )}
            </div>

            {ev.observacoes && (
              <p className="text-xs text-slate-400 mt-2 italic">{ev.observacoes}</p>
            )}

            {/* Finalization button */}
            {canFinalizar(ev) && (
              <button
                onClick={() => setConfirmFinalizar(ev)}
                className="mt-3 w-full flex items-center justify-center gap-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg font-medium transition-colors"
              >
                <CheckCircle size={14} /> Finalizar Evento
              </button>
            )}
            {isAdmin && ev.status !== 'finalizado' && ev.checklists?.length > 0 && !canFinalizar(ev) && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <XCircle size={14} />
                Aguardando conclusão dos checklists
              </div>
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
              placeholder="Ex: Festival de Verão 2025"
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
              Vincular Checklist (opcional)
            </label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={checklistId}
              onChange={(e) => setChecklistId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {checklists.filter((cl) => cl.status === 'rascunho' && !cl.eventId).map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.nome}
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

      {/* Edit Modal */}
      <Modal
        open={modalEdit}
        onClose={() => setModalEdit(false)}
        title={`Editar Evento — ${selectedEvent?.nome ?? ''}`}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome do Evento
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cliente</label>
              <input
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={editCliente}
                onChange={(e) => setEditCliente(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Local</label>
              <input
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={editLocal}
                onChange={(e) => setEditLocal(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Início</label>
              <input
                type="datetime-local"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={editDataInicio}
                onChange={(e) => setEditDataInicio(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Fim</label>
              <input
                type="datetime-local"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={editDataFim}
                onChange={(e) => setEditDataFim(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
            <textarea
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              rows={3}
              value={editObservacoes}
              onChange={(e) => setEditObservacoes(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Salvar Alterações
          </button>
        </form>
      </Modal>

      {/* Finalization Confirm Modal */}
      <ConfirmModal
        open={confirmFinalizar !== null}
        onClose={() => setConfirmFinalizar(null)}
        onConfirm={handleFinalizar}
        title="Finalizar Evento"
        message={`Deseja finalizar o evento "${confirmFinalizar?.nome}"? Esta ação é irreversível e indica que todos os equipamentos foram devolvidos e o evento foi concluído.`}
        confirmLabel="Finalizar"
        type="success"
      />

      {/* Team Modal */}
      <Modal
        open={modalTeam}
        onClose={() => setModalTeam(false)}
        title={`Equipe — ${selectedEvent?.nome ?? ''}`}
      >
        <div className="space-y-4">
          {isAdmin && selectedEvent?.status !== 'finalizado' && (
            <form onSubmit={handleAddTeam} className="flex gap-2 items-end">
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
          )}
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {selectedEvent?.equipe?.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{m.nome}</p>
                  <p className="text-xs text-slate-400">{m.funcao}</p>
                </div>
                {isAdmin && selectedEvent?.status !== 'finalizado' && (
                  <button
                    onClick={() => handleRemoveTeam(m.id)}
                    className="text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
            {(!selectedEvent?.equipe || selectedEvent.equipe.length === 0) && (
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
