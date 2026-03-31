import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json; charset=utf-8',
  },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// =====================
// Equipment API
// =====================
export const equipmentApi = {
  getAll: (params?: { page?: number; limit?: number }) => api.get('/equipment', { params }),
  search: (q: string) => api.get(`/equipment/search?q=${encodeURIComponent(q)}`),
  create: (data: {
    nome: string;
    descricao: string;
    quantidadeTotal: number;
    origem?: string;
    fornecedor?: string;
  }) => api.post('/equipment', data),
  update: (id: number, data: any) => api.patch(`/equipment/${id}`, data),
  deactivate: (id: number) => api.patch(`/equipment/${id}/desativar`),
};

// =====================
// Checklist API
// =====================
export const checklistApi = {
  getAll: (params?: { page?: number; limit?: number }) => api.get('/checklist', { params }),
  getOne: (id: number) => api.get(`/checklist/${id}`),
  create: (nome: string, eventId: number) =>
    api.post('/checklist', { nome, eventId }),
  liberar: (id: number) => api.patch(`/checklist/${id}/liberar`),
  updateNome: (id: number, nome: string) => api.patch(`/checklist/${id}/nome`, { nome }),
  cancelar: (id: number, motivo: string) =>
    api.patch(`/checklist/${id}/cancelar`, { motivo }),
  clonar: (id: number, nomeNovo?: string) =>
    api.post(`/checklist/${id}/clonar`, { nomeNovo }),
  reativar: (id: number) => api.patch(`/checklist/${id}/reativar`),
  getAlertas: (id: number) => api.get(`/checklist/${id}/alertas`),
  vincularEvento: (id: number, eventId: number) =>
    api.patch(`/checklist/${id}/vincular-evento`, { eventId }),
};

// =====================
// Checklist Item API
// =====================
export const checklistItemApi = {
  getAll: () => api.get('/checklist-item'),
  create: (data: {
    checklistId: number;
    equipmentId: number;
    quantidadePlanejada: number;
    setor?: string;
  }) => api.post('/checklist-item', data),
  separar: (id: number, quantidadeSeparada: number) =>
    api.patch(`/checklist-item/${id}/separar`, { quantidadeSeparada }),
  devolver: (
    id: number,
    quantidadeOk: number,
    quantidadeDanificada: number,
    quantidadePerdida: number,
    observacao?: string
  ) => api.patch(`/checklist-item/${id}/devolver`, { quantidadeOk, quantidadeDanificada, quantidadePerdida, observacao }),
  aprovarTodos: (checklistId: number) =>
    api.post('/checklist-item/aprovar-todos', { checklistId }),
  update: (id: number, quantidadePlanejada: number) =>
    api.patch(`/checklist-item/${id}`, { quantidadePlanejada }),
  remove: (id: number) => api.delete(`/checklist-item/${id}`),
  trocar: (
    id: number,
    equipmentId: number,
    quantidadePlanejada: number
  ) =>
    api.patch(`/checklist-item/${id}/trocar`, {
      equipmentId,
      quantidadePlanejada,
    }),
  cancelarSeparacao: (id: number, quantidade: number) =>
    api.patch(`/checklist-item/${id}/cancelar-separacao`, { quantidade }),
};

// =====================
// Event API
// =====================
export const eventApi = {
  getAll: (params?: { page?: number; limit?: number }) => api.get('/event', { params }),
  getOne: (id: number) => api.get(`/event/${id}`),
  create: (data: any) => api.post('/event', data),
  update: (id: number, data: any) => api.patch(`/event/${id}`, data),
  finalizar: (id: number) => api.patch(`/event/${id}/finalizar`),
  addTeamMember: (eventId: number, data: { nome: string; funcao: string }) =>
    api.post(`/event/${eventId}/equipe`, data),
  getTeam: (eventId: number) => api.get(`/event/${eventId}/equipe`),
  updateTeamMember: (id: number, data: any) =>
    api.patch(`/event/event-team/${id}`, data),
  removeTeamMember: (id: number) => api.delete(`/event/event-team/${id}`),
  cancelar: (id: number, motivo: string) =>
    api.patch(`/event/${id}/cancelar`, { motivo }),
  clonar: (id: number) => api.post(`/event/${id}/clonar`),
};

// =====================
// Occurrence API
// =====================
export const occurrenceApi = {
  getAll: (params?: { page?: number; limit?: number }) => api.get('/equipment-occurrence', { params }),
  create: (data: {
    equipmentId: number;
    quantidade: number;
    eventId?: number;
    descricao?: string;
    tipo?: 'OK' | 'DANO' | 'PERDA';
  }) => api.post('/equipment-occurrence', data),
  confirmar: (id: number) =>
    api.patch(`/equipment-occurrence/${id}/confirmar`),
  editar: (id: number, data: { quantidade?: number; descricao?: string; tipo?: 'OK' | 'DANO' | 'PERDA'; equipmentId?: number }) =>
    api.patch(`/equipment-occurrence/${id}`, data),
  cancelar: (id: number) =>
    api.patch(`/equipment-occurrence/${id}/cancelar`),
};

// =====================
// User API
// =====================
export const userApi = {
  getAll: (params?: { page?: number; limit?: number }) => api.get('/user', { params }),
  create: (data: {
    nome: string;
    email: string;
    senha: string;
    role?: string;
  }) => api.post('/user', data),
};

// =====================
// Audit Log API
// =====================
export const auditLogApi = {
  getAll: (params?: {
    entity?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }) => api.get('/audit-log', { params }),
};

// =====================
// Dashboard API
// =====================
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};