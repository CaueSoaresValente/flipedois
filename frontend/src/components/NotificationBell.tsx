import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Package, PackagePlus, PackageMinus, Trash2, X, AlertCircle } from 'lucide-react';
import { notificationApi } from '../services/api';
import Modal from './Modal'; // Assumindo que o componente Modal existe no mesmo diretório ou global

interface Notification {
  id: number;
  tipo: string;
  mensagem: string;
  checklistNome?: string;
  equipmentNome?: string;
  quantidadeAnterior?: number;
  quantidadeNova?: number;
  lida: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin}min`;
  if (diffHour < 24) return `há ${diffHour}h`;
  if (diffDay < 7) return `há ${diffDay}d`;
  return date.toLocaleDateString('pt-BR');
}

function getNotificationIcon(tipo: string, size = 16) {
  switch (tipo) {
    case 'QUANTIDADE_AUMENTADA':
      return <PackagePlus size={size} className="text-blue-500" />;
    case 'QUANTIDADE_DIMINUIDA':
      return <PackageMinus size={size} className="text-amber-500" />;
    case 'EQUIPAMENTO_REMOVIDO':
      return <Trash2 size={size} className="text-red-500" />;
    case 'EQUIPAMENTO_ADICIONADO':
      return <Package size={size} className="text-emerald-500" />;
    default:
      return <Bell size={size} className="text-slate-500" />;
  }
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Estado para a fila de popups urgentes
  const [popupQueue, setPopupQueue] = useState<Notification[]>([]);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastUnreadCount = useRef<number | null>(null);
  const seenIds = useRef<Set<number>>(new Set());

  // Buscar contagem e detectar novas para o popup
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationApi.getUnreadCount();
      const newCount = res.data.count;
      setUnreadCount(newCount);

      // Se o count subiu, buscamos as novas para jogar na fila de popups
      if (lastUnreadCount.current !== null && newCount > lastUnreadCount.current) {
        const notifRes = await notificationApi.getAll({ limit: 10 });
        const latest: Notification[] = notifRes.data.data;
        
        // Filtra apenas as que realmente não vimos ainda nesta sessão e que não estão lidas
        const news = latest.filter(n => !n.lida && !seenIds.current.has(n.id));
        
        if (news.length > 0) {
          setPopupQueue(prev => {
            // Evita duplicatas na fila
            const existingIds = new Set(prev.map(p => p.id));
            const uniqueNews = news.filter(n => !existingIds.has(n.id));
            return [...prev, ...uniqueNews];
          });
          
          // Adiciona aos vistos para não repetir no próximo poll
          news.forEach(n => seenIds.current.add(n.id));

          // Dispara evento global para que as páginas atualizem seus dados
          window.dispatchEvent(new CustomEvent('data-updated'));
        }
      }

      lastUnreadCount.current = newCount;
    } catch {
      // ignore
    }
  }, []);

  // Polling a cada 5 segundos para popups rápidos
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 5000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationApi.getAll({ limit: 30 });
      setNotifications(res.data.data);
      res.data.data.forEach((n: Notification) => seenIds.current.add(n.id));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
      // Remove da fila de popup se estiver lá
      setPopupQueue(prev => prev.filter(p => p.id !== id));
    } catch { /* ignore */ }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
      setUnreadCount(0);
      setPopupQueue([]);
    } catch { /* ignore */ }
  };

  // Pega a primeira notificação da fila para exibir no modal
  const currentPopup = popupQueue.length > 0 ? popupQueue[0] : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
      >
        <Bell size={18} className={unreadCount > 0 ? 'animate-[bellShake_0.5s_infinite_alternate]' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Modal de Alerta Interruptivo */}
      {currentPopup && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} className="text-amber-600 dark:text-amber-400" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                Alteração no Checklist
              </h3>
              
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 mb-6 border border-slate-100 dark:border-slate-600">
                <div className="flex justify-center mb-3">
                  {getNotificationIcon(currentPopup.tipo, 24)}
                </div>
                <p className="text-slate-700 dark:text-slate-200 font-medium">
                  {currentPopup.mensagem}
                </p>
              </div>

              <button
                onClick={() => handleMarkAsRead(currentPopup.id)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                Entendido, ciente da alteração
              </button>
              
              {popupQueue.length > 1 && (
                <p className="text-xs text-slate-400 mt-4">
                  Há mais {popupQueue.length - 1} alteração(ões) pendente(s)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dropdown de Histórico (Mantido para consulta) */}
      {open && (
        <div className="absolute right-0 top-12 w-[380px] max-h-[480px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700">
            <span className="text-sm font-bold dark:text-white">Notificações</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} className="text-xs text-indigo-600 font-medium">
                Ler todas
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">Vazio</div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-3 border-b dark:border-slate-700/50 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer ${!n.lida ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                  onClick={() => !n.lida && handleMarkAsRead(n.id)}
                >
                  <div className="mt-1">{getNotificationIcon(n.tipo)}</div>
                  <div className="flex-1">
                    <p className={`text-xs ${!n.lida ? 'font-bold dark:text-white' : 'text-slate-500'}`}>{n.mensagem}</p>
                    <span className="text-[10px] text-slate-400">{timeAgo(n.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bellShake {
          0% { transform: rotate(0); }
          20% { transform: rotate(10deg); }
          40% { transform: rotate(-10deg); }
          60% { transform: rotate(5deg); }
          80% { transform: rotate(-5deg); }
          100% { transform: rotate(0); }
        }
      `}</style>
    </div>
  );
}
