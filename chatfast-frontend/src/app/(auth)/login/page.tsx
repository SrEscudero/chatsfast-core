'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Zap } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse, User } from '@/types/api.types';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      const res = data as ApiResponse<{ user: User; accessToken: string; refreshToken: string }>;
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      router.push('/overview');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? 'Credenciales incorrectas';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      {/* Background blur spheres — Apple vibe */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-[var(--accent)]/8 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-[var(--accent)]/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative w-full max-w-sm"
      >
        {/* Card */}
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-8 shadow-[var(--shadow-lg)]">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-[0_4px_12px_rgba(0,113,227,.3)]">
              <Zap size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-center">
              <h1 className="text-[22px] font-semibold text-[var(--fg)] tracking-tight">ChatFast</h1>
              <p className="text-[13px] text-[var(--fg-secondary)] mt-0.5">Inicia sesión en tu cuenta</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              placeholder="admin@chatfast.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={15} />}
              required
            />
            <Input
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={15} />}
              required
            />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[13px] text-[var(--destructive)] bg-[var(--destructive)]/8 rounded-[8px] px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </Button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[var(--fg-tertiary)] mt-5">
          ChatFast © {new Date().getFullYear()} — Kelvis Tech
        </p>
      </motion.div>
    </div>
  );
}
