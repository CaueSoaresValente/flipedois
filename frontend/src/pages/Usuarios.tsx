import { useEffect, useState } from 'react';
import { Users, Plus, ShieldCheck, ShieldAlert, Search, XCircle, RefreshCw } from 'lucide-react';
import { userApi } from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../contexts/ToastContext';
import Pagination from '../components/Pagination';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface UserItem {
  id: number;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
}

export default function Usuarios() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { addToast } = useToast();

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Form
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [role, setRole] = useState('FUNCIONARIO');
  const [confirmAction, setConfirmAction] = useState<{ user: UserItem; action: 'desativar' | 'reativar' } | null>(null);

  useEffect(() => {
    load();
  }, [page, limit]);

  useAutoRefresh(load);

  async function load() {
    try {
      const res = await userApi.getAll({ page, limit });
      setUsers(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await userApi.create({ nome, email, senha, role });
      setModalOpen(false);
      setNome('');
      setEmail('');
      setSenha('');
      setRole('FUNCIONARIO');
      addToast('success', `Usuário "${nome}" criado com sucesso!`);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao criar o usuário.');
    }
  }

  // Filtered users
  const filtered = users.filter((u) => {
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      if (!u.nome.toLowerCase().includes(s) && !u.email.toLowerCase().includes(s)) return false;
    }
    if (roleFilter && u.role !== roleFilter) return false;
    return true;
  });

  async function handleToggleAtivo() {
    if (!confirmAction) return;
    try {
      if (confirmAction.action === 'desativar') {
        await userApi.desativar(confirmAction.user.id);
        addToast('success', `Usuário "${confirmAction.user.nome}" desativado com sucesso.`);
      } else {
        await userApi.reativar(confirmAction.user.id);
        addToast('success', `Usuário "${confirmAction.user.nome}" reativado com sucesso.`);
      }
      setConfirmAction(null);
      load();
    } catch (err: any) {
      addToast('error', err.response?.data?.message || 'Erro ao processar a operação.');
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
          <Users className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Usuários
            </h1>
            <p className="text-sm text-slate-500">
              {total} usuário(s)
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={18} /> Novo Usuário
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
            placeholder="Buscar por nome ou email..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Todos os Papéis</option>
          <option value="ADMIN">Admin</option>
          <option value="FUNCIONARIO">Funcionário</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700/50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                Nome
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                Email
              </th>
              <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                Papel
              </th>
              <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                Status
              </th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map((u) => (
              <tr
                key={u.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-xs">
                        {u.nome.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-200 text-sm">
                      {u.nome}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-slate-500">
                  {u.email}
                </td>
                <td className="px-6 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {u.role === 'ADMIN' ? (
                      <ShieldCheck size={14} className="text-purple-500" />
                    ) : (
                      <ShieldAlert size={14} className="text-blue-400" />
                    )}
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                          : 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {u.role === 'ADMIN' ? 'Admin' : 'Funcionário'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      u.ativo ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${u.ativo ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {u.email === 'admin@email.com' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                        <ShieldCheck size={14} /> Protegido
                      </span>
                    ) : u.ativo ? (
                      <button
                        onClick={() => setConfirmAction({ user: u, action: 'desativar' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-700"
                        title="Desativar usuário"
                      >
                        <XCircle size={14} /> Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmAction({ user: u, action: 'reativar' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-200 dark:border-emerald-700"
                        title="Reativar usuário"
                      >
                        <RefreshCw size={14} /> Reativar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-sm">
            Nenhum usuário encontrado
          </div>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
      />

      {/* Confirm Deactivate/Reactivate Modal */}
      <ConfirmModal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleToggleAtivo}
        title={confirmAction?.action === 'desativar' ? 'Desativar Usuário' : 'Reativar Usuário'}
        message={confirmAction?.action === 'desativar'
          ? `Tem certeza que deseja desativar "${confirmAction?.user.nome}"? O usuário não poderá mais acessar o sistema.`
          : `Tem certeza que deseja reativar "${confirmAction?.user.nome}"?`
        }
        confirmLabel={confirmAction?.action === 'desativar' ? 'Desativar' : 'Reativar'}
        type={confirmAction?.action === 'desativar' ? 'danger' : 'success'}
      />

      {/* Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Usuário"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome completo
            </label>
            <input
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Ex: João da Silva"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="joao@empresa.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Senha temporária
            </label>
            <input
              type="password"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={4}
              placeholder="Mínimo 4 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tipo de acesso
            </label>
            <div className="flex gap-2">
              {[
                {
                  value: 'FUNCIONARIO',
                  label: 'Funcionário',
                  desc: 'Separação e devolução',
                  icon: ShieldAlert,
                },
                {
                  value: 'ADMIN',
                  label: 'Admin',
                  desc: 'Acesso completo',
                  icon: ShieldCheck,
                },
              ].map(({ value, label, desc, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    role === value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Icon size={18} className={role === value ? 'text-indigo-500' : 'text-slate-400'} />
                  <span className={`text-xs font-semibold ${role === value ? 'text-indigo-600' : 'text-slate-600 dark:text-slate-300'}`}>
                    {label}
                  </span>
                  <span className="text-xs text-slate-400">{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Criar Usuário
          </button>
        </form>
      </Modal>
    </div>
  );
}
