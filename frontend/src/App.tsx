import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import PrivateRoute from './components/PrivateRoute';
import DashboardLayout from './layout/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Equipamentos from './pages/Equipamentos';
import Checklists from './pages/Checklists';
import Eventos from './pages/Eventos';
import Ocorrencias from './pages/Ocorrencias';
import Usuarios from './pages/Usuarios';
import Logs from './pages/Logs';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />

            <Route
              element={
                <PrivateRoute>
                  <DashboardLayout />
                </PrivateRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/equipamentos" element={<Equipamentos />} />
              <Route path="/checklists" element={<Checklists />} />
              <Route path="/eventos" element={<Eventos />} />
              <Route path="/ocorrencias" element={<Ocorrencias />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/logs" element={<Logs />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}