import { useEffect, useState } from 'react';
import { Package, Plus, Edit3, XCircle } from 'lucide-react';
import { equipmentApi } from '../services/api';
import Modal from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';

interface Equipment {
  id: number;
  nome: string;
  descricao: string;
  quantidadeTotal: number;
  quantidadeDisponivel: number;
  ativo: boolean;
  origem: string;
  fornecedor?: string;
}

export default function Equipamentos() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Equipment | null>(null);
  const { isAdmin } = useAuth();

  // Form
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidadeTotal, setQuantidadeTotal] = useState(0);
  const [origem, setOrigem] = useState('interno');
  const [fornecedor, setFornecedor] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const res = await equipmentApi.getAll();
      setItems(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditItem(null);
    setNome('');
    setDescricao('');
    setQuantidadeTotal(0);
    setOrigem('interno');
    setFornecedor('');
    setModalOpen(true);
  }

  function openEdit(eq: Equipment) {
    setEditItem(eq);
    setNome(eq.nome);
    setDescricao(eq.descricao);
    setQuantidadeTotal(eq.quantidadeTotal);
    setOrigem(eq.origem);
    setFornecedor(eq.fornecedor ?? '');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editItem) {
        await equipmentApi.update(editItem.id, {
          nome,
          descricao,
          quantidadeTotal,
          fornecedor: fornecedor || undefined,
        });
      } else {
        await equipmentApi.create({
          nome,
          descricao,
          quantidadeTotal,
          origem,
          fornecedor: fornecedor || undefined,
        });
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao salvar');
    }
  }

  async function handleDeactivate(id: number) {
    if (!confirm('Desativar este equipamento?')) return;
    try {
      await equipmentApi.deactivate(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao desativar');
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
          <Package className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Equipamentos
            </h1>
            <p className="text-sm text-slate-500">
              {items.length} equipamento(s) ativo(s)
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

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Nome
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Descrição
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Total
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Disponível
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Origem
                </th>
                {isAdmin && (
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {items.map((eq) => (
                <tr
                  key={eq.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                      {eq.nome}
                    </p>
                    {eq.fornecedor && (
                      <p className="text-xs text-slate-400">
                        {eq.fornecedor}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                    {eq.descricao}
                  </td>
                  <td className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {eq.quantidadeTotal}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`text-sm font-semibold ${
                        eq.quantidadeDisponivel <= 0
                          ? 'text-red-500'
                          : eq.quantidadeDisponivel <
                            eq.quantidadeTotal * 0.3
                          ? 'text-amber-500'
                          : 'text-green-500'
                      }`}
                    >
                      {eq.quantidadeDisponivel}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {eq.origem}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(eq)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeactivate(eq.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
          {items.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              Nenhum equipamento encontrado
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Equipamento' : 'Novo Equipamento'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
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
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
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
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                value={quantidadeTotal}
                onChange={(e) => setQuantidadeTotal(Number(e.target.value))}
                required
              />
            </div>
            {!editItem && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Origem
                </label>
                <select
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                >
                  <option value="interno">Interno</option>
                  <option value="alugado">Alugado</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Fornecedor (opcional)
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {editItem ? 'Salvar' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
