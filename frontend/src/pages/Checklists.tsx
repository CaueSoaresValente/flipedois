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
        −
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

  // Separation modal with stepper
  const [separateModal, setSeparateModal] = useState<ChecklistItem | null>(null);
  const [separateQty, setSeparateQty] = useState(1);

  // Return modal with segmented condition + stepper
  const [returnModal, setReturnModal] = useState<ChecklistItem | null>(null);
  const [returnConditions, setReturnConditions] = useState<{
    ok: number;
    quebrado: number;
    perdido: number;
  }>({ ok: 0, quebrado: 0, perdido: 0 });

  // Separation blocking modal
  const [pendingModal, setPendingModal] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [clRes, eqRes, evRes] = await Promise.all([
        checklistApi.getAll(),
        equipmentApi.getAll(),
        eventApi.getAll(),
      ]);
      setChecklists(clRes.data);
      setEquipments(eqRes.data);
      setEvents(evRes.data.filter((ev: EventOption) => ev.status !== 'finalizado'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
      addToast('success', 'Checklist clonado — vincule ao evento antes de liberar');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao clonar');
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

  // Return with per-condition quantities
  async function handleDevolver() {
    if (!returnModal) return;
    const totalReturn = returnConditions.ok + returnConditions.quebrado + returnConditions.perdido;
    if (totalReturn === 0) {
      addToast('error', 'Informe pelo menos uma quantidade para devolver');
      return;
    }

    const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
    if (totalReturn > remaining) {
      addToast('error', `Total (${totalReturn}) excede o restante (${remaining})`);
      return;
    }

    try {
      // Submit each condition separately if > 0
      for (const [situacao, qty] of Object.entries(returnConditions) as [
        'ok' | 'quebrado' | 'perdido',
        number,
      ][]) {
        if (qty > 0) {
          await checklistItemApi.devolver(returnModal.id, qty, situacao);
        }
      }
      addToast('success', 'Devolução registrada com sucesso');
      setReturnModal(null);
      setReturnConditions({ ok: 0, quebrado: 0, perdido: 0 });
      if (selected) await refreshSelected(selected.id);
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
      if (selected) await refreshSelected(selected.id);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover');
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

  // Admin can edit/correct returns; funcionario performs normal returns
  const canReturn =
    ['em_evento', 'pendente_devolucao'].includes(selected?.status ?? '');

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
              {checklists.length} checklist(s)
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

      {checklists.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          Nenhum checklist cadastrado
        </div>
      )}

      {/* Create Checklist Modal — requires Event */}
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
                  {ev.nome} — {ev.cliente}
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
              {isAdmin && selected?.status === 'rascunho' && (
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

          {/* Separation progress for employee */}
          {!isAdmin && selected?.status === 'liberado' && pendingItems.length > 0 && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1.5 flex items-center gap-1.5">
                <PackageCheck size={14} /> Itens a Separar
              </h4>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {(selected.items ?? []).filter(i => i.quantidadeSeparada >= i.quantidadePlanejada).length} /{' '}
                {(selected.items ?? []).length} itens completamente separados
              </p>
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

                  return (
                    <tr
                      key={item.id}
                      className={isPending ? 'bg-red-50 dark:bg-red-900/10' : ''}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-700 dark:text-slate-200">
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
                              <span className="text-slate-400">—</span>
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
                              className="text-xs px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 transition-colors font-medium"
                            >
                              Separar
                            </button>
                          )}
                          {canReturn && item.quantidadeDevolvida < item.quantidadeSeparada && (
                            <button
                              onClick={() => {
                                setReturnModal(item);
                                const remaining = item.quantidadeSeparada - item.quantidadeDevolvida;
                                setReturnConditions({ ok: remaining, quebrado: 0, perdido: 0 });
                              }}
                              className="text-xs px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-colors font-medium"
                            >
                              <RotateCcw size={11} className="inline mr-0.5" />
                              Devolver
                            </button>
                          )}
                          {isAdmin && canReturn && item.quantidadeDevolvida < item.quantidadeSeparada && (
                            <button
                              onClick={() => {
                                setReturnModal(item);
                                const remaining = item.quantidadeSeparada - item.quantidadeDevolvida;
                                setReturnConditions({ ok: remaining, quebrado: 0, perdido: 0 });
                              }}
                              className="text-xs px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-colors font-medium"
                            >
                              <RotateCcw size={11} className="inline mr-0.5" />
                              Editar Devolução
                            </button>
                          )}
                          {isAdmin && selected?.status === 'rascunho' && (
                            <button
                              onClick={() => setConfirmRemoveItem(item.id)}
                              className="text-xs px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 transition-colors"
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
                  {pendingItems.length} item(s) pendente(s) — ver detalhes
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

      {/* Separation Modal — stepper + progress info */}
      <Modal
        open={separateModal !== null}
        onClose={() => { setSeparateModal(null); setSeparateQty(1); }}
        title={`Separar — ${separateModal?.nomeSnapshot ?? ''}`}
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

      {/* Return Modal — segmented condition buttons + per-condition steppers */}
      <Modal
        open={returnModal !== null}
        onClose={() => { setReturnModal(null); setReturnConditions({ ok: 0, quebrado: 0, perdido: 0 }); }}
        title={`Devolver — ${returnModal?.nomeSnapshot ?? ''}`}
      >
        {returnModal && (() => {
          const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
          const totalReturn = returnConditions.ok + returnConditions.quebrado + returnConditions.perdido;
          const isValid = totalReturn > 0 && totalReturn <= remaining;

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

              <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                Selecione a quantidade por condição:
              </p>

              {/* Per-condition steppers */}
              <div className="space-y-3">
                {[
                  { key: 'ok' as const, label: '✓ OK — Em bom estado', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10' },
                  { key: 'quebrado' as const, label: '✕ Quebrado — Com dano', color: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10' },
                  { key: 'perdido' as const, label: '? Perdido — Não encontrado', color: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`flex items-center justify-between rounded-xl border p-3 ${color}`}>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {label}
                    </span>
                    <QuantityStepper
                      value={returnConditions[key]}
                      onChange={(v) => setReturnConditions((prev) => ({ ...prev, [key]: v }))}
                      min={0}
                      max={remaining - totalReturn + returnConditions[key]}
                    />
                  </div>
                ))}
              </div>

              {/* Total indicator */}
              <div className={`text-center py-2 rounded-xl text-sm font-medium ${
                totalReturn === 0
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                  : totalReturn > remaining
                    ? 'bg-red-100 dark:bg-red-900/20 text-red-700'
                    : 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700'
              }`}>
                Total a devolver: <strong>{totalReturn}</strong> / {remaining} restante(s)
              </div>

              <button
                onClick={handleDevolver}
                disabled={!isValid}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Confirmar Devolução
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Separation Pending Items blocking modal */}
      <Modal
        open={pendingModal}
        onClose={() => setPendingModal(false)}
        title="Itens Pendentes de Separação"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Os seguintes itens ainda não foram completamente separados:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-2.5 border border-amber-200 dark:border-amber-700"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {item.nomeSnapshot}
                  </p>
                  <p className="text-xs text-slate-500">{item.setor}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    {item.quantidadeSeparada} / {item.quantidadePlanejada}
                  </p>
                  <p className="text-xs text-amber-600">
                    Faltam {item.quantidadePlanejada - item.quantidadeSeparada}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setPendingModal(false)}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium"
          >
            Entendido — continuar separando
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
    </div>
  );
}
