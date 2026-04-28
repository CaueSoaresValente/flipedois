import { useEffect, useRef } from 'react';

/**
 * Hook que faz auto-refresh de dados em intervalos regulares.
 * Também escuta o evento global 'data-updated' para refresh imediato
 * quando outra parte do sistema detecta mudanças (ex: NotificationBell).
 *
 * @param callback Função de carregamento de dados (ex: load())
 * @param intervalMs Intervalo em milissegundos (padrão 10s)
 */
export function useAutoRefresh(callback: () => void, intervalMs = 10000) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    // Polling regular
    const interval = setInterval(() => {
      callbackRef.current();
    }, intervalMs);

    // Escuta evento global disparado pelo NotificationBell ou outras ações
    function handleDataUpdated() {
      callbackRef.current();
    }

    window.addEventListener('data-updated', handleDataUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('data-updated', handleDataUpdated);
    };
  }, [intervalMs]);
}
