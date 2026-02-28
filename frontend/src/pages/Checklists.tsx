import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Play, X, Copy } from 'lucide-react';
import { checklistApi, checklistItemApi, equipmentApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import StatusBadge from '../components/StatusBadge';
import EquipmentSearch from '../components/EquipmentSearch';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface ChecklistItem {
  id: number;
  equipmentId: number;
  nomeSnapshot: string;
  quantidadePlanejada: number;
  quantidadeSeparada: number;
  quantidadeDevolvida: number;
  statusSeparacao: string;
  statusDevolucao: string;
  setor: string;
}

interface Checklist {
  id: number;
  nome: string;
  status: string;
  items: ChecklistItem[];
  createdAt: string;
  eventId?: number;
  event?: { id: number; nome: string };
}

interface Equipment {
  id: number;
  nome: string;
  descricao: string;
  quantidadeDisponivel: number;
  origem: string;
}

export default function Checklists() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCreate, setModalCreate] = useState(false);
  const [modalItems, setModalItems] = useState(false);
  const [modalAddItem, setModalAddItem] = useState(false);
  const [selected, setSelected] = useState<Checklist | null>(null);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  // Create form
  const [nome, setNome] = useState('');

  // Add item form
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [setor, setSetor] = useState('som');

  // Confirm modals
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<number | null>(null);

  // Separation/Return modals
  const [separateModal, setSeparateModal] = useState<ChecklistItem | null>(null);
  const [separateQty, setSeparateQty] = useState(1);
  const [returnModal, setReturnModal] = useState<ChecklistItem | null>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnSituacao, setReturnSituacao] = useState<'ok' | 'quebrado' | 'perdido'>('ok');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [clRes, eqRes] = await Promise.all([
        checklistApi.getAll(),
        equipmentApi.getAll(),
      ]);
      setChecklists(clRes.data);
      setEquipments(eqRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await checklistApi.create(nome);
      setModalCreate(false);
      setNome('');
      addToast('success', 'Checklist criado com sucesso');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao criar checklist');
    }
  }

  async function handleLiberar(id: number) {
    try {
      await checklistApi.liberar(id);
      addToast('success', 'Checklist liberado para separação');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao liberar');
    }
  }

  async function handleCancelar(motivo?: string) {
    if (!confirmCancel || !motivo) return;
    try {
      await checklistApi.cancelar(confirmCancel, motivo);
      setConfirmCancel(null);
      addToast('success', 'Checklist cancelado');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao cancelar');
    }
  }

  async function handleClonar(id: number) {
    try {
      const res = await checklistApi.clonar(id);
      if (res.data.alertas?.length > 0) {
        res.data.alertas.forEach((a: string) => addToast('warning', a));
      }
      addToast('success', 'Checklist clonado com sucesso');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao clonar');
    }
  }

  function openItems(cl: Checklist) {
    setSelected(cl);
    setModalItems(true);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      await checklistItemApi.create({
        checklistId: selected.id,
        equipmentId: Number(selectedEquipment),
        quantidadePlanejada: quantidade,
        setor,
      });
      setModalAddItem(false);
      setSelectedEquipment('');
      setQuantidade(1);
      setSetor('som');
      addToast('success', 'Item adicionado ao checklist');
      const res = await checklistApi.getOne(selected.id);
      setSelected(res.data);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao adicionar item');
    }
  }

  async function handleSeparar() {
    if (!separateModal) return;
    try {
      const res = await checklistItemApi.separar(separateModal.id, separateQty);
      addToast('success', res.data.aviso || 'Item separado');
      if (res.data.alerta) {
        addToast('warning', res.data.alerta);
      }
      setSeparateModal(null);
      setSeparateQty(1);
      if (selected) {
        const r = await checklistApi.getOne(selected.id);
        setSelected(r.data);
      }
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao separar');
    }
  }

  async function handleDevolver() {
    if (!returnModal) return;
    try {
      const res = await checklistItemApi.devolver(returnModal.id, returnQty, returnSituacao);
      addToast('success', res.data.mensagem || 'Item devolvido');
      setReturnModal(null);
      setReturnQty(1);
      setReturnSituacao('ok');
      if (selected) {
        const r = await checklistApi.getOne(selected.id);
        setSelected(r.data);
      }
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao devolver');
    }
  }

  async function handleRemoveItem() {
    if (!confirmRemoveItem) return;
    try {
      await checklistItemApi.remove(confirmRemoveItem);
      setConfirmRemoveItem(null);
      addToast('success', 'Item removido');
      if (selected) {
        const res = await checklistApi.getOne(selected.id);
        setSelected(res.data);
      }
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover');
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
          <ClipboardList className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Checklists
            </h1>
            <p className="text-sm text-slate-500">
              {checklists.length} checklist(s)
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setModalCreate(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={18} /> Novo Checklist
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {checklists.map((cl) => (
          <div
            key={cl.id}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => openItems(cl)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-700 dark:text-white truncate">
                {cl.nome}
              </h3>
              <StatusBadge status={cl.status} />
            </div>
            {cl.event && (
              <p className="text-xs text-indigo-500 mb-1">
                📅 {cl.event.nome}
              </p>
            )}
            <p className="text-xs text-slate-400 mb-3">
              {cl.items?.length ?? 0} item(ns) •{' '}
              {new Date(cl.createdAt).toLocaleDateString('pt-BR')}
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {isAdmin && cl.status === 'rascunho' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLiberar(cl.id);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                  <Play size={12} className="inline mr-1" />
                  Liberar
                </button>
              )}
              {isAdmin &&
                (cl.status === 'rascunho' || cl.status === 'liberado') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmCancel(cl.id);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <X size={12} className="inline mr-1" />
                    Cancelar
                  </button>
                )}
              {isAdmin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClonar(cl.id);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <Copy size={12} className="inline mr-1" />
                  Clonar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {checklists.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          Nenhum checklist cadastrado
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={modalCreate}
        onClose={() => setModalCreate(false)}
        title="Novo Checklist"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Ex: Show Banda X"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Criar Checklist
          </button>
        </form>
      </Modal>

      {/* Cancel Confirm Modal */}
      <ConfirmModal
        open={confirmCancel !== null}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancelar}
        title="Cancelar Checklist"
        message="Tem certeza que deseja cancelar este checklist? Equipamentos separados serão devolvidos ao estoque."
        confirmLabel="Cancelar Checklist"
        type="danger"
        showInput
        inputLabel="Motivo do cancelamento"
        inputPlaceholder="Informe o motivo..."
        inputRequired
      />

      {/* Remove Item Confirm Modal */}
      <ConfirmModal
        open={confirmRemoveItem !== null}
        onClose={() => setConfirmRemoveItem(null)}
        onConfirm={handleRemoveItem}
        title="Remover Item"
        message="Tem certeza que deseja remover este item do checklist?"
        confirmLabel="Remover"
        type="danger"
      />

      {/* Items Modal */}
      <Modal
        open={modalItems}
        onClose={() => setModalItems(false)}
        title={`Itens - ${selected?.nome ?? ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={selected?.status ?? ''} />
              {selected?.event && (
                <span className="text-xs text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg">
                  📅 {selected.event.nome}
                </span>
              )}
            </div>
            {isAdmin && selected?.status === 'rascunho' && (
              <button
                onClick={() => setModalAddItem(true)}
                className="text-xs flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={14} /> Adicionar Item
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                    Equipamento
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">
                    Planejada
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">
                    Separada
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">
                    Devolvida
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">
                    Status
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {selected?.items?.map((item) => {
                  const canSeparate =
                    !isAdmin &&
                    selected?.status === 'liberado' &&
                    item.quantidadeSeparada < item.quantidadePlanejada;
                  const canReturn =
                    !isAdmin &&
                    (selected?.status === 'em_evento' ||
                      selected?.status === 'pendente_devolucao') &&
                    item.quantidadeDevolvida < item.quantidadeSeparada;
                  const fullyReturned =
                    item.quantidadeSeparada > 0 &&
                    item.quantidadeDevolvida >= item.quantidadeSeparada;

                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                        {item.nomeSnapshot}
                        <span className="text-xs text-slate-400 ml-1">
                          ({item.setor})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {item.quantidadePlanejada}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={item.quantidadeSeparada === item.quantidadePlanejada ? 'text-emerald-600 font-semibold' : ''}>
                          {item.quantidadeSeparada}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={fullyReturned ? 'text-emerald-600 font-semibold' : ''}>
                          {item.quantidadeDevolvida}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={item.statusDevolucao} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {/* Fix #7: Only FUNCIONARIO can separate */}
                          {canSeparate && (
                            <button
                              onClick={() => {
                                setSeparateModal(item);
                                setSeparateQty(item.quantidadePlanejada - item.quantidadeSeparada);
                              }}
                              className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              Separar
                            </button>
                          )}
                          {/* Fix #12: Devolver only when not fully returned */}
                          {canReturn && (
                            <button
                              onClick={() => {
                                setReturnModal(item);
                                setReturnQty(item.quantidadeSeparada - item.quantidadeDevolvida);
                              }}
                              className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 transition-colors"
                            >
                              Devolver
                            </button>
                          )}
                          {isAdmin && selected?.status === 'rascunho' && (
                            <button
                              onClick={() => setConfirmRemoveItem(item.id)}
                              className="text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(!selected?.items || selected.items.length === 0) && (
              <div className="p-6 text-center text-slate-400 text-sm">
                Nenhum item neste checklist
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Add Item Modal — with EquipmentSearch */}
      <Modal
        open={modalAddItem}
        onClose={() => {
          setModalAddItem(false);
          setSelectedEquipment('');
          setQuantidade(1);
          setSetor('som');
        }}
        title="Adicionar Item"
      >
        <form onSubmit={handleAddItem} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Equipamento
            </label>
            <EquipmentSearch
              equipments={equipments}
              value={selectedEquipment}
              onChange={setSelectedEquipment}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Quantidade
              </label>
              <input
                type="number"
                min="1"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Setor
              </label>
              {/* Fix #11: Buttons instead of manual typing */}
              <div className="flex gap-1.5 flex-wrap">
                {['som', 'luz', 'video', 'estrutura'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSetor(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${setor === s
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={!selectedEquipment}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Adicionar
          </button>
        </form>
      </Modal>

      {/* Separate Modal */}
      <Modal
        open={separateModal !== null}
        onClose={() => { setSeparateModal(null); setSeparateQty(1); }}
        title={`Separar - ${separateModal?.nomeSnapshot ?? ''}`}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-sm">
            <p className="text-blue-700 dark:text-blue-300">
              Planejado: <strong>{separateModal?.quantidadePlanejada}</strong> |
              Já separado: <strong>{separateModal?.quantidadeSeparada}</strong> |
              Restante: <strong>{(separateModal?.quantidadePlanejada ?? 0) - (separateModal?.quantidadeSeparada ?? 0)}</strong>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Quantidade a separar
            </label>
            <input
              type="number"
              min="1"
              max={(separateModal?.quantidadePlanejada ?? 0) - (separateModal?.quantidadeSeparada ?? 0)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={separateQty}
              onChange={(e) => setSeparateQty(Number(e.target.value))}
            />
          </div>
          <button
            onClick={handleSeparar}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Confirmar Separação
          </button>
        </div>
      </Modal>

      {/* Return Modal */}
      <Modal
        open={returnModal !== null}
        onClose={() => { setReturnModal(null); setReturnQty(1); setReturnSituacao('ok'); }}
        title={`Devolver - ${returnModal?.nomeSnapshot ?? ''}`}
      >
        <div className="space-y-4">
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 text-sm">
            <p className="text-green-700 dark:text-green-300">
              Separado: <strong>{returnModal?.quantidadeSeparada}</strong> |
              Já devolvido: <strong>{returnModal?.quantidadeDevolvida}</strong> |
              Restante: <strong>{(returnModal?.quantidadeSeparada ?? 0) - (returnModal?.quantidadeDevolvida ?? 0)}</strong>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Quantidade a devolver
            </label>
            <input
              type="number"
              min="1"
              max={(returnModal?.quantidadeSeparada ?? 0) - (returnModal?.quantidadeDevolvida ?? 0)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={returnQty}
              onChange={(e) => setReturnQty(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Situação
            </label>
            {/* Fix #11: Visual buttons instead of typed text */}
            <div className="flex gap-2">
              {(['ok', 'quebrado', 'perdido'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setReturnSituacao(s)}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${returnSituacao === s
                      ? s === 'ok'
                        ? 'bg-emerald-500 text-white'
                        : s === 'quebrado'
                          ? 'bg-red-500 text-white'
                          : 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                >
                  {s === 'ok' ? '✓ OK' : s === 'quebrado' ? '✕ Quebrado' : '? Perdido'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleDevolver}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Confirmar Devolução
          </button>
        </div>
      </Modal>
    </div>
  );
}
