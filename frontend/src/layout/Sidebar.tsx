import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Calendar,
  AlertTriangle,
  Users,
  ChevronLeft,
  ScrollText,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/equipamentos', label: 'Equipamentos', icon: Package },
  { to: '/checklists', label: 'Checklists', icon: ClipboardList },
  { to: '/eventos', label: 'Eventos', icon: Calendar },
  { to: '/ocorrencias', label: 'Ocorrências', icon: AlertTriangle },
];

const adminItems = [
  { to: '/usuarios', label: 'Usuários', icon: Users },
  { to: '/logs', label: 'Logs', icon: ScrollText },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const items = isAdmin ? [...navItems, ...adminItems] : navItems;

  return (
    <aside
      className={`${collapsed ? 'w-[72px]' : 'w-[260px]'
        } h-screen bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 ease-in-out`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="font-bold text-slate-800 dark:text-white text-lg">
              Flipe
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-sm">F</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                size={20}
                className={
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }
              />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all"
        >
          <ChevronLeft
            size={18}
            className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''
              }`}
          />
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}