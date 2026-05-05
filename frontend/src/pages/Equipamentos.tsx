import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Package, Plus, Edit3, Search, Trash2 } from 'lucide-react';
import { equipmentApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface Equipment {
  id: number;
  nome: string;
  descricao: string;
  quantidadeTotal: number;
  quantidadeDisponivel: number;
  quantidadeEmUso: number;
  quantidadeDanificada: number;
  quantidadePerdida: number;
  ativo: boolean;
  origem: string;
  fornecedor?: string;
  setor: string;
}

interface EventoEmUso {
  eventId: number;
  eventNome: string;
  eventCliente: string;
  quantidade: number;
}

/**
 * Tooltip component that shows which events are using a given equipment.
 * Uses a portal to render outside the table overflow container.
 * Data is fetched lazily on hover.
 */
function EquipmentUsageTooltip({ equipmentId, quantidadeEmUso }: { equipmentId: number; quantidadeEmUso: number }) {
  const [eventos, setEventos] = useState<EventoEmUso[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  async function fetchEventos() {
    if (eventos !== null) return;
    setLoading(true);
    try {
      const res = await equipmentApi.getEventosEmUso(equipmentId);
      setEventos(res.data);
    } catch {
      setEventos([]);
    } finally {
      setLoading(false);
    }
  }

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8;

    setCoords({
      top: rect.bottom + 8,
      left,
    });
  }, []);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      updatePosition();
      setShow(true);
      fetchEventos();
    }, 300);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShow(false);
    }, 200);
  }

  function handleTooltipMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  return (
    <>
      <span
        ref={triggerRef}
        className="text-amber-600 dark:text-amber-400 font-semibold cursor-help underline decoration-dotted underline-offset-2"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {quantidadeEmUso}
      </span>
      {show && coords && createPortal(
        <div
          className="fixed z-[9999] w-[280px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl p-4 text-left"
          style={{ top: coords.top, left: coords.left }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Arrow pointing up */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white dark:border-b-slate-800" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[10px]">📋</span>
            Eventos usando este equipamento
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : eventos && eventos.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {eventos.map((ev) => (
                <div key={ev.eventId} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{ev.eventNome}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{ev.eventCliente}</p>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 ml-2 flex-shrink-0 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
                    {ev.quantidade}×
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2 text-center">Nenhum evento encontrado</p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function Equipamentos() {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  // Form state
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidadeTotal, setQuantidadeTotal] = useState(1);
  const [origem, setOrigem] = useState<'interno' | 'alugado'>('interno');
  const [fornecedor, setFornecedor] = useState('');
  const [setor, setSetor] = useState('som');
  const [setorCustom, setSetorCustom] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [origemFilter, setOrigemFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    load();
  }, [page, limit]);

  useAutoRefresh(load);

  async function load() {
    try {
      const res = await equipmentApi.getAll({ page, limit });
      setEquipments(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setNome('');
    setDescricao('');
    setQuantidadeTotal(1);
    setOrigem('interno');
    setFornecedor('');
    setSetor('som');
    setSetorCustom('');
    setModalOpen(true);
  }

  function openEdit(eq: Equipment) {
    setEditing(eq);
    setNome(eq.nome);
    setDescricao(eq.descricao);
    setQuantidadeTotal(eq.quantidadeTotal);
    setOrigem(eq.origem as 'interno' | 'alugado');
    setFornecedor(eq.fornecedor || '');
    setSetor((eq.setor || 'som') as any);
    setSetorCustom(!['som', 'luz', 'video', 'estrutura', 'comunicacao', 'outros'].includes(eq.setor || 'som') ? eq.setor : '');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quantidadeTotal <= 0) {
      addToast('error', 'Quantidade deve ser maior que zero.');
      return;
    }
    if (origem === 'alugado' && !fornecedor.trim()) {
      addToast('error', 'Equipamento alugado deve ter o nome do fornecedor preenchido.');
      return;
    }
    try {
      if (editing) {
        await equipmentApi.update(editing.id, {
          nome,
          descricao,
          quantidadeTotal,
          origem,
          fornecedor: fornecedor || undefined,
          setor: setor === 'outros' ? (setorCustom || 'outros') : setor,
        });
        addToast('success', 'Equipamento atualizado com sucesso!');
      } else {
        await equipmentApi.create({
          nome,
          descricao,
          quantidadeTotal,
          origem,
          fornecedor: fornecedor || undefined,
          setor: setor === 'outros' ? (setorCustom || 'outros') : setor,
        });
        addToast('success', 'Equipamento criado com sucesso!');
      }
      setModalOpen(false);
      setNome('');
      setDescricao('');
      setQuantidadeTotal(1);
      setOrigem('interno');
      setFornecedor('');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao salvar o equipamento.');
    }
  }



  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await equipmentApi.remove(confirmDelete);
      setConfirmDelete(null);
      addToast('success', 'Equipamento excluído com sucesso.');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao excluir o equipamento.');
    }
  }

  const filtered = equipments.filter((eq) => {
    if (search) {
      const s = search.toLowerCase();
      if (!eq.nome.toLowerCase().includes(s) && !eq.descricao.toLowerCase().includes(s)) return false;
    }
    if (origemFilter && eq.origem !== origemFilter) return false;
    return true;
  });

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
          <Package className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Equipamentos
            </h1>
            <p className="text-sm text-slate-500">
              {total} equipamento(s)
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={18} /> Novo Equipamento
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
            placeholder="Buscar equipamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
          value={origemFilter}
          onChange={(e) => setOrigemFilter(e.target.value)}
        >
          <option value="">Todas as Origens</option>
          <option value="interno">Interno</option>
          <option value="alugado">Alugado</option>
        </select>

      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                  Nome
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">
                  Descrição
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Origem
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Total
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Disponível
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Em Uso
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Quebrado
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">
                  Perdido
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((eq) => (
                <tr
                  key={eq.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {eq.nome}
                    </span>
                    {eq.fornecedor && (
                      <span className="text-xs text-slate-400 ml-2">
                        ({eq.fornecedor})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                    {eq.descricao}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-lg ${eq.origem === 'interno'
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                        }`}
                    >
                      {eq.origem === 'interno' ? 'Interno' : 'Alugado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">
                    {eq.quantidadeTotal}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`font-semibold ${eq.quantidadeDisponivel <= 2
                          ? 'text-red-500'
                          : 'text-emerald-600'
                        }`}
                    >
                      {eq.quantidadeDisponivel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {eq.quantidadeEmUso > 0 ? (
                      <EquipmentUsageTooltip equipmentId={eq.id} quantidadeEmUso={eq.quantidadeEmUso} />
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={eq.quantidadeDanificada > 0 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>{eq.quantidadeDanificada}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={eq.quantidadePerdida > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{eq.quantidadePerdida}</span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openEdit(eq)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(eq.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              Nenhum equipamento encontrado
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


      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Equipamento"
        message="Tem certeza que deseja excluir este equipamento? Esta ação é irreversível. O equipamento será removido do checklist e o estoque será liberado automaticamente."
        confirmLabel="Excluir"
        type="danger"
      />

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Equipamento' : 'Novo Equipamento'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Descrição
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Quantidade Total
              </label>
              <input
                type="number"
                min="0"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={quantidadeTotal}
                onChange={(e) => setQuantidadeTotal(Number(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Origem
              </label>
              <div className="flex gap-2">
                {(['interno', 'alugado'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrigem(o)}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${origem === o
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                  >
                    {o === 'interno' ? 'Interno' : 'Alugado'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Setor
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['som', 'luz', 'video', 'estrutura', 'comunicacao', 'outros'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSetor(s)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${setor === s
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                >
                  {s === 'som' ? '🔊 Som' : s === 'luz' ? '💡 Luz' : s === 'video' ? '📹 Vídeo' : s === 'estrutura' ? '🏗️ Estrutura' : s === 'comunicacao' ? '📡 Comunicação' : '📦 Outros'}
                </button>
              ))}
            </div>
            {setor === 'outros' && (
              <div className="mt-2">
                <input
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  value={setorCustom}
                  onChange={(e) => setSetorCustom(e.target.value)}
                  placeholder="Digite o nome do setor..."
                  required
                />
              </div>
            )}
          </div>
          {origem === 'alugado' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Fornecedor
              </label>
              <input
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {editing ? 'Salvar Alterações' : 'Criar Equipamento'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
