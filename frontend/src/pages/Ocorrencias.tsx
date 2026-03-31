import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Check, X, RefreshCw, Search, Edit3 } from 'lucide-react';
import { occurrenceApi, equipmentApi, eventApi } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';

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
  const [motivo, setMotivo] = useState('');

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await occurrenceApi.create({
        equipmentId: Number(equipmentId),
        eventId: eventId ? Number(eventId) : undefined,
        quantidade,
        descricao,
        tipo: tipo as 'OK' | 'DANO' | 'PERDA',
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
    setMotivo('');
  }

  async function handleConfirmar(id: number) {
    try {
      await occurrenceApi.confirmar(id);
      load();
      addToast('success', 'Ocorrência confirmada.');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao confirmar.');
    }
  }

  async function handleCancelar(id: number) {
    if (!confirm('Tem certeza que deseja cancelar esta ocorrência manual? O estoque será revertido.')) return;
    try {
      await occurrenceApi.cancelar(id);
      load();
      addToast('success', 'Ocorrência cancelada e estoque revertido.');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao cancelar.');
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
        quantidade: editQuantidade,
        descricao: editDescricao,
        tipo: editTipo as 'OK' | 'DANO' | 'PERDA',
        equipmentId: Number(editEquipmentId),
      });
      setEditModalOpen(false);
      setEditingOccurrence(null);
      load();
      addToast('success', 'Ocorrência editada com sucesso.');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao editar ocorrência.');
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
              {items.map((oc) => (
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
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : oc.tipo === 'PERDA'
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                          : oc.tipo === 'OK'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      {oc.tipo}
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
                        {/* Baixar - apenas PENDENTE */}
                        {oc.status === 'PENDENTE' && (
                          <button
                            onClick={() => handleConfirmar(oc.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors shadow-sm"
                            title="Confirmar reajuste no estoque"
                          >
                            <Check size={14} /> Confirmar Reajuste no Estoque
                          </button>
                        )}

                        {/* Cancelar - Apenas PENDENTE MANUAL + TIPO OK */}
                        {['PENDENTE', 'RESOLVIDO'].includes(oc.status) && !oc.checklistItemId && (
                          <button
                            onClick={() => handleCancelar(oc.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-800 shadow-sm"
                            title="Cancelar ocorrência manual"
                          >
                            <X size={14} /> Cancelar
                          </button>
                        )}

                        {/* Editar - Sempre visível conforme solicitado */}
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
          {items.length === 0 && (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500">
              Nenhuma ocorrência registrada
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
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
              value={equipmentId}
              onChange={(e) => { setEquipmentId(e.target.value); setQuantidade(1); }}
              required
            >
              <option value="">Selecione...</option>
              {equipments.map((eq: any) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome}
                </option>
              ))}
            </select>
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
                <option value="OK">OK</option>
                <option value="DANO">Dano</option>
                <option value="PERDA">Perda</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Evento (opcional)
              </label>
              <select
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                value={eventId}
                onChange={(e) => {
                   setEventId(e.target.value);
                   setQuantidade(1);
                }}
              >
                <option value="">Sem evento (do Disponível)</option>
                {events.map((ev: any) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Quantidade
            </label>
            <input
              type="number"
              min="1"
              max={
                equipmentId 
                  ? (tipo === 'OK'
                    ? (equipments.find((eq: any) => String(eq.id) === equipmentId)?.quantidadeEmUso || 1)
                    : (equipments.find((eq: any) => String(eq.id) === equipmentId)?.quantidadeDisponivel || 1)
                  ) 
                  : undefined
              }
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
              value={quantidade}
              onChange={(e) => {
                const selected = equipments.find((eq: any) => String(eq.id) === equipmentId);
                const maxQty = tipo === 'OK' ? (selected?.quantidadeEmUso || 1) : (selected?.quantidadeDisponivel || 1);
                setQuantidade(Math.min(Number(e.target.value), maxQty));
              }}
              required
            />
            {equipmentId && (
              <p className="text-xs text-slate-400 mt-1">
                {tipo === 'OK' ? 'Em Uso (Total no Sistema): ' : 'Disponível: '}
                {tipo === 'OK' 
                  ? (equipments.find((eq: any) => String(eq.id) === equipmentId)?.quantidadeEmUso ?? '?')
                  : (equipments.find((eq: any) => String(eq.id) === equipmentId)?.quantidadeDisponivel ?? '?')
                }
              </p>
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
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
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
              {editingOccurrence.checklistItemId ? (
                <p className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white text-sm">
                  {editingOccurrence.equipment?.nome || 'Equipamento'}
                </p>
              ) : (
                <select
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                  value={editEquipmentId}
                  onChange={(e) => setEditEquipmentId(e.target.value)}
                  required
                >
                  <option value="">Selecione...</option>
                  {equipments.map((eq: any) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nome}
                    </option>
                  ))}
                </select>
              )}
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
                {editingOccurrence.checklistItemId ? (
                  <p className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white text-sm">
                    {editQuantidade}
                  </p>
                ) : (
                  <input
                    type="number"
                    min="1"
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                    value={editQuantidade}
                    onChange={(e) => setEditQuantidade(Number(e.target.value))}
                    required
                  />
                )}
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

