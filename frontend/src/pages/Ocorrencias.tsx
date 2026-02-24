import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Check, X } from 'lucide-react';
import { occurrenceApi, equipmentApi, eventApi } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';

interface Occurrence {
  id: number;
  quantidade: number;
  descricao: string;
  status: string;
  tipo: string;
  motivo?: string;
  createdAt: string;
  equipment: { id: number; nome: string };
  event: { id: number; nome: string } | null;
}

export default function Ocorrencias() {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { isAdmin } = useAuth();

  // Form
  const [equipmentId, setEquipmentId] = useState('');
  const [eventId, setEventId] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('DANO');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [ocRes, eqRes, evRes] = await Promise.all([
        occurrenceApi.getAll(),
        equipmentApi.getAll(),
        eventApi.getAll(),
      ]);
      setItems(ocRes.data);
      setEquipments(eqRes.data);
      setEvents(evRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await occurrenceApi.create({
        equipmentId: Number(equipmentId),
        eventId: eventId ? Number(eventId) : undefined,
        quantidade,
        descricao,
        tipo,
        motivo: motivo || undefined,
      });
      setModalOpen(false);
      resetForm();
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
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
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro');
    }
  }

  async function handleCancelar(id: number) {
    try {
      await occurrenceApi.cancelar(id);
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
          <AlertTriangle className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Ocorrências
            </h1>
            <p className="text-sm text-slate-500">
              {items.length} ocorrência(s)
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
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Equipamento
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Tipo
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Qtd
                </th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Evento
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Data
                </th>
                {isAdmin && (
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
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
                    {oc.equipment?.nome ?? '—'}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        oc.tipo === 'DANO'
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-600'
                          : oc.tipo === 'PERDA'
                          ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600'
                          : 'bg-blue-100 dark:bg-blue-900/20 text-blue-600'
                      }`}
                    >
                      {oc.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {oc.quantidade}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <StatusBadge status={oc.status} />
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-500">
                    {oc.event?.nome ?? '—'}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-400">
                    {new Date(oc.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-3 text-right">
                      {oc.status === 'PENDENTE' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleConfirmar(oc.id)}
                            className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                            title="Confirmar baixa"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => handleCancelar(oc.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Cancelar"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              Nenhuma ocorrência registrada
            </div>
          )}
        </div>
      </div>

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
              onChange={(e) => setEquipmentId(e.target.value)}
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
                <option value="DANO">Dano</option>
                <option value="PERDA">Perda</option>
                <option value="AJUSTE">Ajuste</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Quantidade
              </label>
              <input
                type="number"
                min="1"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Evento (opcional)
            </label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">Sem evento</option>
              {events.map((ev: any) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nome}
                </option>
              ))}
            </select>
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
          {tipo === 'AJUSTE' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Motivo (obrigatório para ajuste)
              </label>
              <input
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Registrar Ocorrência
          </button>
        </form>
      </Modal>
    </div>
  );
}
