import { useEffect, useRef, useState } from 'react';
import { Calendar, Plus, Users as UsersIcon, Edit3, CheckCircle, CheckCircle2, XCircle, Ban, Copy, ChevronDown, ChevronUp, PackageCheck, RotateCcw, ClipboardList, X, AlertCircle, Search, Trash2, Archive } from 'lucide-react';
import { eventApi, checklistApi, checklistItemApi, equipmentApi } from '../services/api';

import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import StatusBadge from '../components/StatusBadge';
import EquipmentSearch from '../components/EquipmentSearch';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';
import Pagination from '../components/Pagination';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

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
  observacaoDevolucao?: string;
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
  canceladoEm?: string;
  canceladoPor?: string;
  checklists: ChecklistData[];
  equipe: EventTeam[];
  arquivado?: boolean;
  foiFinalizadoPreviamente?: boolean;
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
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
      >
        -
      </button>
      <span className="text-xl font-bold text-slate-800 dark:text-white w-10 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        disabled={max !== undefined && value >= max}
        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
      >
        +
      </button>
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
  const autoOpenedRef = useRef<string | null>(null);

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
  const [editQtyMax, setEditQtyMax] = useState(999);
  const [modalCreateChecklist, setModalCreateChecklist] = useState(false);
  const [newChecklistNome, setNewChecklistNome] = useState('');
  const [createChecklistForEventId, setCreateChecklistForEventId] = useState<number | null>(null);

  // Separation modal
  const [separateModal, setSeparateModal] = useState<ChecklistItemData | null>(null);
  const [separateQty, setSeparateQty] = useState(1);

  // Return modal - mixed return (OK + Damaged + Lost per item)
  const [returnModal, setReturnModal] = useState<ChecklistItemData | null>(null);
  const [returnOk, setReturnOk] = useState(0);
  const [returnDanificado, setReturnDanificado] = useState(0);
  const [returnPerdido, setReturnPerdido] = useState(0);
  const [returnObservation, setReturnObservation] = useState('');

  // Batch approval confirmation
  const [confirmBatchApproval, setConfirmBatchApproval] = useState(false);

  // Confirm remove item
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<number | null>(null);
  const [confirmExcluirChecklist, setConfirmExcluirChecklist] = useState<{ id: number; nome: string } | null>(null);

  // Rename after clone
  const [renameModal, setRenameModal] = useState<{ id: number; nome: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [lowStockNames, setLowStockNames] = useState<string[]>([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchFilter, setSearchFilter] = useState('');

  const [showArchived, setShowArchived] = useState(false);
  const [trashStatusFilter, setTrashStatusFilter] = useState<'' | 'finalizado' | 'cancelado'>('');
  const [confirmArchive, setConfirmArchive] = useState<EventItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [confirmBulkExcluir, setConfirmBulkExcluir] = useState(false);
  const [confirmBulkArquivar, setConfirmBulkArquivar] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState<EventItem | null>(null);

  // Create form
  const [nome, setNome] = useState('');
  const [cliente, setCliente] = useState('');
  const [local, setLocal] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [observacoes, setObservacoes] = useState('');


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

  async function load() {
    try {
      const [evRes, clRes] = await Promise.all([
        eventApi.getAll({ page, limit, arquivados: showArchived }),
        checklistApi.getAll({ page: 1, limit: 1000 }),
      ]);
      setEvents(evRes.data.data);
      setTotal(evRes.data.total);
      setSelectedIds([]); // Clear selection on load
      setTotalPages(evRes.data.totalPages);
      setChecklists(clRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, limit, showArchived]);

  useAutoRefresh(() => {
    load();
    if (modalChecklist && checklistModal) refreshChecklistModal();
  });

  // Deep-link: auto-open event checklist when navigating to /eventos/:eventId
  useEffect(() => {
    // Só dispara UMA VEZ por paramEventId para evitar loop infinito
    if (paramEventId && events.length > 0 && autoOpenedRef.current !== paramEventId) {
      const targetEvent = events.find((ev) => ev.id === Number(paramEventId));
      if (targetEvent && targetEvent.checklists?.length > 0) {
        autoOpenedRef.current = paramEventId;
        openChecklistModal(targetEvent.checklists[0].id);
      }
    }
  }, [paramEventId, events]);

  async function openChecklistModal(checklistId: number, eventId?: number) {
    try {
      const [clRes, eqRes] = await Promise.all([
        checklistApi.getOne(checklistId),
        equipmentApi.getAll({ page: 1, limit: 1000 }),
      ]);
      setChecklistModal(clRes.data);
      setEquipments(eqRes.data.data);
      setChecklistParentEventId(eventId ?? null);
      setModalChecklist(true);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao abrir o checklist.');
    }
  }

  async function refreshChecklistModal() {
    if (!checklistModal) return;
    try {
      const [clRes, eqRes] = await Promise.all([
        checklistApi.getOne(checklistModal.id),
        equipmentApi.getAll({ page: 1, limit: 1000 }),
      ]);
      setChecklistModal(clRes.data);
      setEquipments(eqRes.data.data);
    } catch (err: any) {
      console.error('Erro ao atualizar checklist:', err);
    }
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
      addToast('success', 'Item adicionado ao checklist com sucesso.');
      setModalAddItem(false);
      setSelectedEquipment('');
      setQuantidade(1);
      setSetor('som');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao adicionar o item.');
    }
  }

  async function handleRemoveItemFromChecklist(itemId: number) {
    try {
      await checklistItemApi.remove(itemId);
      addToast('success', 'Item removido do checklist.');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover o item.');
    }
  }

  async function handleUpdatePlannedQty() {
    if (!editQtyItem) return;
    try {
      await checklistItemApi.update(editQtyItem.id, editQtyValue);
      addToast('success', 'Quantidade atualizada com sucesso.');
      setEditQtyItem(null);
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao atualizar a quantidade.');
    }
  }



  // === Checklist actions directly inside the event card ===

  async function handleLiberarEvento(ev: EventItem) {
    try {
      await eventApi.liberar(ev.id);
      addToast('success', `Evento "${ev.nome}" liberado! Checklist disponível para a equipe.`);
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao liberar o evento.');
    }
  }

  async function handleReativarEvento(ev: EventItem) {
    if (!isAdmin) return;
    try {
      await eventApi.reativar(ev.id);
      addToast('success', `Evento "${ev.nome}" reativado. Checklist voltou para rascunho.`);
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao reativar o evento.');
    }
  }

  async function handleReativarChecklist() {
    if (!checklistModal) return;
    try {
      await checklistApi.reativar(checklistModal.id);
      addToast('success', 'Checklist reativado com sucesso.');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao reativar o checklist.');
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
      addToast('error', err.response?.data?.message || 'Erro ao registrar a separação.');
    }
  }

  // Return handler - MIXED: OK + Damaged + Lost per item
  async function handleDevolver() {
    if (!returnModal) return;
    const totalReturn = returnOk + returnDanificado + returnPerdido;
    if (totalReturn <= 0) {
      addToast('error', 'Informe pelo menos uma quantidade para devolver.');
      return;
    }
    const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
    if (totalReturn > remaining) {
      addToast('error', `A quantidade total informada (${totalReturn}) excede o restante disponível (${remaining}).`);
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
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao registrar a devolução.');
    }
  }

  // Batch approve all pending occurrences
  async function handleAprovarTodos() {
    if (!checklistModal) return;
    try {
      const res = await checklistItemApi.aprovarTodos(checklistModal.id);
      addToast('success', res.data?.mensagem || 'Ocorrências confirmadas com sucesso.');
      setConfirmBatchApproval(false);
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao aprovar as ocorrências em lote.');
    }
  }

  // Excluir checklist handler (apenas rascunho)
  async function handleExcluirChecklist() {
    if (!confirmExcluirChecklist) return;
    try {
      const res = await checklistApi.excluir(confirmExcluirChecklist.id);
      addToast('success', res.data?.message || 'Checklist excluído com sucesso.');
      setConfirmExcluirChecklist(null);
      // Se o modal do checklist excluído está aberto, fecha
      if (checklistModal?.id === confirmExcluirChecklist.id) {
        setModalChecklist(false);
        setChecklistModal(null);
      }
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao excluir o checklist.');
    }
  }

  // Confirm remove item handler
  async function handleConfirmRemoveItem() {
    if (!confirmRemoveItem) return;
    try {
      await checklistItemApi.remove(confirmRemoveItem);
      setConfirmRemoveItem(null);
      addToast('success', 'Item removido do checklist.');
      await refreshChecklistModal();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover o item.');
    }
  }

  // Role-based checklist permissions
  const canSeparate = !isAdmin && ['liberado', 'em_evento', 'pendente_devolucao'].includes(checklistModal?.status ?? '');
  // 🔴 Employee can return items ONLY when ALL items are fully separated
  const allItemsSeparated = (checklistModal?.items ?? []).every(
    (i: ChecklistItemData) => i.quantidadeSeparada >= i.quantidadePlanejada
  );
  const canEmployeeReturn = !isAdmin && allItemsSeparated && ['em_evento', 'pendente_devolucao'].includes(checklistModal?.status ?? '');
  // 🔴 Planned quantity is IMMUTABLE during return phase (unless it's increased while not complete)
  const canEditPlanned = isAdmin && ['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'].includes(checklistModal?.status ?? '') && checklistModal?.status !== 'cancelado';

  // Count pending items for batch approval panel
  const pendingApprovalItems = (checklistModal?.items ?? []).filter((i) => i.statusDevolucao === 'aguardando_confirmacao');

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
      addToast('success', `Checklist "${newChecklistNome}" criado com sucesso.`);
      setModalCreateChecklist(false);
      setNewChecklistNome('');
      setCreateChecklistForEventId(null);
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao criar o checklist.');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!validateDates(dataInicio, dataFim)) {
        addToast('error', 'A data de início deve ser anterior ou igual à data de fim.');
        return;
      }
      await eventApi.create({
        nome,
        cliente,
        local,
        dataInicio,
        dataFim,
        observacoes,

      });
      setModalCreate(false);
      resetForm();
      addToast('success', 'Evento criado com sucesso');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao criar o evento.');
    }
  }

  async function handleCancelar() {
    if (!confirmCancelar || !motivoCancelamento.trim()) return;
    try {
      await eventApi.cancelar(confirmCancelar.id, motivoCancelamento);
      setConfirmCancelar(null);
      setMotivoCancelamento('');
      addToast('success', `Evento "${confirmCancelar.nome}" cancelado com sucesso.`);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao cancelar o evento.');
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
        addToast('error', 'A data de início deve ser anterior ou igual à data de fim.');
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
      addToast('error', err.response?.data?.message || 'Erro ao editar o evento.');
    }
  }

  async function handleFinalizar() {
    if (!confirmFinalizar) return;
    try {
      await eventApi.finalizar(confirmFinalizar.id);
      setConfirmFinalizar(null);
      addToast('success', `Evento "${confirmFinalizar.nome}" finalizado com sucesso!`);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao finalizar o evento.');
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
        const nomes = alertas.map((a) => `${a.nome} (disponível: ${a.disponivel}, solicitado: ${a.solicitado})`);
        setLowStockNames(nomes);
      } else {
        addToast('success', `Evento clonado com sucesso: "${novo?.nome ?? 'cópia'}"`);
      }
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao clonar o evento.');
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
      const res = await eventApi.getAll({ page, limit });
      setEvents(res.data.data);
      const updated = res.data.data.find((ev: EventItem) => ev.id === selectedEvent.id);
      if (updated) setSelectedEvent(updated);
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao adicionar o membro à equipe.');
    }
  }

  async function handleRemoveTeam(memberId: number) {
    try {
      await eventApi.removeTeamMember(memberId);
      const res = await eventApi.getAll({ page, limit });
      setEvents(res.data.data);
      if (selectedEvent) {
        const updated = res.data.data.find((ev: EventItem) => ev.id === selectedEvent.id);
        if (updated) setSelectedEvent(updated);
      }
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao remover o membro da equipe.');
    }
  }

  function canFinalizar(ev: EventItem): boolean {
    if (!isAdmin) return false;
    if (ev.status === 'finalizado') return false;
    if (ev.status === 'cancelado') return false;
    if (ev.foiFinalizadoPreviamente) return false;
    if (!ev.checklists?.length) return false;
    return ev.checklists.every((cl) => ['concluido', 'cancelado'].includes(cl.status));
  }

  async function handleArquivar() {
    if (!confirmArchive) return;
    try {
      await eventApi.arquivar(confirmArchive.id);
      addToast('success', `Evento "${confirmArchive.nome}" arquivado com sucesso.`);
      setConfirmArchive(null);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao arquivar o evento.');
    }
  }

  async function handleDesarquivar(ev: EventItem) {
    try {
      await eventApi.desarquivar(ev.id);
      addToast('success', `Evento "${ev.nome}" restaurado da lixeira.`);
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao restaurar o evento.');
    }
  }

  async function handleExcluirPermanente() {
    if (!confirmExcluir) return;
    try {
      await eventApi.excluirPermanente(confirmExcluir.id);
      addToast('success', `Evento "${confirmExcluir.nome}" excluído permanentemente.`);
      setConfirmExcluir(null);
      await load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao excluir o evento.');
    }
  }

  async function handleBulkArchive() {
    if (selectedIds.length === 0) return;
    setIsBulkLoading(true);
    try {
      await eventApi.arquivarLote(selectedIds);
      addToast('success', `${selectedIds.length} eventos arquivados com sucesso.`);
      setSelectedIds([]);
      setConfirmBulkArquivar(false);
      await load();
    } catch (err: any) {
      addToast('error', 'Erro ao arquivar eventos em lote.');
    } finally {
      setIsBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    setIsBulkLoading(true);
    try {
      await eventApi.excluirLote(selectedIds);
      addToast('success', `${selectedIds.length} eventos excluídos permanentemente.`);
      setSelectedIds([]);
      setConfirmBulkExcluir(false);
      await load();
    } catch (err: any) {
      addToast('error', 'Erro ao excluir eventos em lote.');
    } finally {
      setIsBulkLoading(false);
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === events.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(events.map(ev => ev.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

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
              {total} evento(s)
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

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
            placeholder="Buscar evento, cliente, local..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>

        {isAdmin && (
          <button
            onClick={() => { setShowArchived(!showArchived); setTrashStatusFilter(''); setSelectedIds([]); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${showArchived
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
            }`}
          >
            <Archive size={14} />
            {showArchived ? 'Ver Ativos' : 'Lixeira'}
          </button>
        )}

        {/* Bulk Action Controls - Trash only */}
        {isAdmin && showArchived && events.length > 0 && (
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={toggleSelectAll}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {selectedIds.length === events.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
            
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {selectedIds.length} selecionados
                </span>
                <button
                  onClick={() => setConfirmBulkExcluir(true)}
                  disabled={isBulkLoading}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status filter for trash view */}
        {isAdmin && showArchived && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTrashStatusFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                trashStatusFilter === ''
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTrashStatusFilter('finalizado')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                trashStatusFilter === 'finalizado'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              Finalizados
            </button>
            <button
              onClick={() => setTrashStatusFilter('cancelado')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                trashStatusFilter === 'cancelado'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              Cancelados
            </button>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        {events.filter((ev) => {
          if (searchFilter) {
            const s = searchFilter.toLowerCase();
            if (!ev.nome.toLowerCase().includes(s) && !ev.cliente.toLowerCase().includes(s) && !ev.local.toLowerCase().includes(s)) return false;
          }
          // Status filter for trash view
          if (showArchived && trashStatusFilter && ev.status !== trashStatusFilter) return false;

          return true;
        }).map((ev) => (
          <div
            key={ev.id}
            className={`bg-white dark:bg-slate-800 rounded-xl border p-5 hover:shadow-lg transition-shadow relative ${
              selectedIds.includes(ev.id) ? 'ring-2 ring-indigo-500 border-indigo-500' : ''
            } ${
              ev.status === 'finalizado'
                ? 'border-emerald-300 dark:border-emerald-700 opacity-80'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            {/* Selection Checkbox - Trash only */}
            {isAdmin && showArchived && (
              <div className="absolute top-3 right-3 z-10">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(ev.id)}
                  onChange={() => toggleSelect(ev.id)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            )}
            <div className="flex flex-col gap-3 mb-4 border-b border-slate-100 dark:border-slate-700/50 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-slate-800 dark:text-white text-base leading-tight">
                      {ev.nome}
                    </h3>
                    {ev.arquivado ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-bold uppercase tracking-wider">
                        📦 Arquivado
                      </span>
                    ) : ev.status === 'finalizado' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold uppercase tracking-wider">
                        ✓ Finalizado
                      </span>
                    ) : ev.status === 'cancelado' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-bold uppercase tracking-wider" title={ev.canceladoPor ? `Cancelado por ${ev.canceladoPor}${ev.canceladoEm ? ` em ${new Date(ev.canceladoEm).toLocaleDateString('pt-BR')}` : ''}` : ''}>
                        ✖ Cancelado
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold uppercase tracking-wider">
                        Em andamento
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium truncate">{ev.cliente}</p>
                </div>
              </div>

              {/* Actions Row */}
              <div className="flex gap-1.5 flex-wrap items-center">
                {ev.arquivado ? (
                  /* === LIXEIRA: apenas Restaurar e Excluir === */
                  <>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleDesarquivar(ev)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                          title="Restaurar evento da lixeira"
                        >
                          <RotateCcw size={13} /> Restaurar
                        </button>
                        <button
                          onClick={() => setConfirmExcluir(ev)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          title="Excluir permanentemente"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  /* === EVENTO ATIVO: botões normais === */
                  <>
                    {/* Evento que foi finalizado previamente e restaurado: apenas Clonar e Arquivar */}
                    {isAdmin && ev.foiFinalizadoPreviamente && ev.status === 'ativo' ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" title="Este evento já foi finalizado anteriormente. Apenas clone ou arquive.">
                          ⚠️ Restaurado
                        </span>
                        <button
                          onClick={() => handleClonarEvento(ev)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                          title="Clonar evento (inclui checklist e equipe)"
                        >
                          <Copy size={13} /> Clonar
                        </button>
                        <button
                          onClick={() => setConfirmArchive(ev)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Arquivar evento (mover para lixeira)"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <>
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
                              onClick={() => { setConfirmCancelar(ev); setMotivoCancelamento(''); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                              title="Cancelar evento"
                            >
                              <Ban size={13} /> Cancelar
                            </button>
                          </>
                        )}
                        {isAdmin && ev.status === 'cancelado' && (
                          <button
                            onClick={() => handleReativarEvento(ev)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                            title="Reativar evento (volta para rascunho)"
                          >
                            <RotateCcw size={13} /> Reativar Evento
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleClonarEvento(ev)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                            title="Clonar evento (inclui checklist e equipe)"
                          >
                            <Copy size={13} /> Clonar
                          </button>
                        )}
                        {isAdmin && ev.status === 'ativo' && !ev.arquivado && ev.checklists?.some(cl => cl.status === 'rascunho') && (
                          <button
                            onClick={() => handleLiberarEvento(ev)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                            title="Liberar evento para a equipe (reserva estoque do checklist)"
                          >
                            <CheckCircle2 size={13} /> Liberar Evento
                          </button>
                        )}
                        {/* Arquivar: apenas eventos finalizados ou cancelados */}
                        {isAdmin && ['finalizado', 'cancelado'].includes(ev.status) && (
                          <button
                            onClick={() => setConfirmArchive(ev)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Arquivar evento (mover para lixeira)"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => openTeam(ev)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                      title="Equipe"
                    >
                      <UsersIcon size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
              <p>{ev.local}</p>
              <p>
                {new Date(ev.dataInicio).toLocaleDateString('pt-BR')} -{' '}
                {new Date(ev.dataFim).toLocaleDateString('pt-BR')}
              </p>
              {!ev.arquivado && ev.checklists?.length > 0 && (
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
                          }`}>{
                            cl.status === 'concluido' ? 'Concluído' :
                            cl.status === 'rascunho' ? 'Rascunho' :
                            cl.status === 'liberado' ? 'Liberado' :
                            cl.status === 'em_evento' ? 'Em Evento' :
                            cl.status === 'pendente_devolucao' ? 'Pendente Devolução' :
                            cl.status === 'cancelado' ? 'Cancelado' : cl.status
                          }</span>
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
                        {isAdmin && cl.status === 'rascunho' && (
                          <button
                            type="button"
                            onClick={() => setConfirmExcluirChecklist({ id: cl.id, nome: cl.nome })}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Excluir checklist"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Novo Checklist button on the event card */}
              {!ev.arquivado && isAdmin && ev.status === 'ativo' && !ev.foiFinalizadoPreviamente && (!ev.checklists || ev.checklists.length === 0) && (
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
              {ev.status === 'finalizado' && ev.finalizadoPor && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center flex-wrap gap-1">
                  <CheckCircle size={11} className="flex-shrink-0" /> 
                  <span>Finalizado por {ev.finalizadoPor}</span>
                  <span className="opacity-70 text-[10px]">
                    {ev.finalizadoEm ? ` em ${new Date(ev.finalizadoEm).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                </p>
              )}
              {ev.status === 'cancelado' && ev.canceladoPor && (
                <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center flex-wrap gap-1">
                  <Ban size={11} className="flex-shrink-0" /> 
                  <span>Cancelado por {ev.canceladoPor}</span>
                  <span className="opacity-70 text-[10px]">
                    {ev.canceladoEm ? ` em ${new Date(ev.canceladoEm).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                </p>
              )}
              {ev.foiFinalizadoPreviamente && ev.status === 'ativo' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  ⚠️ Este evento já foi finalizado anteriormente. Apenas clone para criar um novo evento.
                </p>
              )}
            </div>

            {ev.observacoes && (
              <p className="text-xs text-slate-400 mt-2 italic">{ev.observacoes}</p>
            )}

            {/* Finalization button */}
            {!ev.arquivado && canFinalizar(ev) && (
              <button
                onClick={() => setConfirmFinalizar(ev)}
                className="mt-3 w-full flex items-center justify-center gap-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg font-medium transition-colors"
              >
                <CheckCircle size={14} /> Finalizar Evento
              </button>
            )}
            {!ev.arquivado && isAdmin && ev.status === 'ativo' && !ev.foiFinalizadoPreviamente && ev.checklists?.length > 0 && !canFinalizar(ev) && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <XCircle size={14} />
                Aguardando conclusão do checklist
              </div>
            )}
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
        title={`Editar Evento - ${selectedEvent?.nome ?? ''}`}
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

      {/* Cancel Event Modal */}
      <Modal
        open={confirmCancelar !== null}
        onClose={() => setConfirmCancelar(null)}
        title={`Cancelar Evento - ${confirmCancelar?.nome ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Esta ação irá cancelar o evento e reverter todas as reservas de estoque ativas.
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
        title={`Equipe - ${selectedEvent?.nome ?? ''}`}
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

      {/* Checklist Modal (Evento + Checklist na mesma tela) */}
      <Modal
        open={modalChecklist}
        onClose={() => {
          setModalChecklist(false);
          setChecklistModal(null);
          setEquipments([]);
        }}
        title={`Checklist - ${checklistModal?.nome ?? ''}`}
        maxWidth="max-w-5xl"
      >
        {checklistModal && (
          <div className="space-y-4">
            {/* Action Toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={checklistModal.status} />

                {/* Botão de Liberar individual removido - agora é feito via 'Liberar Evento' no card */}
                {/* Botão de Cancelar Checklist individual removido conforme pedido (cancelamento centralizado no Evento) */}

                {isAdmin && checklistModal.status === 'cancelado' && (
                  <button
                    type="button"
                    onClick={handleReativarChecklist}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors font-medium"
                  >
                    <RotateCcw size={13} className="inline mr-1" />Reativar
                  </button>
                )}

              </div>

              {isAdmin && ['rascunho', 'liberado', 'em_evento'].includes(checklistModal.status) && (
                <button
                  type="button"
                  onClick={() => setModalAddItem(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors font-medium"
                >
                  + Adicionar item
                </button>
              )}
            </div>

            {/* Return progress panel - Show in any active phase if something was separated */}
            {['liberado', 'em_evento', 'pendente_devolucao'].includes(checklistModal.status) && totalSeparados > 0 && (
              <div className={`rounded-xl border p-4 ${
                pendingReturnItems.length > 0
                  ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-semibold ${
                    pendingReturnItems.length > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
                  }`}>
                    <PackageCheck size={14} className="inline mr-1" />Progresso de Devolução
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

            {/* Separation progress for employee - Enhanced UI */}
            {!isAdmin && (checklistModal.status === 'liberado' || pendingItems.length > 0) && (
              <div className="space-y-4">
                {/* Progress bar and stats */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <PackageCheck size={20} className="text-indigo-500" />
                      Progresso de Separação
                    </h4>
                    <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {(checklistModal.items ?? []).filter(i => i.quantidadeSeparada >= i.quantidadePlanejada).length} / {(checklistModal.items ?? []).length}
                    </span>
                  </div>

                  {/* Big colored progress bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-4">
                    <div
                      className="h-4 rounded-full transition-all duration-700 bg-gradient-to-r from-indigo-500 to-purple-600"
                      style={{
                        width: `${(checklistModal.items ?? []).length > 0
                          ? ((checklistModal.items ?? []).filter(i => i.quantidadeSeparada >= i.quantidadePlanejada).length / (checklistModal.items ?? []).length) * 100
                          : 0}%`
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
                          return (
                            <div key={item.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-3 border border-red-200 dark:border-red-700">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-800 dark:text-white">{item.nomeSnapshot}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Setor: {item.setor}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-red-600 dark:text-red-400">Faltam {missing} unid.</p>
                                <p className="text-xs text-slate-500">{item.quantidadeSeparada}/{item.quantidadePlanejada}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Finalize button - only when all items separated */}
                  {pendingItems.length === 0 ? (
                    <button
                      onClick={async () => {
                        addToast('success', 'Todos os itens foram separados! Checklist pronto para o evento.');
                        await refreshChecklistModal();
                      }}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 mt-3"
                    >
                      <CheckCircle size={18} />
                      Finalizar Separação
                    </button>
                  ) : (
                    <button
                      disabled={true}
                      className="w-full bg-red-500 text-white py-3 rounded-xl text-sm font-bold opacity-75 cursor-not-allowed flex items-center justify-center gap-2 mt-3"
                    >
                      <AlertCircle size={18} />
                      Não é possível finalizar - {pendingItems.length} itens pendentes
                    </button>
                  )}
                </div>

                {/* Visual status cards per item */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[...(checklistModal.items ?? [])]
                    .sort((a, b) => {
                      const aPending = a.quantidadeSeparada < a.quantidadePlanejada ? 0 : 1;
                      const bPending = b.quantidadeSeparada < b.quantidadePlanejada ? 0 : 1;
                      if (aPending !== bPending) return aPending - bPending;
                      return (a.nomeSnapshot ?? '').localeCompare(b.nomeSnapshot ?? '');
                    })
                    .map((item) => {
                    const isSeparated = item.quantidadeSeparada >= item.quantidadePlanejada;
                    const progress = (item.quantidadeSeparada / item.quantidadePlanejada) * 100;

                    let statusColor = 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
                    let statusIcon = '🟥';
                    let statusText = 'NÃO SEPARADO';

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
                            <p className="text-xs text-slate-500 dark:text-slate-400">{item.setor.toUpperCase()}</p>
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
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {[...(checklistModal.items ?? [])]
                    .sort((a, b) => {
                      const aPending = a.quantidadeSeparada < a.quantidadePlanejada ? 0 : 1;
                      const bPending = b.quantidadeSeparada < b.quantidadePlanejada ? 0 : 1;
                      if (aPending !== bPending) return aPending - bPending;
                      return (a.nomeSnapshot ?? '').localeCompare(b.nomeSnapshot ?? '');
                    })
                    .map((item) => {
                    const fullySeparated = item.quantidadeSeparada >= item.quantidadePlanejada;
                    const fullyReturned = item.quantidadeDevolvida >= item.quantidadeSeparada && item.quantidadeSeparada > 0;
                    const isPending = !isAdmin && ['em_evento', 'pendente_devolucao'].includes(checklistModal.status) && item.quantidadeDevolvida < item.quantidadeSeparada;
                    const isLowStockCloned = false; // Stock conflict alerts disabled

                    return (
                      <tr
                        key={item.id}
                        className={
                          isPending ? 'bg-red-50 dark:bg-red-900/10'
                          : ''
                        }
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-700 dark:text-slate-200">
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
                              <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">{item.quantidadeOk}✓</span>
                            )}
                            {(item.quantidadeQuebrada ?? 0) > 0 && (
                              <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">{item.quantidadeQuebrada}✕</span>
                            )}
                            {(item.quantidadePerdida ?? 0) > 0 && (
                              <span className="bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">{item.quantidadePerdida}?</span>
                            )}
                            {(item.quantidadeOk ?? 0) === 0 && (item.quantidadeQuebrada ?? 0) === 0 && (item.quantidadePerdida ?? 0) === 0 && (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusBadge status={item.statusDevolucao} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {/* Employee: Separar */}
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
                            {/* 🔴 Employee: Devolver with mixed return */}
                            {canEmployeeReturn && item.quantidadeDevolvida < item.quantidadeSeparada && (
                              <button
                                onClick={() => {
                                  const remaining = item.quantidadeSeparada - item.quantidadeDevolvida;
                                  setReturnModal(item);
                                  setReturnOk(remaining);
                                  setReturnDanificado(0);
                                  setReturnPerdido(0);
                                  setReturnObservation('');
                                }}
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                              >
                                <RotateCcw size={11} className="inline mr-0.5" />Devolver
                              </button>
                            )}
                            {canEditPlanned && (
                              <button
                                onClick={async () => {
                                  setEditQtyItem(item);
                                  setEditQtyValue(item.quantidadePlanejada);
                                  try {
                                    const res = await equipmentApi.search(item.nomeSnapshot);
                                    const eq = res.data?.find((e: any) => e.id === item.equipmentId);
                                    if (eq) {
                                      // Max = disponivel + o que já está reservado para este item
                                      const isRascunho = checklistModal?.status === 'rascunho';
                                      const jaReservado = isRascunho ? 0 : item.quantidadePlanejada;
                                      setEditQtyMax(eq.quantidadeDisponivel + jaReservado);
                                    } else {
                                      setEditQtyMax(999);
                                    }
                                  } catch { setEditQtyMax(999); }
                                }}
                                className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                              >
                                Editar qtd
                              </button>
                            )}
                            {isAdmin && ['rascunho', 'liberado', 'em_evento'].includes(checklistModal.status) && (
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
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantidade</label>
            <div className="flex justify-center py-2">
              <QuantityStepper value={quantidade} onChange={setQuantidade} min={1} max={equipments.find(eq => String(eq.id) === selectedEquipment)?.quantidadeDisponivel ?? 999} />
            </div>
            {selectedEquipment && (
              <p className="text-xs text-slate-400 mt-1 text-center">
                Disponível: {equipments.find(eq => String(eq.id) === selectedEquipment)?.quantidadeDisponivel ?? 0}
              </p>
            )}
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
        title={`Editar quantidade - ${editQtyItem?.nomeSnapshot ?? ''}`}
      >
        {editQtyItem && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ajuste a quantidade planejada. Estoque disponível: <span className="font-bold text-indigo-500">{editQtyMax}</span> unidade(s).
            </p>
            <div className="flex justify-center py-2">
              <QuantityStepper value={editQtyValue} onChange={setEditQtyValue} min={1} max={editQtyMax} />
            </div>
            <button
              type="button"
              onClick={handleUpdatePlannedQty}
              disabled={editQtyValue > editQtyMax}
              className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Salvar quantidade
            </button>
          </div>
        )}
      </Modal>

      {/* Separation Modal - stepper + progress */}
      <Modal
        open={separateModal !== null}
        onClose={() => { setSeparateModal(null); setSeparateQty(1); }}
        title={`Separar - ${separateModal?.nomeSnapshot ?? ''}`}
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
            Confirmar Separação de {separateQty} unidade(s)
          </button>
        </div>
      </Modal>

      {/* 🔴 EMPLOYEE Hybrid Return Modal - OK auto / Danificado-Perdido pending */}
      <Modal
        open={returnModal !== null}
        onClose={() => { setReturnModal(null); setReturnOk(0); setReturnDanificado(0); setReturnPerdido(0); setReturnObservation(''); }}
        title={`Devolver - ${returnModal?.nomeSnapshot ?? ''}`}
      >
        {returnModal && (() => {
          const remaining = returnModal.quantidadeSeparada - returnModal.quantidadeDevolvida;
          const totalReturn = returnOk + returnDanificado + returnPerdido;
          const isValid = totalReturn > 0 && totalReturn <= remaining;

          return (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Separado', value: returnModal.quantidadeSeparada, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Já devolvido', value: returnModal.quantidadeDevolvida, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Aguardando', value: remaining, color: 'text-amber-600 dark:text-amber-400 font-bold' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* 🔴 MIXED RETURN: 3 separate quantity steppers */}
              <div className="space-y-3">
                {[
                  { key: 'ok' as const, label: '✅ OK - Bom estado', desc: 'Estoque atualizado automaticamente', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/10', value: returnOk, setter: setReturnOk },
                  { key: 'danificado' as const, label: '⚠️ Danificado - Com defeito', desc: 'Aguardará confirmação do admin', color: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10', value: returnDanificado, setter: setReturnDanificado },
                  { key: 'perdido' as const, label: '❌ Perdido - Extraviado', desc: 'Aguardará confirmação do admin', color: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10', value: returnPerdido, setter: setReturnPerdido },
                ].map(({ key, label, desc, color, value, setter }) => (
                  <div key={key} className={`rounded-xl border p-3 ${color}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
                      </div>
                      <QuantityStepper
                        value={value}
                        onChange={setter}
                        min={0}
                        max={remaining - totalReturn + value}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Validation summary */}
              <div className={`text-center py-2 rounded-xl text-sm font-medium ${
                isValid
                  ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : totalReturn === 0
                  ? 'bg-slate-100 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400'
                  : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                Devolvendo: <strong>{totalReturn}</strong> / {remaining}
                {totalReturn > remaining && <span className="ml-2 text-xs">(excede o máximo)</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Observação (opcional)
                </label>
                <textarea
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
                  rows={2}
                  placeholder="Ex: equipamento com arranhões, cabo danificado..."
                  value={returnObservation}
                  onChange={(e) => setReturnObservation(e.target.value)}
                />
              </div>

              <button
                onClick={handleDevolver}
                disabled={!isValid}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                {`Confirmar Devolução (${totalReturn} unidade${totalReturn !== 1 ? 's' : ''})`}
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

      {/* Archive Confirm Modal */}
      <ConfirmModal
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        onConfirm={handleArquivar}
        title="Arquivar Evento"
        message={`Tem certeza que deseja arquivar o evento "${confirmArchive?.nome}"? Ele será movido para a lixeira e não aparecerá mais na lista de eventos ativos.`}
        confirmLabel="Arquivar"
        type="danger"
      />

      {/* Confirm Permanent Delete Modal */}
      <ConfirmModal
        open={confirmExcluir !== null}
        onClose={() => setConfirmExcluir(null)}
        onConfirm={handleExcluirPermanente}
        title="Excluir Evento Permanentemente"
        message={`ATENÇÃO: Esta ação é IRREVERSÍVEL! Tem certeza que deseja excluir permanentemente o evento "${confirmExcluir?.nome}"? Todos os dados serão perdidos: checklist, itens, equipe e histórico.`}
        confirmLabel="Excluir Permanentemente"
        type="danger"
      />

      <ConfirmModal
        open={confirmExcluirChecklist !== null}
        onClose={() => setConfirmExcluirChecklist(null)}
        onConfirm={handleExcluirChecklist}
        title="Excluir Checklist"
        message={`Deseja excluir o checklist "${confirmExcluirChecklist?.nome}"? Esta ação é irreversível.`}
        confirmLabel="Excluir"
        type="danger"
      />

      {/* Bulk Archive Confirm */}
      <ConfirmModal
        open={confirmBulkArquivar}
        onClose={() => setConfirmBulkArquivar(false)}
        onConfirm={handleBulkArchive}
        title="Arquivar Eventos em Lote"
        message={`Tem certeza que deseja arquivar os ${selectedIds.length} evento(s) selecionado(s)? Eles serão movidos para a lixeira.`}
        confirmLabel="Arquivar Selecionados"
        type="danger"
      />

      {/* Bulk Delete Confirm */}
      <ConfirmModal
        open={confirmBulkExcluir}
        onClose={() => setConfirmBulkExcluir(false)}
        onConfirm={handleBulkDelete}
        title="Excluir Eventos Permanentemente"
        message={`ATENÇÃO: Esta ação é IRREVERSÍVEL! Tem certeza que deseja excluir permanentemente os ${selectedIds.length} evento(s) selecionado(s)?`}
        confirmLabel="Excluir Permanentemente"
        type="danger"
      />

      {/* Stock Conflict Alert Modal */}
      <Modal
        open={lowStockNames.length > 0}
        onClose={() => setLowStockNames([])}
        title="Alerta de Estoque"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
            <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0" size={24} />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              O evento foi clonado com sucesso, mas alguns itens estão com estoque insuficiente para o novo checklist.
            </p>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Itens com conflito:</p>
            <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700 max-h-[40vh] overflow-y-auto">
              {lowStockNames.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
          
          <button
            onClick={() => setLowStockNames([])}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Entendido
          </button>
        </div>
      </Modal>
    </div>
  );
}
