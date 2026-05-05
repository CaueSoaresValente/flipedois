import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, Plus, Check, RefreshCw, Search, Edit3, Filter, Clock } from 'lucide-react';
import { occurrenceApi, equipmentApi, eventApi } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';
import EquipmentSearch from '../components/EquipmentSearch';
import EventSearch from '../components/EventSearch';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface Occurrence {
  id: number;
  quantidade: number;
  descricao: string;
  status: string;
  tipo: string;
  motivo?: string;
  createdAt: string;
  equipment: { id: number; nome: string; quantidadeDisponivel: number };
  event: { id: number; nome: string } | null;
  checklistItemId: number | null;
}

const OK_HIDE_KEY = 'flipedois_ok_hide_days';

export default function Ocorrencias() {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<Occurrence | null>(null);
  const [editQuantidade, setEditQuantidade] = useState(1);
  const [editDescricao, setEditDescricao] = useState('');
  const [editTipo, setEditTipo] = useState('DANO');
  const [editEquipmentId, setEditEquipmentId] = useState('');
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  // Form
  const [equipmentId, setEquipmentId] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('DANO');

  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [okHideDays, setOkHideDays] = useState(() => {
    return localStorage.getItem(OK_HIDE_KEY) || '0';
  });

  async function load() {
    try {
      const [ocRes, eqRes, evRes] = await Promise.all([
        occurrenceApi.getAll({ page, limit }),
        equipmentApi.getAll({ page: 1, limit: 1000 }),
        eventApi.getAll({ page: 1, limit: 1000 }),
      ]);
      setItems(ocRes.data.data);
      setTotal(ocRes.data.total);
      setTotalPages(ocRes.data.totalPages);
      setEquipments(eqRes.data.data);
      setEvents(evRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, limit]);

  useAutoRefresh(load);

  // Only show events whose checklist is concluded (manual occurrences require concluded checklist)
  const eventsConcluidos = useMemo(() => {
    return events.filter((ev: any) =>
      ev.checklists?.some((cl: any) => cl.status === 'concluido'),
    );
  }, [events]);

  const [validation, setValidation] = useState<{ valido: boolean; quantidadeOk: number; mensagem?: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    async function validate() {
      if (equipmentId && eventId) {
        setIsValidating(true);
        try {
          const res = await occurrenceApi.validarEvento(Number(eventId), Number(equipmentId));
          setValidation(res.data);
        } catch (err) {
          setValidation({ valido: false, quantidadeOk: 0 });
        } finally {
          setIsValidating(false);
        }
      } else {
        setValidation(null);
      }
    }
    validate();
  }, [equipmentId, eventId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (eventId && validation && !validation.valido) {
      addToast('error', 'Este equipamento não participou deste evento.');
      return;
    }
    try {
      await occurrenceApi.create({
        equipmentId: Number(equipmentId),
        eventId: eventId ? Number(eventId) : undefined,
        quantidade,
        descricao,
        tipo: tipo as 'DANO' | 'PERDA',
      });
      setModalOpen(false);
      resetForm();
      load();
      addToast('success', 'Ocorrência registrada com sucesso.');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao registrar ocorrência.');
    }
  }

  function resetForm() {
    setEquipmentId('');
    setEventId('');
    setQuantidade(1);
    setDescricao('');
    setTipo('DANO');
    setValidation(null);
  }

  const maxQty = (() => {
    if (!equipmentId) return 1;
    const selected = equipments.find((eq: any) => String(eq.id) === equipmentId);
    if (!selected) return 1;

    if (eventId && validation) {
      return validation.valido ? validation.quantidadeOk : 0;
    }

    // Sem evento: DANO e PERDA saem do disponível
    return selected.quantidadeDisponivel;
  })();

  const labelQty = (() => {
    if (eventId) return 'Saldo OK no Evento: ';
    return 'Disponível: ';
  })();

  const currentBalance = (() => {
    if (!equipmentId) return 0;
    const selected = equipments.find((eq: any) => String(eq.id) === equipmentId);
    if (eventId && validation) return validation.quantidadeOk;
    return selected?.quantidadeDisponivel ?? 0;
  })();

  async function handleConfirmar(id: number) {
    try {
      await occurrenceApi.confirmar(id);
      load();
      addToast('success', 'Ocorrência confirmada com sucesso.');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao confirmar a ocorrência.');
    }
  }

  function openEditModal(oc: Occurrence) {
    setEditingOccurrence(oc);
    setEditQuantidade(oc.quantidade);
    setEditDescricao(oc.descricao || '');
    setEditTipo(oc.tipo);
    setEditEquipmentId(String(oc.equipment?.id || ''));
    setEditModalOpen(true);
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOccurrence) return;
    try {
      await occurrenceApi.editar(editingOccurrence.id, {
        descricao: editDescricao,
        tipo: editTipo as 'OK' | 'DANO' | 'PERDA',
      });
      setEditModalOpen(false);
      setEditingOccurrence(null);
      load();
      addToast('success', 'Ocorrência editada com sucesso.');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao editar ocorrência.');
    }
  }

  // Filtered items
  const filtered = items.filter((oc) => {
    // Search filter
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      const matchEquip = oc.equipment?.nome?.toLowerCase().includes(s);
      const matchEvent = oc.event?.nome?.toLowerCase().includes(s);
      const matchDesc = oc.descricao?.toLowerCase().includes(s);
      if (!matchEquip && !matchEvent && !matchDesc) return false;
    }
    // Type filter
    if (tipoFilter && oc.tipo !== tipoFilter) return false;
    // Status filter
    if (statusFilter && oc.status !== statusFilter) return false;
    // OK auto-hide
    if (okHideDays !== '0' && oc.tipo === 'OK') {
      const days = Number(okHideDays);
      const createdAt = new Date(oc.createdAt);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      if (createdAt < cutoff) return false;
    }
    return true;
  });

  function handleOkHideChange(value: string) {
    setOkHideDays(value);
    localStorage.setItem(OK_HIDE_KEY, value);
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
          <AlertTriangle className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Ocorrências
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {total} ocorrência(s)
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} /> Nova Ocorrência
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
            placeholder="Buscar equipamento, evento..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
        >
          <option value="">Todos os Tipos</option>
          <option value="DANO">Quebrado</option>
          <option value="PERDA">Perdido</option>
          <option value="OK">OK</option>
        </select>
        <select
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os Status</option>
          <option value="PENDENTE">Pendente</option>
          <option value="BAIXADO">Baixado</option>
          <option value="RESOLVIDO">Resolvido</option>
        </select>
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-slate-400" />
          <select
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
            value={okHideDays}
            onChange={(e) => handleOkHideChange(e.target.value)}
            title="Ocultar ocorrências OK mais antigas que..."
          >
            <option value="0">OK: Mostrar todas</option>
            <option value="1">OK: Ocultar após 1 dia</option>
            <option value="3">OK: Ocultar após 3 dias</option>
            <option value="7">OK: Ocultar após 7 dias</option>
            <option value="30">OK: Ocultar após 30 dias</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Equipamento
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Tipo
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Qtd
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Evento
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                  Data
                </th>
                {isAdmin && (
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((oc) => (
                <tr
                  key={oc.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-6 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {oc.equipment?.nome ?? '-'}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        oc.tipo === 'DANO'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : oc.tipo === 'PERDA'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : oc.tipo === 'OK'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {oc.tipo === 'DANO' ? 'QUEBRADO' : oc.tipo === 'PERDA' ? 'PERDIDO' : oc.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center text-sm font-semibold text-slate-800 dark:text-white">
                    {oc.quantidade}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <StatusBadge status={oc.status} />
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {oc.event?.nome ?? '-'}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-400 dark:text-slate-500">
                    {new Date(oc.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Confirmar - apenas PENDENTE */}
                        {oc.status === 'PENDENTE' && (
                          <button
                            onClick={() => handleConfirmar(oc.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors shadow-sm"
                            title="Confirmar reajuste no estoque"
                          >
                            <Check size={14} /> Confirmar Reajuste no Estoque
                          </button>
                        )}

                        {/* Editar - Sempre visível */}
                        <button
                          onClick={() => openEditModal(oc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600 shadow-sm"
                          title="Editar ocorrência"
                        >
                          <Edit3 size={14} /> Editar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500">
              Nenhuma ocorrência encontrada
            </div>
          )}
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
      />

      {/* Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Ocorrência"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Equipamento
            </label>
            <EquipmentSearch
              equipments={equipments}
              value={equipmentId}
              onChange={(id) => {
                setEquipmentId(id);
                setQuantidade(1);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo
              </label>
              <select
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="DANO">Quebrado</option>
                <option value="PERDA">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Evento (opcional)
              </label>
              <EventSearch
                events={eventsConcluidos}
                value={eventId}
                onChange={(id) => {
                  setEventId(id);
                  setQuantidade(1);
                }}
                placeholder="Buscar evento concluído..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Quantidade
            </label>
            <input
              type="number"
              min="1"
              max={maxQty}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
              value={quantidade}
              onChange={(e) => {
                setQuantidade(Math.min(Number(e.target.value), maxQty));
              }}
              required
            />
            {equipmentId && (
              <div className="mt-1">
                <p className={`text-xs ${validation?.valido === false ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                  {isValidating ? 'Validando evento...' : (validation?.valido === false ? validation.mensagem : `${labelQty}${currentBalance}`)}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Descrição
            </label>
            <textarea
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isValidating || (!!eventId && validation?.valido === false)}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-400 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Registrar Ocorrência
          </button>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingOccurrence(null); }}
        title="Editar Ocorrência"
      >
        {editingOccurrence && (
          <form onSubmit={handleEditar} className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Status Atual: <StatusBadge status={editingOccurrence.status} />
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Equipamento
              </label>
              <p className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white text-sm">
                {editingOccurrence.equipment?.nome || 'Equipamento'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tipo
                </label>
                <select
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                  value={editTipo}
                  onChange={(e) => setEditTipo(e.target.value)}
                  required
                >
                  <option value="OK">OK</option>
                  <option value="DANO">Dano</option>
                  <option value="PERDA">Perda</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Quantidade
                </label>
                <p className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white text-sm">
                  {editingOccurrence.quantidade}
                </p>
                <p className="text-xs text-slate-400 mt-1">A quantidade não pode ser alterada após a criação</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Descrição
              </label>
              <textarea
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                rows={2}
                value={editDescricao}
                onChange={(e) => setEditDescricao(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Salvar Alterações
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
