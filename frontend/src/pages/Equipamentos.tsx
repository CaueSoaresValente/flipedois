import { useEffect, useState } from 'react';
import { Package, Plus, Edit3, XCircle } from 'lucide-react';
import { equipmentApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';

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
}

export default function Equipamentos() {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  // Form state
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidadeTotal, setQuantidadeTotal] = useState(1);
  const [origem, setOrigem] = useState<'interno' | 'alugado'>('interno');
  const [fornecedor, setFornecedor] = useState('');

  // Search
  const [search, setSearch] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    load();
  }, [page, limit]);

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
    setModalOpen(true);
  }

  function openEdit(eq: Equipment) {
    setEditing(eq);
    setNome(eq.nome);
    setDescricao(eq.descricao);
    setQuantidadeTotal(eq.quantidadeTotal);
    setOrigem(eq.origem as 'interno' | 'alugado');
    setFornecedor(eq.fornecedor || '');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await equipmentApi.update(editing.id, {
          nome,
          descricao,
          quantidadeTotal,
          origem,
          fornecedor: fornecedor || undefined,
        });
        addToast('success', 'Equipamento atualizado com sucesso');
      } else {
        await equipmentApi.create({
          nome,
          descricao,
          quantidadeTotal,
          origem,
          fornecedor: fornecedor || undefined,
        });
        addToast('success', 'Equipamento criado com sucesso');
      }
      setModalOpen(false);
      setNome('');
      setDescricao('');
      setQuantidadeTotal(1);
      setOrigem('interno');
      setFornecedor('');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao salvar equipamento');
    }
  }

  async function handleDeactivate() {
    if (!confirmDeactivate) return;
    try {
      await equipmentApi.deactivate(confirmDeactivate);
      setConfirmDeactivate(null);
      addToast('success', 'Equipamento desativado');
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao desativar');
    }
  }

  const filtered = equipments.filter((eq) =>
    eq.nome.toLowerCase().includes(search.toLowerCase()) ||
    eq.descricao.toLowerCase().includes(search.toLowerCase()),
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
          <Package className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Equipamentos
            </h1>
            <p className="text-sm text-slate-500">
              {total} equipamento(s) ativos
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

      {/* Search */}
      <input
        className="w-full max-w-md p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
        placeholder="Buscar equipamento..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                  <td className="px-4 py-3 text-center text-slate-500">
                    {eq.quantidadeEmUso}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={eq.quantidadeDanificada > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{eq.quantidadeDanificada}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={eq.quantidadePerdida > 0 ? 'text-amber-500 font-semibold' : 'text-slate-400'}>{eq.quantidadePerdida}</span>
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
                          onClick={() => setConfirmDeactivate(eq.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Desativar"
                        >
                          <XCircle size={16} />
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

      {/* Deactivate Confirm Modal */}
      <ConfirmModal
        open={confirmDeactivate !== null}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Desativar Equipamento"
        message="Tem certeza que deseja desativar este equipamento? Ele não aparecerá mais na lista."
        confirmLabel="Desativar"
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
