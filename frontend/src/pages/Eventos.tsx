import { useEffect, useState } from 'react';
import { Calendar, Plus, Users as UsersIcon, Edit3, CheckCircle, CheckCircle2, XCircle, Ban, Copy, ChevronDown, ChevronUp, PackageCheck, RotateCcw, ClipboardList, X, AlertCircle } from 'lucide-react';
import { eventApi, checklistApi, checklistItemApi, equipmentApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import StatusBadge from '../components/StatusBadge';
import EquipmentSearch from '../components/EquipmentSearch';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';

interface EventTeam {
  id: number;
  nome: string;
  funcao: string;
}

interface ChecklistItemData {
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

interface ChecklistData {
  id: number;
  nome: string;
  status: string;
  items: ChecklistItemData[];
}

interface ChecklistOption {
  id: number;
  nome: string;
  status: string;
  eventId?: number;
}

interface EventItem {
  id: number;
  nome: string;
  cliente: string;
  local: string;
  dataInicio: string;
  dataFim: string;
  observacoes: string;
  status: 'ativo' | 'finalizado' | 'cancelado';
  finalizadoEm?: string;
  finalizadoPor?: string;
  checklists: ChecklistData[];
  equipe: EventTeam[];
}

interface EquipmentOption {
  id: number;
  nome: string;
  descricao: string;
  quantidadeDisponivel: number;
  quantidadeTotal: number;
  origem: string;
}

function QuantityStepper({ value, onChange, min = 0, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center">âˆ’</button>
      <span className="text-xl font-bold text-slate-800 dark:text-white w-10 text-center">{value}</span>
      <button type="button" onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center">+</button>
    </div>
  );
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
  const [confirmCancelar, setConfirmCancelar] = useState<EventItem | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { eventId: paramEventId } = useParams();

  // Checklist dentro da tela do Evento (Tela Unica)
  const [modalChecklist, setModalChecklist] = useState(false);
  const [checklistModal, setChecklistModal] = useState<ChecklistData | null>(null);
  const [checklistParentEventId, setChecklistParentEventId] = useState<number | null>(null);
  const [equipments, setEquipments] = useState<EquipmentOption[]>([]);
  const [modalAddItem, setModalAddItem] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [setor, setSetor] = useState('som');
  const [editQtyItem, setEditQtyItem] = useState<ChecklistItemData | null>(null);
  const [editQtyValue, setEditQtyValue] = useState(1);
  const [modalCreateChecklist, setModalCreateChecklist] = useState(false);
  const [newChecklistNome, setNewChecklistNome] = useState('');
  const [createChecklistForEventId, setCreateChecklistForEventId] = useState<number | null>(null);

  // Separation modal
  const [separateModal, setSeparateModal] = useState<ChecklistItemData | null>(null);
  const [separateQty, setSeparateQty] = useState(1);

  // Return modal
  const [returnModal, setReturnModal] = useState<ChecklistItemData | null>(null);
  const [returnConditions, setReturnConditions] = useState<{ ok: number; quebrado: number; perdido: number }>({ ok: 0, quebrado: 0, perdido: 0 });

  // Edit return composition
  const [editReturnModal, setEditReturnModal] = useState<ChecklistItemData | null>(null);
  const [editReturnConditions, setEditReturnConditions] = useState<{ ok: number; quebrado: number; perdido: number }>({ ok: 0, quebrado: 0, perdido: 0 });

  // Confirm remove item
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<number | null>(null);

  // Rename after clone
  const [renameModal, setRenameModal] = useState<{ id: number; nome: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [lowStockNames, setLowStockNames] = useState<string[]>([]);

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

  // Deep-link: auto-open event checklist when navigating to /eventos/:eventId
  useEffect(() => {
    if (paramEventId && events.length > 0) {
      const targetEvent = events.find((ev) => ev.id === Number(paramEventId));
      if (targetEvent && targetEvent.checklists?.length > 0) {
        openChecklistModal(targetEvent.checklists[0].id);
      }
    }
  }, [paramEventId, events]);

  async function openChecklistModal(checklistId: number, eventId?: number) {
    try {
      const [clRes, eqRes] = await Promise.all([
        checklistApi.getOne(checklistId),
        equipmentApi.getAll(),
      ]);
      setChecklistModal(clRes.data);
      setEquipments(eqRes.data);
      setChecklistParentEventId(eventId ?? null);
      setModalChecklist(true);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao abrir checklist');
    }
  }

  async function refreshChecklistModal() {
    if (!checklistModal) return;
    const r = await checklistApi.getOne(checklistModal.id);
    setChecklistModal(r.data);
    await load();
  }

  async function handleAddItemToChecklist(e: React.FormEvent) {
    e.preventDefault();
    if (!checklistModal) return;
    try {
      await checklistItemApi.create({
        checklistId: checklistModal.id,
        equipmentId: Number(selectedEquipment),
        quantidadePlanejada: quantidade,
        setor,
      });
      addToast('success', 'Item adicionado');
      setModalAddItem(false);
      setSelectedEquipment('');
      setQuantidade(1);
      setSetor('som');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao adicionar item');
    }
  }

  async function handleRemoveItemFromChecklist(itemId: number) {
    try {
      await checklistItemApi.remove(itemId);
      addToast('success', 'Item removido');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover item');
    }
  }

  async function handleUpdatePlannedQty() {
    if (!editQtyItem) return;
    try {
      await checklistItemApi.update(editQtyItem.id, editQtyValue);
      addToast('success', 'Quantidade atualizada');
      setEditQtyItem(null);
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao atualizar quantidade');
    }
  }

  async function handleBaixarChecklist(checklistId: number) {
    try {
      const r = await checklistApi.getOne(checklistId);
      const cl = r.data as ChecklistData;
      const linhas = [
        ['Checklist', cl.nome],
        ['Status', cl.status],
        [],
        ['Equipamento', 'Setor', 'Planejado', 'Separado', 'Devolvido', 'OK', 'Quebrado', 'Perdido'],
        ...(cl.items ?? []).map((i) => [
          i.nomeSnapshot,
          i.setor,
          String(i.quantidadePlanejada ?? 0),
          String(i.quantidadeSeparada ?? 0),
          String(i.quantidadeDevolvida ?? 0),
          String(i.quantidadeOk ?? 0),
          String(i.quantidadeQuebrada ?? 0),
          String(i.quantidadePerdida ?? 0),
        ]),
      ]
        .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\n');

      const blob = new Blob([linhas], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checklist-${cl.id}-${cl.nome}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast('success', 'Checklist baixado (CSV)');
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao baixar checklist');
    }
  }

  // === Checklist actions directly inside the event card ===

  async function handleLiberarChecklist() {
    if (!checklistModal) return;
    try {
      await checklistApi.liberar(checklistModal.id);
      addToast('success', 'Checklist liberado! Estoque reservado.');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao liberar checklist');
    }
  }

  async function handleCancelarChecklist() {
    if (!checklistModal) return;
    try {
      await checklistApi.cancelar(checklistModal.id, 'Cancelado via card do evento');
      addToast('success', 'Checklist cancelado. Estoque restaurado.');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao cancelar checklist');
    }
  }

  async function handleClonarChecklist() {
    if (!checklistModal) return;
    try {
      const res = await checklistApi.clonar(checklistModal.id);
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
        // Open the cloned checklist
        const clRes = await checklistApi.getOne(novoId);
        setChecklistModal(clRes.data);
      }
      addToast('success', 'Checklist clonado (rascunho). Voce pode renomear agora.');
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao clonar checklist');
    }
  }

  async function handleReativarChecklist() {
    if (!checklistModal) return;
    try {
      await checklistApi.reativar(checklistModal.id);
      addToast('success', 'Checklist reativado');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao reativar checklist');
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
      await refreshChecklistModal();
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao renomear checklist');
    }
  }

  // Separation handler
  async function handleSeparar() {
    if (!separateModal) return;
    try {
      const res = await checklistItemApi.separar(separateModal.id, separateQty);
      addToast('success', res.data.aviso || 'Item separado com sucesso');
      if (res.data.alerta) addToast('warning', res.data.alerta);
      setSeparateModal(null);
      setSeparateQty(1);
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao separar');
    }
  }

  // Return handler
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
      for (const [situacao, qty] of Object.entries(returnConditions) as ['ok' | 'quebrado' | 'perdido', number][]) {
        if (qty > 0) {
          await checklistItemApi.devolver(returnModal.id, qty, situacao);
        }
      }
      addToast('success', 'Devolucao registrada com sucesso');
      setReturnModal(null);
      setReturnConditions({ ok: 0, quebrado: 0, perdido: 0 });
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao devolver');
    }
  }

  // Edit return composition handler
  async function handleEditarDevolucao() {
    if (!editReturnModal) return;
    const totalAnterior = (editReturnModal.quantidadeOk ?? 0) + (editReturnModal.quantidadeQuebrada ?? 0) + (editReturnModal.quantidadePerdida ?? 0);
    const totalNovo = editReturnConditions.ok + editReturnConditions.quebrado + editReturnConditions.perdido;
    if (totalNovo !== totalAnterior) {
      addToast('error', `O total devolvido deve permanecer ${totalAnterior}.`);
      return;
    }
    try {
      await checklistItemApi.editarDevolucao(
        editReturnModal.id,
        editReturnConditions.ok,
        editReturnConditions.quebrado,
        editReturnConditions.perdido,
      );
      addToast('success', 'Devolucao editada (estoque/ocorrencias atualizados)');
      setEditReturnModal(null);
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao editar devolucao');
    }
  }

  // Confirm remove item handler
  async function handleConfirmRemoveItem() {
    if (!confirmRemoveItem) return;
    try {
      await checklistItemApi.remove(confirmRemoveItem);
      setConfirmRemoveItem(null);
      addToast('success', 'Item removido');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover');
    }
  }

  // Role-based checklist permissions
  const canSeparate = !isAdmin && checklistModal?.status === 'liberado';
  const canReturn = ['em_evento', 'pendente_devolucao', 'concluido'].includes(checklistModal?.status ?? '');
  const canEditPlanned = isAdmin && ['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'].includes(checklistModal?.status ?? '') && checklistModal?.status !== 'cancelado';

  // Return progress
  const totalSeparados = (checklistModal?.items ?? []).reduce((s, i) => s + i.quantidadeSeparada, 0);
  const totalDevolvidos = (checklistModal?.items ?? []).reduce((s, i) => s + i.quantidadeDevolvida, 0);
  const returnProgress = totalSeparados > 0 ? Math.round((totalDevolvidos / totalSeparados) * 100) : 0;
  const pendingReturnItems = (checklistModal?.items ?? []).filter((i) => i.quantidadeDevolvida < i.quantidadeSeparada);
  const pendingItems = (checklistModal?.items ?? []).filter((i) => i.quantidadeSeparada < i.quantidadePlanejada);

  async function handleCreateChecklist(e: React.FormEvent) {
    e.preventDefault();
    if (!createChecklistForEventId || !newChecklistNome.trim()) return;
    try {
      await checklistApi.create(newChecklistNome, createChecklistForEventId);
      addToast('success', `Checklist "${newChecklistNome}" criado`);
      setModalCreateChecklist(false);
      setNewChecklistNome('');
      setCreateChecklistForEventId(null);
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao criar checklist');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!validateDates(dataInicio, dataFim)) {
        addToast('error', 'Data de inicio deve ser anterior a data de fim');
        return;
      }
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

  async function handleCancelar() {
    if (!confirmCancelar || !motivoCancelamento.trim()) return;
    try {
      await eventApi.cancelar(confirmCancelar.id, motivoCancelamento);
      setConfirmCancelar(null);
      setMotivoCancelamento('');
      addToast('success', `Evento "${confirmCancelar.nome}" cancelado`);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao cancelar evento');
      setConfirmCancelar(null);
    }
  }

  function validateDates(inicio: string, fim: string): boolean {
    if (!inicio || !fim) return true;
    return new Date(inicio) <= new Date(fim);
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
      if (!validateDates(editDataInicio, editDataFim)) {
        addToast('error', 'Data de inicio deve ser anterior a data de fim');
        return;
      }
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

  async function handleClonarEvento(ev: EventItem) {
    try {
      const res = await eventApi.clonar(ev.id);
      const result = res.data as { evento: EventItem; alertasEstoque: { equipmentId: number; nome: string; disponivel: number; solicitado: number; checklistNome: string }[] };
      const novo = result.evento;
      const alertas = result.alertasEstoque ?? [];

      if (alertas.length > 0) {
        const nomes = alertas.map((a) => `${a.nome} (disp: ${a.disponivel}, sol: ${a.solicitado})`).join(', ');
        addToast('warning', `Evento clonado: "${novo?.nome}". âš ï¸ Itens com estoque insuficiente: ${nomes}. Ajuste antes de liberar.`);
      } else {
        addToast('success', `Evento clonado: "${novo?.nome ?? 'copia'}"`);
      }
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao clonar evento');
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
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
                      âœ" Finalizado
                    </span>
                  ) : ev.status === 'cancelado' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
                      âœ• Cancelado
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                      Em andamento
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{ev.cliente}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0 ml-2">
                {isAdmin && ev.status === 'ativo' && (
                  <>
                    <button
                      onClick={() => openEdit(ev)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      title="Editar evento"
                    >
                      <Edit3 size={13} /> Editar
                    </button>
                    <button
                      onClick={() => handleClonarEvento(ev)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                      title="Clonar evento (inclui checklists e equipe)"
                    >
                      <Copy size={13} /> Clonar
                    </button>
                    <button
                      onClick={() => { setConfirmCancelar(ev); setMotivoCancelamento(''); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      title="Cancelar evento"
                    >
                      <Ban size={13} /> Cancelar
                    </button>
                  </>
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
              <p>{ev.local}</p>
              <p>
                {new Date(ev.dataInicio).toLocaleDateString('pt-BR')} -{' '}
                {new Date(ev.dataFim).toLocaleDateString('pt-BR')}
              </p>
              {ev.checklists?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {ev.checklists.map((cl) => (
                    <div key={cl.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs flex items-center gap-1 truncate">
                          <ClipboardList size={11} className="flex-shrink-0" /> <span className="truncate">{cl.nome}</span>
                          <span className={`ml-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                            cl.status === 'concluido' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' :
                            cl.status === 'liberado' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' :
                            cl.status === 'em_evento' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' :
                            cl.status === 'cancelado' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                          }`}>{cl.status}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => openChecklistModal(cl.id, ev.id)}
                          className="text-xs px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors font-medium"
                          title="Visualizar / editar checklist"
                        >
                          Abrir
                        </button>
                        {cl.status === 'rascunho' && isAdmin && (
                          <button
                            type="button"
                            onClick={() => openChecklistModal(cl.id, ev.id)}
                            className="text-xs px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-medium"
                            title="Abrir para liberar"
                          >
                            Liberar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Novo Checklist button on the event card */}
              {isAdmin && ev.status === 'ativo' && (
                <button
                  type="button"
                  onClick={() => { setCreateChecklistForEventId(ev.id); setNewChecklistNome(`Checklist ${ev.nome}`); setModalCreateChecklist(true); }}
                  className="mt-2 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors font-medium"
                >
                  <ClipboardList size={13} /> Novo Checklist
                </button>
              )}
              {ev.equipe?.length > 0 && (
                <p className="text-xs"><UsersIcon size={11} className="inline mr-0.5" /> {ev.equipe.length} membro(s) na equipe</p>
              )}
              {ev.finalizadoPor && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={11} className="inline mr-0.5" /> Finalizado por {ev.finalizadoPor}
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
                Aguardando conclusao dos checklists
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
              placeholder="Ex: Festival de Verao 2025"
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
                Data Inicio
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
              Observacoes
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
        title={`Editar Evento â€" ${selectedEvent?.nome ?? ''}`}
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Inicio</label>
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observacoes</label>
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
            Salvar Alteracoes
          </button>
        </form>
      </Modal>

      {/* Finalization Confirm Modal */}
      <ConfirmModal
        open={confirmFinalizar !== null}
        onClose={() => setConfirmFinalizar(null)}
        onConfirm={handleFinalizar}
        title="Finalizar Evento"
        message={`Deseja finalizar o evento "${confirmFinalizar?.nome}"? Esta acao e irreversivel e indica que todos os equipamentos foram devolvidos e o evento foi concluido.`}
        confirmLabel="Finalizar"
        type="success"
      />

      {/* Cancel Event Modal */}
      <Modal
        open={confirmCancelar !== null}
        onClose={() => setConfirmCancelar(null)}
        title={`Cancelar Evento â€" ${confirmCancelar?.nome ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Esta acao ira cancelar o evento e reverter todas as reservas de estoque ativas.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Motivo do Cancelamento *
            </label>
            <textarea
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-red-500/20 text-sm"
              rows={3}
              placeholder="Descreva o motivo do cancelamento..."
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              required
            />
          </div>
          <button
            onClick={handleCancelar}
            disabled={!motivoCancelamento.trim()}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Confirmar Cancelamento
          </button>
        </div>
      </Modal>

      {/* Team Modal */}
      <Modal
        open={modalTeam}
        onClose={() => setModalTeam(false)}
        title={`Equipe â€" ${selectedEvent?.nome ?? ''}`}
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
                <option value="operacao">Operacao</option>
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

      {/* Checklist Modal (Evento + Checklist na mesma tela) */}
      <Modal
        open={modalChecklist}
        onClose={() => {
          setModalChecklist(false);
          setChecklistModal(null);
          setEquipments([]);
        }}
        title={`Checklist â€" ${checklistModal?.nome ?? ''}`}
        maxWidth="max-w-5xl"
      >
        {checklistModal && (
          <div className="space-y-4">
            {/* Action Toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={checklistModal.status} />
                <button
                  type="button"
                  onClick={() => handleBaixarChecklist(checklistModal.id)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  Baixar CSV
                </button>
                {isAdmin && checklistModal.status === 'rascunho' && (checklistModal.items?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleLiberarChecklist}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors font-medium"
                  >
                    âœ" Liberar Checklist
                  </button>
                )}
                {isAdmin && ['liberado', 'em_evento', 'pendente_devolucao'].includes(checklistModal.status) && (
                  <button
                    type="button"
                    onClick={handleCancelarChecklist}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors font-medium"
                  >
                    âœ• Cancelar
                  </button>
                )}
                {isAdmin && checklistModal.status === 'cancelado' && (
                  <button
                    type="button"
                    onClick={handleReativarChecklist}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors font-medium"
                  >
                    <RotateCcw size={13} className="inline mr-1" />Reativar
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleClonarChecklist}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors font-medium"
                  >
                    <Copy size={13} className="inline mr-1" />Clonar
                  </button>
                )}
              </div>

              {isAdmin && ['rascunho', 'liberado'].includes(checklistModal.status) && (
                <button
                  type="button"
                  onClick={() => setModalAddItem(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors font-medium"
                >
                  + Adicionar item
                </button>
              )}
            </div>

            {/* Return progress panel */}
            {['em_evento', 'pendente_devolucao'].includes(checklistModal.status) && totalSeparados > 0 && (
              <div className={`rounded-xl border p-4 ${
                pendingReturnItems.length > 0
                  ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-semibold ${
                    pendingReturnItems.length > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
                  }`}>
                    <PackageCheck size={14} className="inline mr-1" />Progresso de Devolucao
                  </h4>
                  <span className={`text-sm font-bold ${
                    pendingReturnItems.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'
                  }`}>
                    {totalDevolvidos} / {totalSeparados}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-2">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-700 ${returnProgress === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    style={{ width: `${returnProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Separation progress for employee */}
            {!isAdmin && checklistModal.status === 'liberado' && pendingItems.length > 0 && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1.5 flex items-center gap-1.5">
                  <PackageCheck size={14} /> Itens a Separar
                </h4>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {(checklistModal.items ?? []).filter(i => i.quantidadeSeparada >= i.quantidadePlanejada).length} / {(checklistModal.items ?? []).length} itens completamente separados
                </p>
              </div>
            )}

            {/* Full Items table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300">Equipamento</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 whitespace-nowrap">Plan.</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 whitespace-nowrap">Sep.</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 whitespace-nowrap">Devol.</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 whitespace-nowrap">OK/Qb/Pd</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300">Status</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {(checklistModal.items ?? []).map((item) => {
                    const fullySeparated = item.quantidadeSeparada >= item.quantidadePlanejada;
                    const fullyReturned = item.quantidadeDevolvida >= item.quantidadeSeparada && item.quantidadeSeparada > 0;
                    const isPending = !isAdmin && ['em_evento', 'pendente_devolucao'].includes(checklistModal.status) && item.quantidadeDevolvida < item.quantidadeSeparada;
                    const isLowStockCloned = lowStockNames.includes(item.nomeSnapshot);

                    return (
                      <tr
                        key={item.id}
                        className={
                          isPending ? 'bg-red-50 dark:bg-red-900/10'
                          : isLowStockCloned ? 'bg-red-50/60 dark:bg-red-900/20'
                          : ''
                        }
                      >
                        <td className="px-3 py-2">
                          <p className={isLowStockCloned ? 'font-medium text-red-700 dark:text-red-300' : 'font-medium text-slate-700 dark:text-slate-200'}>
                            {item.nomeSnapshot}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{item.setor}</p>
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-200">{item.quantidadePlanejada}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={fullySeparated ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}>
                            {item.quantidadeSeparada}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={fullyReturned ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}>
                            {item.quantidadeDevolvida}
                            {item.quantidadeSeparada > 0 && !fullyReturned && item.quantidadeDevolvida > 0 && (
                              <span className="text-red-500 ml-1 text-xs">(-{item.quantidadeSeparada - item.quantidadeDevolvida})</span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex gap-0.5 justify-center text-xs">
                            {(item.quantidadeOk ?? 0) > 0 && (
                              <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">{item.quantidadeOk}âœ"</span>
                            )}
                            {(item.quantidadeQuebrada ?? 0) > 0 && (
                              <span className="bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">{item.quantidadeQuebrada}âœ•</span>
                            )}
                            {(item.quantidadePerdida ?? 0) > 0 && (
                              <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">{item.quantidadePerdida}?</span>
                            )}
                            {(item.quantidadeOk ?? 0) === 0 && (item.quantidadeQuebrada ?? 0) === 0 && (item.quantidadePerdida ?? 0) === 0 && (
                              <span className="text-slate-400">â€"</span>
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
                                  setSeparateQty(Math.max(1, item.quantidadePlanejada - item.quantidadeSeparada));
                                }}
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
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
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                              >
                                <RotateCcw size={11} className="inline mr-0.5" />Devolver
                              </button>
                            )}
                            {canReturn && item.quantidadeDevolvida > 0 && (
                              <button
                                onClick={() => {
                                  setEditReturnModal(item);
                                  setEditReturnConditions({
                                    ok: item.quantidadeOk ?? 0,
                                    quebrado: item.quantidadeQuebrada ?? 0,
                                    perdido: item.quantidadePerdida ?? 0,
                                  });
                                }}
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                              >
                                Editar Devolucao
                              </button>
                            )}
                            {canEditPlanned && (
                              <button
                                onClick={() => { setEditQtyItem(item); setEditQtyValue(item.quantidadePlanejada); }}
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                              >
                                Editar qtd
                              </button>
                            )}
                            {isAdmin && ['rascunho', 'liberado'].includes(checklistModal.status) && (
                              <button
                                onClick={() => setConfirmRemoveItem(item.id)}
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
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
              {(!checklistModal.items || checklistModal.items.length === 0) && (
                <div className="p-6 text-center text-slate-400 text-sm">Nenhum item neste checklist</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Add item */}
      <Modal
        open={modalAddItem}
        onClose={() => { setModalAddItem(false); setSelectedEquipment(''); setQuantidade(1); setSetor('som'); }}
        title="Adicionar item ao checklist"
      >
        <form onSubmit={handleAddItemToChecklist} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Equipamento</label>
            <EquipmentSearch equipments={equipments} value={selectedEquipment} onChange={setSelectedEquipment} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantidade</label>
              <div className="flex justify-center py-2">
                <QuantityStepper value={quantidade} onChange={setQuantidade} min={1} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Setor</label>
              <select
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
              >
                <option value="som">Som</option>
                <option value="luz">Luz</option>
                <option value="video">Video</option>
                <option value="estrutura">Estrutura</option>
                <option value="comunicacao">Comunicacao</option>
                <option value="outros">Outros</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={!selectedEquipment}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Adicionar item
          </button>
        </form>
      </Modal>

      {/* Edit quantity */}
      <Modal
        open={editQtyItem !== null}
        onClose={() => setEditQtyItem(null)}
        title={`Editar quantidade â€" ${editQtyItem?.nomeSnapshot ?? ''}`}
      >
        {editQtyItem && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ajuste a quantidade planejada. Se o checklist estiver liberado (ou alem), o sistema ajusta o estoque automaticamente.
            </p>
            <div className="flex justify-center py-2">
              <QuantityStepper value={editQtyValue} onChange={setEditQtyValue} min={1} />
            </div>
            <button
              type="button"
              onClick={handleUpdatePlannedQty}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Salvar quantidade
            </button>
          </div>
        )}
      </Modal>

      {/* Separation Modal â€" stepper + progress */}
      <Modal
        open={separateModal !== null}
        onClose={() => { setSeparateModal(null); setSeparateQty(1); }}
        title={`Separar â€" ${separateModal?.nomeSnapshot ?? ''}`}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Planejado', value: separateModal?.quantidadePlanejada ?? 0, color: 'text-slate-700 dark:text-slate-200' },
              { label: 'Ja separado', value: separateModal?.quantidadeSeparada ?? 0, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Restante', value: (separateModal?.quantidadePlanejada ?? 0) - (separateModal?.quantidadeSeparada ?? 0), color: 'text-amber-600 dark:text-amber-400 font-bold' },
            ].map((stat) => (
              <div key={stat.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
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
            Confirmar Separacao de {separateQty} unidade(s)
          </button>
        </div>
      </Modal>

      {/* Return Modal â€" segmented conditions */}
      <Modal
        open={returnModal !== null}
        onClose={() => { setReturnModal(null); setReturnConditions({ ok: 0, quebrado: 0, perdido: 0 }); }}
        title={`Devolver â€" ${returnModal?.nomeSnapshot ?? ''}`}
      >
        {returnModal && (() => {
          const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
          const totalReturn = returnConditions.ok + returnConditions.quebrado + returnConditions.perdido;
          const isValid = totalReturn > 0 && totalReturn <= remaining;

          return (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Separado', value: returnModal.quantidadeSeparada, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Ja devolvido', value: returnModal.quantidadeDevolvida, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Aguardando', value: remaining, color: 'text-amber-600 dark:text-amber-400 font-bold' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400 text-center">Selecione a quantidade por condicao:</p>

              <div className="space-y-3">
                {[
                  { key: 'ok' as const, label: 'âœ" OK â€" Em bom estado', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10' },
                  { key: 'quebrado' as const, label: 'âœ• Quebrado â€" Com dano', color: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10' },
                  { key: 'perdido' as const, label: '? Perdido â€" Nao encontrado', color: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`flex items-center justify-between rounded-xl border p-3 ${color}`}>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                    <QuantityStepper
                      value={returnConditions[key]}
                      onChange={(v) => setReturnConditions((prev) => ({ ...prev, [key]: v }))}
                      min={0}
                      max={remaining - totalReturn + returnConditions[key]}
                    />
                  </div>
                ))}
              </div>

              <div className={`text-center py-2 rounded-xl text-sm font-medium ${
                totalReturn === 0
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  : totalReturn > remaining
                    ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              }`}>
                Total a devolver: <strong>{totalReturn}</strong> / {remaining} restante(s)
              </div>

              <button
                onClick={handleDevolver}
                disabled={!isValid}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Confirmar Devolucao
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Edit return composition modal */}
      <Modal
        open={editReturnModal !== null}
        onClose={() => { setEditReturnModal(null); setEditReturnConditions({ ok: 0, quebrado: 0, perdido: 0 }); }}
        title={`Editar devolucao â€" ${editReturnModal?.nomeSnapshot ?? ''}`}
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
                  Ao remover "Dano" ou "Perda", a ocorrencia vinculada sera anulada e a quantidade retorna ao saldo disponivel.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'ok' as const, label: 'âœ" OK', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10' },
                  { key: 'quebrado' as const, label: 'âœ• Quebrado (Dano)', color: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10' },
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
                Salvar edicao da devolucao
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Confirm Remove Item */}
      <ConfirmModal
        open={confirmRemoveItem !== null}
        onClose={() => setConfirmRemoveItem(null)}
        onConfirm={handleConfirmRemoveItem}
        title="Remover Item"
        message="Deseja remover este item do checklist?"
        confirmLabel="Remover"
        type="danger"
      />

      {/* Rename cloned checklist */}
      <Modal
        open={renameModal !== null}
        onClose={() => { setRenameModal(null); setRenameValue(''); }}
        title={`Renomear Checklist â€" ${renameModal?.nome ?? ''}`}
      >
        <form onSubmit={handleRenameChecklist} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome/Titulo
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              required
              autoFocus
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

      {/* Create Checklist Modal */}
      <Modal
        open={modalCreateChecklist}
        onClose={() => { setModalCreateChecklist(false); setNewChecklistNome(''); setCreateChecklistForEventId(null); }}
        title="Novo Checklist"
      >
        <form onSubmit={handleCreateChecklist} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome do Checklist
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={newChecklistNome}
              onChange={(e) => setNewChecklistNome(e.target.value)}
              required
              placeholder="Ex: Checklist Palco Principal"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!newChecklistNome.trim()}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Criar Checklist
          </button>
        </form>
      </Modal>
    </div>
  );
}
