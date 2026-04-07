import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(email, senha);
      navigate('/dashboard');
    } catch {
      setError('E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        {/* Main gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A237E]/90 via-[#0D47A1]/60 to-[#0a1628]" />
        {/* Accent glow - top right */}
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-[#00BCD4]/15 rounded-full blur-[120px]" />
        {/* Accent glow - bottom left */}
        <div className="absolute -bottom-48 -left-48 w-[600px] h-[600px] bg-[#1A237E]/30 rounded-full blur-[120px]" />
        {/* Orange accent - subtle center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#FF8C00]/5 rounded-full blur-[100px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-[440px] mx-4">
        {/* Glass Card */}
        <div className="backdrop-blur-2xl bg-white/[0.07] border border-white/[0.12] rounded-3xl shadow-2xl shadow-black/30 p-10">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-[#1A237E] via-[#0D47A1] to-[#00BCD4] rounded-2xl flex items-center justify-center shadow-xl shadow-[#1A237E]/40 rotate-3 hover:rotate-0 transition-transform duration-500">
                <span className="text-4xl font-black text-white tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>F</span>
              </div>
              {/* Orange accent dot */}
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF8C00] rounded-full shadow-lg shadow-[#FF8C00]/40 animate-pulse" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black text-white tracking-tight">
                Flipe
              </h1>
              <p className="text-[#00BCD4]/80 text-sm mt-1 font-medium tracking-wide uppercase">
                Gestão de Eventos
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-500/15 border border-red-500/25 rounded-xl text-red-300 text-sm text-center font-medium">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="block text-white/60 text-xs mb-2 font-semibold uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                className="w-full p-3.5 rounded-xl bg-white/[0.06] text-white placeholder-white/30 outline-none border border-white/[0.1] focus:border-[#00BCD4]/60 focus:ring-2 focus:ring-[#00BCD4]/20 focus:bg-white/[0.08] transition-all duration-300 text-sm"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-xs mb-2 font-semibold uppercase tracking-wider">
                Senha
              </label>
              <input
                type="password"
                className="w-full p-3.5 rounded-xl bg-white/[0.06] text-white placeholder-white/30 outline-none border border-white/[0.1] focus:border-[#00BCD4]/60 focus:ring-2 focus:ring-[#00BCD4]/20 focus:bg-white/[0.08] transition-all duration-300 text-sm"
                placeholder="••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-3 bg-gradient-to-r from-[#FF8C00] to-[#FF6D00] text-white font-bold p-3.5 rounded-xl hover:from-[#FF9800] hover:to-[#FF8C00] hover:shadow-xl hover:shadow-[#FF8C00]/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none text-sm uppercase tracking-wider"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <p className="text-center text-white/20 text-xs font-medium">
              © 2026 Flipe Eventos - Gestão Profissional
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
