import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  X,
  Copy,
  AlertCircle,
  PackageCheck,
  RotateCcw,
  Link,
} from 'lucide-react';
import { checklistApi, checklistItemApi, equipmentApi, eventApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import StatusBadge from '../components/StatusBadge';
import EquipmentSearch from '../components/EquipmentSearch';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';
import Pagination from '../components/Pagination';

interface ChecklistItem {
  id: number;
  equipmentId: number;
  nomeSnapshot: string;
  quantidadePlanejada: number;
  quantidadeSeparada: number;
  quantidadeDevolvida: number;
  quantidadeOk: number;
  quantidadeQuebrada: number;
  quantidadePerdida: number;
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
  event?: { id: number; nome: string; status: string };
}

interface Equipment {
  id: number;
  nome: string;
  descricao: string;
  quantidadeDisponivel: number;
  quantidadeTotal: number;
  origem: string;
}

interface EventOption {
  id: number;
  nome: string;
  cliente: string;
  status: string;
}

const SETORES = ['som', 'luz', 'video', 'estrutura', 'comunicacao', 'outros'];

// Quantity stepper component
function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center"
      >
        -
      </button>
      <span className="text-2xl font-bold text-slate-800 dark:text-white w-12 text-center">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

export default function Checklists() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCreate, setModalCreate] = useState(false);
  const [modalItems, setModalItems] = useState(false);
  const [modalAddItem, setModalAddItem] = useState(false);
  const [selected, setSelected] = useState<Checklist | null>(null);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const { isAdmin, user } = useAuth();
  const { addToast } = useToast();
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  // Create form
  const [nome, setNome] = useState('');
  const [createEventId, setCreateEventId] = useState('');

  // Add item form
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [setor, setSetor] = useState('som');

  // Confirm modals
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<number | null>(null);

  // Rename after clone (status rascunho)
  const [renameModal, setRenameModal] = useState<{ id: number; nome: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [lowStockNames, setLowStockNames] = useState<string[]>([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Separation modal with stepper
  const [separateModal, setSeparateModal] = useState<ChecklistItem | null>(null);
  const [separateQty, setSeparateQty] = useState(1);

  // Return modal - mixed return (OK + Damaged + Lost per item)
  const [returnModal, setReturnModal] = useState<ChecklistItem | null>(null);
  const [returnOk, setReturnOk] = useState(0);
  const [returnDanificado, setReturnDanificado] = useState(0);
  const [returnPerdido, setReturnPerdido] = useState(0);
  const [returnObservation, setReturnObservation] = useState('');

  // Separation blocking modal
  const [pendingModal, setPendingModal] = useState(false);

  useEffect(() => {
    // Abrir checklist diretamente via rota /checklists/:id
    const idNum = routeId ? Number(routeId) : null;
    if (!idNum || Number.isNaN(idNum)) return;
    if (loading) return;
    openChecklistById(idNum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, loading]);

  async function load() {
    try {
      const [clRes, eqRes, evRes] = await Promise.all([
        checklistApi.getAll({ page, limit }),
        equipmentApi.getAll({ page: 1, limit: 1000 }),
        eventApi.getAll({ page: 1, limit: 1000 }),
      ]);
      setChecklists(clRes.data.data);
      setTotal(clRes.data.total);
      setTotalPages(clRes.data.totalPages);
      setEquipments(eqRes.data.data);
      setEvents(evRes.data.data.filter((ev: any) => ev.status !== 'finalizado'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, limit]);

  async function openChecklistById(id: number) {
    try {
      const r = await checklistApi.getOne(id);
      setSelected(r.data);
      setModalItems(true);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Checklist não encontrado');
      // Volta para a lista, mantendo UX consistente
      navigate('/checklists');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createEventId) {
      addToast('error', 'Selecione um evento para o checklist');
      return;
    }
    try {
      await checklistApi.create(nome, Number(createEventId));
      setModalCreate(false);
      setNome('');
      setCreateEventId('');
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
      const novoId = res.data?.checklist?.id;
      const nomeNovo = res.data?.checklist?.nome ?? 'Novo checklist';
       const itensBaixoEstoque = (res.data?.itensEstoqueInsuficiente ?? []) as { nome: string }[];
       setLowStockNames(itensBaixoEstoque.map((i) => i.nome));
      if (novoId) {
        setRenameModal({ id: novoId, nome: nomeNovo });
        setRenameValue(nomeNovo);
        await refreshSelected(novoId);
        setModalItems(true);
      }
      addToast('success', 'Checklist clonado (rascunho). Você pode renomear agora.');
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao clonar');
    }
  }

  async function handleRenameChecklist(e: React.FormEvent) {
    e.preventDefault();
    if (!renameModal) return;
    try {
      await checklistApi.updateNome(renameModal.id, renameValue);
      addToast('success', 'Nome do checklist atualizado');
      setRenameModal(null);
      setRenameValue('');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao renomear checklist');
    }
  }

  function openItems(cl: Checklist) {
    setSelected(cl);
    setModalItems(true);
  }

  async function refreshSelected(id: number) {
    const r = await checklistApi.getOne(id);
    setSelected(r.data);
    load();
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
      await refreshSelected(selected.id);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao adicionar item');
    }
  }

  async function handleSeparar() {
    if (!separateModal) return;
    try {
      const res = await checklistItemApi.separar(separateModal.id, separateQty);
      addToast('success', res.data.aviso || 'Item separado com sucesso');
      if (res.data.alerta) addToast('warning', res.data.alerta);
      setSeparateModal(null);
      setSeparateQty(1);
      if (selected) await refreshSelected(selected.id);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao separar');
    }
  }

  // Return - mixed (OK + Damaged + Lost per item)
  async function handleDevolver() {
    if (!returnModal) return;
    const totalReturn = returnOk + returnDanificado + returnPerdido;
    if (totalReturn === 0) {
      addToast('error', 'Informe pelo menos uma quantidade para devolver');
      return;
    }

    const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
    if (totalReturn > remaining) {
      addToast('error', `Quantidade total (${totalReturn}) excede o restante (${remaining})`);
      return;
    }

    try {
      const res = await checklistItemApi.devolver(returnModal.id, returnOk, returnDanificado, returnPerdido, returnObservation || undefined);
      addToast('success', res.data?.mensagem || 'Devolução registrada.');
      setReturnModal(null);
      setReturnOk(0);
      setReturnDanificado(0);
      setReturnPerdido(0);
      setReturnObservation('');
      if (selected) await refreshSelected(selected.id);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao devolver');
    }
  }

  // Edit planned quantity modal
  const [editQtyModal, setEditQtyModal] = useState<ChecklistItem | null>(null);
  const [editQtyValue, setEditQtyValue] = useState(1);

  async function handleRemoveItem() {
    if (!confirmRemoveItem) return;
    try {
      await checklistItemApi.remove(confirmRemoveItem);
      setConfirmRemoveItem(null);
      addToast('success', 'Item removido');
      if (selected) await refreshSelected(selected.id);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover');
    }
  }

  async function handleUpdateQuantidade() {
    if (!editQtyModal || !selected) return;
    try {
      await checklistItemApi.update(editQtyModal.id, editQtyValue);
      addToast('success', 'Quantidade atualizada');
      setEditQtyModal(null);
      await refreshSelected(selected.id);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao atualizar quantidade');
    }
  }

  // Check if admin can finalize checklist
  function canFinalizarChecklist(cl: Checklist | null): boolean {
    if (!cl || !isAdmin) return false;
    if (cl.status !== 'pendente_devolucao' && cl.status !== 'em_evento') return false;
    return (cl.items ?? []).every((i) => i.quantidadeDevolvida >= i.quantidadeSeparada);
  }

  // Role-based permissions
  const canSeparate =
    !isAdmin &&
    selected?.status === 'liberado';

  // Employees can return items (data collection only)
  const canReturn =
    !isAdmin &&
    ['em_evento', 'pendente_devolucao'].includes(selected?.status ?? '');

  // Admin can approve pending occurrences
  const canApprove =
    isAdmin &&
    ['em_evento', 'pendente_devolucao', 'concluido'].includes(selected?.status ?? '');

  const canEditPlanned =
    isAdmin &&
    ['rascunho', 'liberado', 'em_evento'].includes(selected?.status ?? '') &&
    selected?.status !== 'cancelado';

  // Pending separation items for blocking modal
  const pendingItems = (selected?.items ?? []).filter(
    (i) => i.quantidadeSeparada < i.quantidadePlanejada,
  );

  // Return progress
  const totalSeparados = (selected?.items ?? []).reduce((s, i) => s + i.quantidadeSeparada, 0);
  const totalDevolvidos = (selected?.items ?? []).reduce((s, i) => s + i.quantidadeDevolvida, 0);
  const returnProgress = totalSeparados > 0 ? Math.round((totalDevolvidos / totalSeparados) * 100) : 0;
  const pendingReturnItems = (selected?.items ?? []).filter(
    (i) => i.quantidadeDevolvida < i.quantidadeSeparada,
  );

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
              {total} checklist(s)
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setModalCreate(true); setNome(''); setCreateEventId(''); }}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={18} /> Novo Checklist
          </button>
        )}
      </div>

      {/* Checklist Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {checklists.map((cl) => (
          <div
            key={cl.id}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-slate-700 dark:text-white">
                    {cl.nome}
                  </h3>
                  <StatusBadge status={cl.status} />
                </div>
                {cl.event ? (
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1">
                    <Link size={11} />
                    {cl.event.nome}
                  </p>
                ) : (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={11} />
                    Sem evento vinculado
                  </p>
                )}
              </div>
            </div>

            {/* Item counts */}
            <div className="text-xs text-slate-500 space-y-0.5 mb-3">
              <p>{cl.items?.length ?? 0} item(s)</p>
              {cl.items?.length > 0 && (
                <p>
                  Separados:{' '}
                  {cl.items.filter((i) => i.quantidadeSeparada >= i.quantidadePlanejada).length}/
                  {cl.items.length}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => openItems(cl)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors font-medium"
              >
                <PackageCheck size={13} /> Itens
              </button>

              {isAdmin && cl.status === 'rascunho' && (
                <>
                  <button
                    onClick={() => handleLiberar(cl.id)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-colors font-medium"
                  >
                    Liberar
                  </button>
                  <button
                    onClick={() => handleClonar(cl.id)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                  >
                    <Copy size={13} /> Clonar
                  </button>
                  <button
                    onClick={() => setConfirmCancel(cl.id)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <X size={13} /> Cancelar
                  </button>
                </>
              )}
              {isAdmin && cl.status === 'liberado' && (
                <button
                  onClick={() => setConfirmCancel(cl.id)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition-colors"
                >
                  <X size={13} /> Cancelar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
      />

      {checklists.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          Nenhum checklist cadastrado
        </div>
      )}

      {/* Create Checklist Modal - requires Event */}
      <Modal
        open={modalCreate}
        onClose={() => setModalCreate(false)}
        title="Novo Checklist"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            Todo checklist precisa estar vinculado a um evento.
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Evento <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={createEventId}
              onChange={(e) => setCreateEventId(e.target.value)}
              required
            >
              <option value="">Selecione um evento...</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nome} - {ev.cliente}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome do Checklist <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Ex: Checklist Palco Principal"
            />
          </div>
          <button
            type="submit"
            disabled={!createEventId || !nome}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Criar Checklist
          </button>
        </form>
      </Modal>

      {/* Items Modal */}
      <Modal
        open={modalItems}
        onClose={() => { setModalItems(false); setSelected(null); }}
        title={selected?.nome ?? ''}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          {/* Header bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={selected?.status ?? ''} />
              {selected?.event && (
                <span className="text-xs text-indigo-500 flex items-center gap-1">
                  <Link size={11} /> {selected.event.nome}
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && selected && ['rascunho', 'liberado'].includes(selected.status) && (
                <button
                  onClick={() => setModalAddItem(true)}
                  className="flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium"
                >
                  <Plus size={14} /> Adicionar Item
                </button>
              )}
              {isAdmin && selected && canFinalizarChecklist(selected) && (
                <button
                  onClick={async () => {
                    try {
                      // Finalize via liberar → mark all done
                      addToast('info', 'Funcionalidade de finalização em implementação');
                    } catch (err: any) {
                      addToast('error', err.response?.data?.message || 'Erro ao finalizar');
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium"
                >
                  <CheckCircle2 size={14} /> Finalizar Checklist
                </button>
              )}
            </div>
          </div>

          {/* Employee return guidance panel */}
          {!isAdmin && selected && ['em_evento', 'pendente_devolucao'].includes(selected.status) && (
            <div className={`rounded-xl border p-4 ${
              pendingReturnItems.length > 0
                ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
                : 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className={`text-sm font-semibold ${
                  pendingReturnItems.length > 0
                    ? 'text-amber-800 dark:text-amber-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  📦 Progresso de Devolução
                </h4>
                <span className={`text-sm font-bold ${
                  pendingReturnItems.length > 0
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-emerald-600 dark:text-emerald-300'
                }`}>
                  {totalDevolvidos} / {totalSeparados}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-3">
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ${
                    returnProgress === 100 ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${returnProgress}%` }}
                />
              </div>
              {pendingReturnItems.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> Ainda faltam:
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {pendingReturnItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5"
                      >
                        <span className="font-medium text-red-700 dark:text-red-300">
                          {item.nomeSnapshot}
                        </span>
                        <span className="text-red-600 dark:text-red-400 font-bold">
                          Faltam {item.quantidadeSeparada - item.quantidadeDevolvida} unid.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> Todos os itens foram devolvidos!
                </p>
              )}
            </div>
          )}

          {/* Enhanced Separation UI for employee */}
          {!isAdmin && selected?.status === 'liberado' && (
            <div className="space-y-4">
              {/* Progress bar and stats */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <PackageCheck size={20} className="text-indigo-500" />
                    Progresso de Separação
                  </h4>
                  <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {(selected.items ?? []).filter(i => i.quantidadeSeparada >= i.quantidadePlanejada).length} / {(selected.items ?? []).length}
                  </span>
                </div>
                
                {/* Big colored progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-4">
                  <div
                    className="h-4 rounded-full transition-all duration-700 bg-gradient-to-r from-indigo-500 to-purple-600"
                    style={{ 
                      width: `${((selected.items ?? []).filter(i => i.quantidadeSeparada >= i.quantidadePlanejada).length / (selected.items ?? []).length) * 100}%` 
                    }}
                  />
                </div>

                {/* Missing items section */}
                {pendingItems.length > 0 && (
                  <div className="rounded-xl border-2 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4">
                    <h5 className="text-sm font-bold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
                      <AlertCircle size={16} />
                      Equipamentos faltando:
                    </h5>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {pendingItems.map((item) => {
                        const missing = item.quantidadePlanejada - item.quantidadeSeparada;
                        const progress = (item.quantidadeSeparada / item.quantidadePlanejada) * 100;
                        
                        return (
                          <div key={item.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-3 border border-red-200 dark:border-red-700">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-800 dark:text-white">
                                {item.nomeSnapshot}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Setor: {item.setor}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-600 dark:text-red-400">
                                Faltam {missing} unid.
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.quantidadeSeparada}/{item.quantidadePlanejada}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Finalize button - only when complete */}
                {pendingItems.length === 0 ? (
                  <button
                    onClick={async () => {
                      // All items separated - move to em_evento status
                      try {
                        addToast('success', 'Todos os itens foram separados! Checklist pronto para o evento.');
                        await refreshSelected(selected.id);
                      } catch (err: any) {
                        addToast('error', 'Erro ao finalizar separação');
                      }
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Finalizar Separação
                  </button>
                ) : (
                  <button
                    onClick={() => setPendingModal(true)}
                    disabled={true}
                    className="w-full bg-red-500 text-white py-3 rounded-xl text-sm font-bold opacity-75 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <AlertCircle size={18} />
                    Não é possível finalizar - {pendingItems.length} itens pendentes
                  </button>
                )}
              </div>

              {/* Visual separation status by item */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(selected.items ?? []).map((item) => {
                  const isSeparated = item.quantidadeSeparada >= item.quantidadePlanejada;
                  const progress = (item.quantidadeSeparada / item.quantidadePlanejada) * 100;
                  
                  let statusColor = 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
                  let statusIcon = '🟥';
                  let statusText = 'NÍO SEPARADO';
                  
                  if (isSeparated) {
                    statusColor = 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20';
                    statusIcon = '🟩';
                    statusText = 'COMPLETO';
                  } else if (progress > 0) {
                    statusColor = 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20';
                    statusIcon = '🟨';
                    statusText = 'PARCIAL';
                  }
                  
                  return (
                    <div key={item.id} className={`rounded-xl border-2 p-4 ${statusColor}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            {statusIcon} {item.nomeSnapshot}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.setor.toUpperCase()}
                          </p>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {statusText}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-400">Progresso:</span>
                          <span className="font-bold text-slate-800 dark:text-white">
                            {item.quantidadeSeparada} / {item.quantidadePlanejada}
                          </span>
                        </div>
                        
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${
                              isSeparated ? 'bg-emerald-500' : progress > 0 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        
                        {!isSeparated && (
                          <button
                            onClick={() => {
                              setSeparateModal(item);
                              setSeparateQty(item.quantidadePlanejada - item.quantidadeSeparada);
                            }}
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-lg text-xs font-medium transition-colors mt-2"
                          >
                            Separar {item.quantidadePlanejada - item.quantidadeSeparada} restantes
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Items table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                    Equipamento
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    Plan.
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    Sep.
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    Devol.
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    OK/Qb/Pd
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
                {(selected?.items ?? []).map((item) => {
                  const fullySeparated = item.quantidadeSeparada >= item.quantidadePlanejada;
                  const fullyReturned = item.quantidadeDevolvida >= item.quantidadeSeparada && item.quantidadeSeparada > 0;
                  const isPending =
                    !isAdmin &&
                    ['em_evento', 'pendente_devolucao'].includes(selected?.status ?? '') &&
                    item.quantidadeDevolvida < item.quantidadeSeparada;
                  const canEditPlanned =
                    isAdmin &&
                    ['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'].includes(selected?.status ?? '') &&
                    selected?.status !== 'cancelado';
                  const isLowStockCloned = lowStockNames.includes(item.nomeSnapshot);

                  return (
                    <tr
                      key={item.id}
                      className={
                        isPending
                          ? 'bg-red-50 dark:bg-red-900/10'
                          : isLowStockCloned
                          ? 'bg-red-50/60 dark:bg-red-900/20'
                          : ''
                      }
                    >
                      <td className="px-3 py-2">
                        <p
                          className={
                            isLowStockCloned
                              ? 'font-medium text-red-700 dark:text-red-300'
                              : 'font-medium text-slate-700 dark:text-slate-200'
                          }
                        >
                          {item.nomeSnapshot}
                        </p>
                        <p className="text-xs text-slate-400">{item.setor}</p>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">
                        {item.quantidadePlanejada}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={fullySeparated ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                          {item.quantidadeSeparada}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={fullyReturned ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                          {item.quantidadeDevolvida}
                          {item.quantidadeSeparada > 0 && !fullyReturned && item.quantidadeDevolvida > 0 && (
                            <span className="text-red-500 ml-1 text-xs">
                              (-{item.quantidadeSeparada - item.quantidadeDevolvida})
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-0.5 justify-center text-xs">
                          {(item.quantidadeOk ?? 0) > 0 && (
                            <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                              {item.quantidadeOk}✓
                            </span>
                          )}
                          {(item.quantidadeQuebrada ?? 0) > 0 && (
                            <span className="bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                              {item.quantidadeQuebrada}✕
                            </span>
                          )}
                          {(item.quantidadePerdida ?? 0) > 0 && (
                            <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                              {item.quantidadePerdida}?
                            </span>
                          )}
                          {(item.quantidadeOk ?? 0) === 0 &&
                            (item.quantidadeQuebrada ?? 0) === 0 &&
                            (item.quantidadePerdida ?? 0) === 0 && (
                              <span className="text-slate-400">-</span>
                            )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={item.statusDevolucao} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {canSeparate && item.quantidadeSeparada < item.quantidadePlanejada && (
                            <button
                              onClick={() => {
                                setSeparateModal(item);
                                setSeparateQty(
                                  Math.max(1, item.quantidadePlanejada - item.quantidadeSeparada),
                                );
                              }}
                              className="text-xs font-medium text-blue-600 dark:text-white hover:underline"
                            >
                              Separar
                            </button>
                          )}
                          {canReturn && item.quantidadeDevolvida < item.quantidadeSeparada && (
                            <button
                              onClick={() => {
                                setReturnModal(item);
                                setReturnQty(1);
                                setReturnObservation('');
                              }}
                              className="text-xs font-medium text-emerald-600 dark:text-white hover:underline"
                            >
                              <RotateCcw size={11} className="inline mr-0.5" />
                              Devolver
                            </button>
                          )}
                          {canReview && item.statusDevolucao === 'pendente_revisao' && (
                            <button
                              onClick={() => {
                                setReviewModal(item);
                                setReviewConditions({
                                  ok: item.quantidadeDevolvida,
                                  danificado: 0,
                                  perdido: 0,
                                });
                              }}
                              className="text-xs font-medium text-red-600 dark:text-white hover:underline"
                            >
                              Revisar Devolução
                            </button>
                          )}
                          {canEditReturn && (item.quantidadeOk ?? 0) > 0 && (
                            <button
                              onClick={() => {
                                setEditReturnModal(item);
                                setEditReturnConditions({
                                  ok: item.quantidadeOk ?? 0,
                                  quebrado: item.quantidadeQuebrada ?? 0,
                                  perdido: item.quantidadePerdida ?? 0,
                                });
                              }}
                              className="text-xs font-medium text-slate-700 dark:text-white hover:underline"
                            >
                              Editar Devolução
                            </button>
                          )}
                          {canEditPlanned && (
                            <button
                              onClick={() => {
                                setEditQtyModal(item);
                                setEditQtyValue(item.quantidadePlanejada);
                              }}
                              className="text-xs font-medium text-indigo-600 dark:text-white hover:underline"
                            >
                              Editar qtd
                            </button>
                          )}
                          {isAdmin && selected && ['rascunho', 'liberado'].includes(selected.status) && (
                            <button
                              onClick={() => setConfirmRemoveItem(item.id)}
                              className="text-xs font-medium text-red-600 dark:text-white hover:underline"
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

          {/* Separation completion check for employee */}
          {!isAdmin && selected?.status === 'liberado' && (
            <div className="mt-2">
              {pendingItems.length > 0 ? (
                <button
                  onClick={() => setPendingModal(true)}
                  className="w-full flex items-center justify-center gap-2 border border-amber-300 text-amber-700 dark:text-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-xl py-2.5 text-sm font-medium"
                >
                  <AlertCircle size={16} />
                  {pendingItems.length} item(s) pendente(s) - ver detalhes
                </button>
              ) : (
                <div className="flex items-center gap-2 justify-center text-emerald-600 dark:text-emerald-400 py-2 text-sm">
                  <CheckCircle2 size={16} />
                  Todos os itens estão separados!
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Add Item Modal */}
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
              <div className="flex justify-center py-2">
                <QuantityStepper value={quantidade} onChange={setQuantidade} min={1} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Setor
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {SETORES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSetor(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      setor === s
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
            Adicionar Item
          </button>
        </form>
      </Modal>

      {/* Separation Modal - stepper + progress info */}
      <Modal
        open={separateModal !== null}
        onClose={() => { setSeparateModal(null); setSeparateQty(1); }}
        title={`Separar - ${separateModal?.nomeSnapshot ?? ''}`}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Planejado', value: separateModal?.quantidadePlanejada ?? 0, color: 'text-slate-700 dark:text-slate-200' },
              { label: 'Já separado', value: separateModal?.quantidadeSeparada ?? 0, color: 'text-blue-600' },
              { label: 'Restante', value: (separateModal?.quantidadePlanejada ?? 0) - (separateModal?.quantidadeSeparada ?? 0), color: 'text-amber-600 font-bold' },
            ].map((stat) => (
              <div key={stat.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 text-center">
              Quantidade a separar agora
            </label>
            <div className="flex justify-center">
              <QuantityStepper
                value={separateQty}
                onChange={setSeparateQty}
                min={1}
                max={(separateModal?.quantidadePlanejada ?? 0) - (separateModal?.quantidadeSeparada ?? 0)}
              />
            </div>
          </div>

          <button
            onClick={handleSeparar}
            disabled={separateQty <= 0}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            Confirmar Separação de {separateQty} unidade(s)
          </button>
        </div>
      </Modal>

      {/* Return Modal - simplified for employees (quantity + observation only) */}
      <Modal
        open={returnModal !== null}
        onClose={() => { setReturnModal(null); setReturnQty(1); setReturnObservation(''); }}
        title={`Devolver - ${returnModal?.nomeSnapshot ?? ''}`}
      >
        {returnModal && (() => {
          const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
          const isValid = returnQty > 0 && returnQty <= remaining;

          return (
            <div className="space-y-5">
              {/* Status summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Separado', value: returnModal.quantidadeSeparada, color: 'text-blue-600' },
                  { label: 'Já devolvido', value: returnModal.quantidadeDevolvida, color: 'text-emerald-600' },
                  { label: 'Aguardando', value: remaining, color: 'text-amber-600 font-bold' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  ⚠️ Apenas registro de devolução
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Você está apenas registrando a quantidade devolvida. O administrador revisará e definirá o status final (OK/Danificado/Perdido).
                </p>
              </div>

              {/* Quantity selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Quantidade a devolver:
                </label>
                <div className="flex justify-center py-2">
                  <QuantityStepper 
                    value={returnQty} 
                    onChange={setReturnQty} 
                    min={1} 
                    max={remaining} 
                  />
                </div>
              </div>

              {/* Observation field */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Observação (opcional):
                </label>
                <textarea
                  className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm resize-none"
                  rows={3}
                  placeholder="Ex: Equipamento com arranhões, caixa danificada, etc."
                  value={returnObservation}
                  onChange={(e) => setReturnObservation(e.target.value)}
                />
              </div>

              {/* Validation message */}
              <div className={`text-center py-2 rounded-xl text-sm font-medium ${
                !isValid
                  ? 'bg-red-100 dark:bg-red-900/20 text-red-700'
                  : 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700'
              }`}>
                {!isValid 
                  ? returnQty > remaining 
                    ? `Quantidade excede o restante (${remaining})`
                    : 'Informe uma quantidade válida'
                  : `Quantidade válida: ${returnQty} / ${remaining}`
                }
              </div>

              <button
                onClick={handleDevolver}
                disabled={!isValid}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Registrar Devolução
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Admin Review Modal - where stock changes happen */}
      <Modal
        open={reviewModal !== null}
        onClose={() => { setReviewModal(null); setReviewConditions({ ok: 0, danificado: 0, perdido: 0 }); }}
        title={`Revisar Devolução - ${reviewModal?.nomeSnapshot ?? ''}`}
      >
        {reviewModal && (() => {
          const totalReview = reviewConditions.ok + reviewConditions.danificado + reviewConditions.perdido;
          const isValid = totalReview === reviewModal.quantidadeDevolvida;

          return (
            <div className="space-y-5">
              <div className="rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                  🔴 Ação Administrativa
                </p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  Esta revisão AFETA o estoque. OK retorna ao disponível, Danificado vai para danificados, Perdido reduz o total.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                {[
                  { label: 'Devolvido', value: reviewModal.quantidadeDevolvida, color: 'text-blue-600' },
                  { label: 'A revisar', value: totalReview, color: 'text-amber-600 font-bold' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {[
                  { key: 'ok' as const, label: '✓ OK - Retorna ao disponível', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10' },
                  { key: 'danificado' as const, label: '✕ Danificado - Vai para danificados', color: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10' },
                  { key: 'perdido' as const, label: '? Perdido - Reduz total', color: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`flex items-center justify-between rounded-xl border p-3 ${color}`}>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {label}
                    </span>
                    <QuantityStepper
                      value={reviewConditions[key]}
                      onChange={(v) => setReviewConditions((prev) => ({ ...prev, [key]: v }))}
                      min={0}
                      max={reviewModal.quantidadeDevolvida}
                    />
                  </div>
                ))}
              </div>

              <div className={`text-center py-2 rounded-xl text-sm font-medium ${
                !isValid
                  ? 'bg-red-100 dark:bg-red-900/20 text-red-700'
                  : 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700'
              }`}>
                {!isValid 
                  ? `Total inválido: ${totalReview} / ${reviewModal.quantidadeDevolvida}`
                  : `Total válido: ${totalReview} / ${reviewModal.quantidadeDevolvida}`
                }
              </div>

              <button
                onClick={handleRevisarDevolucao}
                disabled={!isValid}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Revisar e Atualizar Estoque
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Edit planned quantity modal */}
      <Modal
        open={editQtyModal !== null}
        onClose={() => { setEditQtyModal(null); }}
        title={`Editar quantidade - ${editQtyModal?.nomeSnapshot ?? ''}`}
      >
        {editQtyModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ajuste a quantidade planejada. Se o checklist estiver liberado (ou além), o sistema ajusta o estoque automaticamente (Saldo Disponível ↔ Em Uso).
            </p>
            <div className="flex justify-center py-2">
              <QuantityStepper value={editQtyValue} onChange={setEditQtyValue} min={1} />
            </div>
            <button
              onClick={handleUpdateQuantidade}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Salvar quantidade
            </button>
          </div>
        )}
      </Modal>

      {/* Edit return composition modal */}
      <Modal
        open={editReturnModal !== null}
        onClose={() => { setEditReturnModal(null); setEditReturnConditions({ ok: 0, quebrado: 0, perdido: 0 }); }}
        title={`Editar devolução - ${editReturnModal?.nomeSnapshot ?? ''}`}
      >
        {editReturnModal && (() => {
          const total = (editReturnModal.quantidadeOk ?? 0) + (editReturnModal.quantidadeQuebrada ?? 0) + (editReturnModal.quantidadePerdida ?? 0);
          const totalNovo = editReturnConditions.ok + editReturnConditions.quebrado + editReturnConditions.perdido;
          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-700/30">
                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                  Total devolvido deve permanecer: <strong>{total}</strong>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">
                  Ao remover “Dano” ou “Perda”, a ocorrência vinculada será anulada e a quantidade retorna ao saldo disponível.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'ok' as const, label: '✓ OK', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10' },
                  { key: 'quebrado' as const, label: '✕ Quebrado (Dano)', color: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10' },
                  { key: 'perdido' as const, label: '? Perdido (Perda)', color: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`flex items-center justify-between rounded-xl border p-3 ${color}`}>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                    <QuantityStepper
                      value={editReturnConditions[key]}
                      onChange={(v) => setEditReturnConditions((prev) => ({ ...prev, [key]: v }))}
                      min={0}
                      max={total - (totalNovo - editReturnConditions[key])}
                    />
                  </div>
                ))}
              </div>

              <div className={`text-center py-2 rounded-xl text-sm font-medium ${
                totalNovo === total ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-200' : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-200'
              }`}>
                Total atual: <strong>{totalNovo}</strong> / {total}
              </div>

              <button
                onClick={handleEditarDevolucao}
                disabled={totalNovo !== total}
                className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Salvar edição da devolução
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Separation Pending Items blocking modal */}
      <Modal
        open={pendingModal}
        onClose={() => setPendingModal(false)}
        title="⚠️ Separação Incompleta"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4">
            <p className="text-sm font-bold text-red-800 dark:text-red-300 mb-2">
              🚨 Não é possível finalizar a separação
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">
              Os seguintes equipamentos ainda não foram separados completamente:
            </p>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5 border border-red-200 dark:border-red-700"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {item.nomeSnapshot}
                  </p>
                  <p className="text-xs text-slate-500">{item.setor}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-700 dark:text-red-300">
                    {item.quantidadeSeparada} / {item.quantidadePlanejada}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Faltam {item.quantidadePlanejada - item.quantidadeSeparada}
                  </p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              💡 Separe todos os itens completamente para habilitar o botão "Finalizar Separação"
            </p>
          </div>
          
          <button
            onClick={() => setPendingModal(false)}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium"
          >
            Entendido - continuar separando
          </button>
        </div>
      </Modal>

      {/* Confirm Cancel Modal */}
      <ConfirmModal
        open={confirmCancel !== null}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancelar}
        title="Cancelar Checklist"
        message="Informe o motivo do cancelamento. Esta ação é irreversível após confirmação."
        confirmLabel="Cancelar Checklist"
        type="danger"
        showInput
        inputLabel="Motivo"
        inputPlaceholder="Ex: Evento remarcado"
        inputRequired
      />

      {/* Confirm Remove Item */}
      <ConfirmModal
        open={confirmRemoveItem !== null}
        onClose={() => setConfirmRemoveItem(null)}
        onConfirm={handleRemoveItem}
        title="Remover Item"
        message="Deseja remover este item do checklist?"
        confirmLabel="Remover"
        type="danger"
      />

      {/* Rename cloned checklist */}
      <Modal
        open={renameModal !== null}
        onClose={() => { setRenameModal(null); setRenameValue(''); }}
        title={`Renomear Checklist - ${renameModal?.nome ?? ''}`}
      >
        <form onSubmit={handleRenameChecklist} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome/Título
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={!renameValue.trim()}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Salvar
          </button>
        </form>
      </Modal>
    </div>
  );
}
