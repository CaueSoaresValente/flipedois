import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
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
  getAll: () => api.get('/equipment'),
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
  getAll: () => api.get('/checklist'),
  getOne: (id: number) => api.get(`/checklist/${id}`),
  create: (nome: string) => api.post('/checklist', { nome }),
  liberar: (id: number) => api.patch(`/checklist/${id}/liberar`),
  cancelar: (id: number, motivo: string) =>
    api.patch(`/checklist/${id}/cancelar`, { motivo }),
  clonar: (id: number) => api.post(`/checklist/${id}/clonar`),
  getAlertas: (id: number) => api.get(`/checklist/${id}/alertas`),
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
    quantidade: number,
    situacao: 'ok' | 'quebrado' | 'perdido'
  ) => api.patch(`/checklist-item/${id}/devolver`, { quantidade, situacao }),
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
  getAll: () => api.get('/event'),
  getOne: (id: number) => api.get(`/event/${id}`),
  create: (data: any) => api.post('/event', data),
  addTeamMember: (eventId: number, data: { nome: string; funcao: string }) =>
    api.post(`/event/${eventId}/equipe`, data),
  getTeam: (eventId: number) => api.get(`/event/${eventId}/equipe`),
  updateTeamMember: (id: number, data: any) =>
    api.patch(`/event/event-team/${id}`, data),
  removeTeamMember: (id: number) => api.delete(`/event/event-team/${id}`),
};

// =====================
// Occurrence API
// =====================
export const occurrenceApi = {
  getAll: () => api.get('/equipment-occurrence'),
  create: (data: {
    equipmentId: number;
    quantidade: number;
    eventId?: number;
    descricao?: string;
    tipo?: string;
    motivo?: string;
  }) => api.post('/equipment-occurrence', data),
  confirmar: (id: number) =>
    api.patch(`/equipment-occurrence/${id}/confirmar`),
  cancelar: (id: number) =>
    api.patch(`/equipment-occurrence/${id}/cancelar`),
};

// =====================
// User API
// =====================
export const userApi = {
  getAll: () => api.get('/user'),
  create: (data: {
    nome: string;
    email: string;
    senha: string;
    role?: string;
  }) => api.post('/user', data),
};