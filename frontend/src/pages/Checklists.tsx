import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Play, X, Copy } from 'lucide-react';
import { checklistApi, checklistItemApi, equipmentApi } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';

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
}

interface Equipment {
  id: number;
  nome: string;
  descricao: string;
  quantidadeDisponivel: number;
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

  // Create form
  const [nome, setNome] = useState('');

  // Add item form
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [setor, setSetor] = useState('som');

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
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  async function handleLiberar(id: number) {
    try {
      await checklistApi.liberar(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao liberar');
    }
  }

  async function handleCancelar(id: number) {
    const motivo = prompt('Motivo do cancelamento:');
    if (!motivo) return;
    try {
      await checklistApi.cancelar(id, motivo);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao cancelar');
    }
  }

  async function handleClonar(id: number) {
    try {
      const res = await checklistApi.clonar(id);
      if (res.data.alertas?.length > 0) {
        alert('Alertas:\n' + res.data.alertas.join('\n'));
      }
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao clonar');
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
      // Reload checklist
      const res = await checklistApi.getOne(selected.id);
      setSelected(res.data);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  async function handleSeparar(itemId: number) {
    const qty = prompt('Quantidade a separar:');
    if (!qty) return;
    try {
      await checklistItemApi.separar(itemId, Number(qty));
      if (selected) {
        const res = await checklistApi.getOne(selected.id);
        setSelected(res.data);
      }
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  async function handleDevolver(itemId: number) {
    const qty = prompt('Quantidade a devolver:');
    if (!qty) return;
    const situacao = prompt('Situação (ok / quebrado / perdido):') as
      | 'ok'
      | 'quebrado'
      | 'perdido';
    if (!situacao) return;
    try {
      await checklistItemApi.devolver(itemId, Number(qty), situacao);
      if (selected) {
        const res = await checklistApi.getOne(selected.id);
        setSelected(res.data);
      }
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  async function handleRemoveItem(itemId: number) {
    if (!confirm('Remover item?')) return;
    try {
      await checklistItemApi.remove(itemId);
      if (selected) {
        const res = await checklistApi.getOne(selected.id);
        setSelected(res.data);
      }
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
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
                      handleCancelar(cl.id);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <X size={12} className="inline mr-1" />
                    Cancelar
                  </button>
                )}
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

      {/* Items Modal */}
      <Modal
        open={modalItems}
        onClose={() => setModalItems(false)}
        title={`Itens - ${selected?.nome ?? ''}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={selected?.status ?? ''} />
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
                {selected?.items?.map((item) => (
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
                      {item.quantidadeSeparada}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.quantidadeDevolvida}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={item.statusDevolucao} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {selected?.status === 'liberado' && (
                          <button
                            onClick={() => handleSeparar(item.id)}
                            className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            Separar
                          </button>
                        )}
                        {(selected?.status === 'em_evento' ||
                          selected?.status === 'pendente_devolucao') && (
                          <button
                            onClick={() => handleDevolver(item.id)}
                            className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 transition-colors"
                          >
                            Devolver
                          </button>
                        )}
                        {isAdmin && selected?.status === 'rascunho' && (
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Add Item Modal */}
      <Modal
        open={modalAddItem}
        onClose={() => setModalAddItem(false)}
        title="Adicionar Item"
      >
        <form onSubmit={handleAddItem} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Equipamento
            </label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome} (disp: {eq.quantidadeDisponivel})
                </option>
              ))}
            </select>
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
              <select
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
              >
                <option value="som">Som</option>
                <option value="luz">Luz</option>
                <option value="video">Vídeo</option>
                <option value="estrutura">Estrutura</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Adicionar
          </button>
        </form>
      </Modal>
    </div>
  );
}
