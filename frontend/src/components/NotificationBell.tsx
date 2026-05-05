import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, Package, PackagePlus, PackageMinus, Trash2, X, AlertCircle, Clock, ChevronRight, Calendar, XCircle } from 'lucide-react';
import { notificationApi } from '../services/api';
import { io, Socket } from 'socket.io-client';

interface Notification {
  id: number;
  tipo: string;
  mensagem: string;
  checklistId?: number;
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

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    case 'EVENTO_LIBERADO':
      return <Calendar size={size} className="text-indigo-500" />;
    case 'EVENTO_CANCELADO':
      return <XCircle size={size} className="text-red-500" />;
    case 'EVENTO_FINALIZADO':
      return <CheckCheck size={size} className="text-emerald-500" />;
    default:
      return <Bell size={size} className="text-slate-500" />;
  }
}

function getNotificationColor(tipo: string) {
  switch (tipo) {
    case 'QUANTIDADE_AUMENTADA':
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300', label: 'Quantidade Aumentada' };
    case 'QUANTIDADE_DIMINUIDA':
      return { bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-300', label: 'Quantidade Diminuída' };
    case 'EQUIPAMENTO_REMOVIDO':
      return { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-300', label: 'Equipamento Removido' };
    case 'EQUIPAMENTO_ADICIONADO':
      return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300', label: 'Equipamento Adicionado' };
    case 'EVENTO_LIBERADO':
      return { bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-300 dark:border-indigo-700', text: 'text-indigo-700 dark:text-indigo-300', label: 'Evento Liberado' };
    case 'EVENTO_CANCELADO':
      return { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-300', label: 'Evento Cancelado' };
    case 'EVENTO_FINALIZADO':
      return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300', label: 'Evento Finalizado' };
    default:
      return { bg: 'bg-slate-100 dark:bg-slate-700', border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-700 dark:text-slate-300', label: 'Alteração' };
  }
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Detail modal state
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  
  // Popup queue for real-time alerts
  const [popupQueue, setPopupQueue] = useState<Notification[]>([]);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Get userId from JWT token stored in sessionStorage
  const getUserId = (): number | null => {
    try {
      const token = sessionStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub ?? null;
    } catch {
      return null;
    }
  };

  // Fetch the real unread count from the server (source of truth)
  const syncUnreadCount = useCallback(async () => {
    try {
      const res = await notificationApi.getUnreadCount();
      setUnreadCount(res.data.count);
    } catch {
      // ignore
    }
  }, []);

  // Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationApi.getAll({ limit: 50 });
      setNotifications(res.data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;

    const socket = io('http://localhost:3000', {
      query: { userId: String(userId) },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Re-sync unread count from server on every (re)connection
      syncUnreadCount();
    });

    socket.on('notification', (notif: Notification) => {
      // Add to notification list (prepend, avoid duplicates)
      setNotifications(prev => {
        if (prev.some(n => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });

      // Re-sync unread count from server (source of truth — no local math)
      syncUnreadCount();

      // Add to popup queue (show modal)
      setPopupQueue(prev => {
        if (prev.some(p => p.id === notif.id)) return prev;
        return [...prev, notif];
      });

      // Trigger global data refresh for all pages
      window.dispatchEvent(new CustomEvent('data-updated'));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [syncUnreadCount]);

  // Sync unread count on mount
  useEffect(() => {
    syncUnreadCount();
  }, [syncUnreadCount]);

  // Load notifications when dropdown opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
      syncUnreadCount();
    }
  }, [open, fetchNotifications, syncUnreadCount]);

  // Close dropdown on outside click
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
      // Re-sync from server instead of local math
      await syncUnreadCount();
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

  // Open notification detail
  const openDetail = (n: Notification) => {
    setSelectedNotification(n);
    if (!n.lida) handleMarkAsRead(n.id);
  };

  // Dismiss current popup and mark as read
  const dismissPopup = async () => {
    if (popupQueue.length > 0) {
      await handleMarkAsRead(popupQueue[0].id);
    }
  };

  const currentPopup = popupQueue.length > 0 ? popupQueue[0] : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
      >
        <Bell size={18} className={unreadCount > 0 ? 'animate-[bellShake_0.5s_infinite_alternate]' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Real-time Alert Popup */}
      {currentPopup && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in">
            <div className="p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} className="text-amber-600 dark:text-amber-400" />
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                Alteração no Checklist
              </h3>
              
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 mb-4 border border-slate-100 dark:border-slate-600">
                <div className="flex justify-center mb-3">
                  {getNotificationIcon(currentPopup.tipo, 24)}
                </div>
                <p className="text-slate-700 dark:text-slate-200 font-medium text-sm">
                  {currentPopup.mensagem}
                </p>
                {currentPopup.checklistNome && (
                  <p className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1">
                    <Clock size={11} /> {timeAgo(currentPopup.createdAt)}
                  </p>
                )}
              </div>

              <button
                onClick={dismissPopup}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                Entendido
              </button>
              
              {popupQueue.length > 1 && (
                <p className="text-xs text-slate-400 mt-3">
                  +{popupQueue.length - 1} alteração(ões) pendente(s)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <div 
          className="fixed inset-0 z-[998] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setSelectedNotification(null)}
        >
          <div 
            className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 flex items-center justify-between border-b ${getNotificationColor(selectedNotification.tipo).bg} ${getNotificationColor(selectedNotification.tipo).border}`}>
              <div className="flex items-center gap-3">
                {getNotificationIcon(selectedNotification.tipo, 20)}
                <span className={`text-sm font-bold ${getNotificationColor(selectedNotification.tipo).text}`}>
                  {getNotificationColor(selectedNotification.tipo).label}
                </span>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-slate-800 dark:text-white font-medium leading-relaxed">
                {selectedNotification.mensagem}
              </p>

              {/* Metadata Cards */}
              <div className="grid grid-cols-2 gap-3">
                {selectedNotification.checklistNome && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Checklist</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{selectedNotification.checklistNome}</p>
                  </div>
                )}
                {selectedNotification.equipmentNome && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Equipamento</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{selectedNotification.equipmentNome}</p>
                  </div>
                )}
                {selectedNotification.quantidadeAnterior != null && selectedNotification.quantidadeNova != null && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Quantidade</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {selectedNotification.quantidadeAnterior} → {selectedNotification.quantidadeNova}
                    </p>
                  </div>
                )}
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-600">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">Data/Hora</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatFullDate(selectedNotification.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setSelectedNotification(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Dropdown */}
      {open && (
        <div className="absolute right-0 top-12 w-[400px] max-h-[520px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-indigo-500" />
              <span className="text-sm font-bold dark:text-white">Notificações</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                <CheckCheck size={13} /> Ler todas
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-3 border-indigo-500 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                Nenhuma notificação
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { openDetail(n); setOpen(false); }}
                  className={`w-full text-left p-3 border-b dark:border-slate-700/50 flex gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group ${
                    !n.lida ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{getNotificationIcon(n.tipo)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${!n.lida ? 'font-bold text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                      {n.mensagem}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Clock size={9} /> {timeAgo(n.createdAt)}
                      </span>
                      {!n.lida && (
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors mt-1 flex-shrink-0" />
                </button>
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
