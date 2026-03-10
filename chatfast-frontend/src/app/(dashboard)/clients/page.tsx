'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, ShieldOff, ShieldCheck, Trash2, Plus, X,
  User, Mail, Phone, Lock, Crown,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { clientsApi } from '@/lib/api';
import { formatRelativeTime, cn } from '@/lib/utils';
import type { User, ApiResponse, PaginatedResponse } from '@/types/api.types';

const PLAN_COLORS: Record<string, string> = {
  FREE:       'bg-[var(--border)]/50 text-[var(--fg-secondary)]',
  BASIC:      'bg-[var(--accent)]/10 text-[var(--accent)]',
  PREMIUM:    'bg-[var(--warning)]/10 text-[var(--warning)]',
  ENTERPRISE: 'bg-[var(--success)]/10 text-[var(--success)]',
};

// ─── Create Client Modal ───────────────────────────────────────────────────────

function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'CLIENT' as 'ADMIN' | 'OPERATOR' | 'CLIENT',
    plan: 'FREE' as 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
  });
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const create = useMutation({
    mutationFn: () => clientsApi.create({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || undefined,
      role: form.role,
      plan: form.plan,
    }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error?.message ?? 'Error al crear el cliente'),
  });

  const canSubmit = form.name.trim().length >= 2 && form.email.includes('@') && form.password.length >= 8;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--fg)]">Nuevo cliente</h3>
            <p className="text-[12px] text-[var(--fg-tertiary)] mt-0.5">Crea una cuenta de acceso al sistema</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--border)]/40 text-[var(--fg-tertiary)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Name */}
          <div className="relative">
            <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              value={form.name}
              onChange={set('name')}
              placeholder="Nombre completo"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {/* Email */}
          <div className="relative">
            <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="correo@empresa.com"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="Contraseña (mín. 8 caracteres)"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {/* Phone */}
          <div className="relative">
            <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              value={form.phone}
              onChange={set('phone')}
              placeholder="Teléfono (opcional)"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {/* Role + Plan */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[var(--fg-tertiary)]">Rol</label>
              <select
                value={form.role}
                onChange={set('role')}
                className="h-9 px-2 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] outline-none focus:border-[var(--accent)]/60"
              >
                <option value="CLIENT">Cliente</option>
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[var(--fg-tertiary)]">Plan</label>
              <select
                value={form.plan}
                onChange={set('plan')}
                className="h-9 px-2 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] outline-none focus:border-[var(--accent)]/60"
              >
                <option value="FREE">Free</option>
                <option value="BASIC">Basic</option>
                <option value="PREMIUM">Premium</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-[var(--destructive)] bg-[var(--destructive)]/8 rounded-[8px] px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              className="flex-1"
              loading={create.isPending}
              disabled={!canSubmit}
              onClick={() => create.mutate()}
            >
              Crear cliente
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Edit Client Modal ─────────────────────────────────────────────────────────

function EditClientModal({ client, onClose, onSaved }: { client: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: client.name,
    email: client.email,
    phone: client.phone ?? '',
    role: client.role as 'ADMIN' | 'OPERATOR' | 'CLIENT',
    plan: client.plan as 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
    password: '',
  });
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const update = useMutation({
    mutationFn: () => clientsApi.update(client.id, {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      plan: form.plan,
      ...(form.password ? { password: form.password } : {}),
    }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error?.message ?? 'Error al actualizar'),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--fg)]">Editar cliente</h3>
            <p className="text-[12px] text-[var(--fg-tertiary)] mt-0.5">{client.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--border)]/40 text-[var(--fg-tertiary)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input value={form.name} onChange={set('name')} placeholder="Nombre"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors" />
          </div>
          <div className="relative">
            <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input type="email" value={form.email} onChange={set('email')} placeholder="Email"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors" />
          </div>
          <div className="relative">
            <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input value={form.phone} onChange={set('phone')} placeholder="Teléfono (opcional)"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors" />
          </div>
          <div className="relative">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input type="password" value={form.password} onChange={set('password')} placeholder="Nueva contraseña (dejar vacío para no cambiar)"
              className="w-full h-10 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[var(--fg-tertiary)]">Rol</label>
              <select value={form.role} onChange={set('role')}
                className="h-9 px-2 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] outline-none focus:border-[var(--accent)]/60">
                <option value="CLIENT">Cliente</option>
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[var(--fg-tertiary)]">Plan</label>
              <select value={form.plan} onChange={set('plan')}
                className="h-9 px-2 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] outline-none focus:border-[var(--accent)]/60">
                <option value="FREE">Free</option>
                <option value="BASIC">Basic</option>
                <option value="PREMIUM">Premium</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
          </div>
          {error && (
            <p className="text-[12px] text-[var(--destructive)] bg-[var(--destructive)]/8 rounded-[8px] px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" loading={update.isPending} onClick={() => update.mutate()}>Guardar cambios</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['clients', page, search],
    queryFn: async () => {
      const { data } = await clientsApi.list({ page, limit: 15, search: search || undefined });
      return (data as ApiResponse<PaginatedResponse<User>>).data;
    },
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const suspend = useMutation({
    mutationFn: (id: string) => clientsApi.suspend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => clientsApi.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => { setConfirmDelete(null); qc.invalidateQueries({ queryKey: ['clients'] }); },
  });

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="Buscar cliente…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            icon={<Search size={14} />}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['clients'] })}>
          <RefreshCw size={13} /> Actualizar
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> Nuevo cliente
        </Button>
      </div>

      <Card padding="none">
        {isLoading ? (
          <PageSpinner />
        ) : isError ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-[13px] text-[var(--destructive)] font-medium">Error al cargar clientes</p>
            <p className="text-[12px] text-[var(--fg-tertiary)] font-mono bg-[var(--bg)] px-3 py-2 rounded-[8px] max-w-md mx-auto break-all">
              {(error as any)?.response?.data?.error?.message
                ?? (error as any)?.response?.status
                  ? `HTTP ${(error as any).response.status}: ${JSON.stringify((error as any).response.data)}`
                  : (error as any)?.message
                ?? 'Sin conexión con el backend'}
            </p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Cliente', 'Email', 'Teléfono', 'Plan', 'Instancias', 'Estado', 'Creado', 'Acciones'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((client, i) => (
                  <motion.tr
                    key={client.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-[var(--border)]/50 hover:bg-[var(--bg)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[var(--border)] flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-semibold text-[var(--fg-secondary)]">
                            {client.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-[var(--fg)]">{client.name}</p>
                          {client.role !== 'CLIENT' && (
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              client.role === 'ADMIN' ? 'bg-[var(--destructive)]/10 text-[var(--destructive)]' : 'bg-[var(--warning)]/10 text-[var(--warning)]',
                            )}>
                              {client.role}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-secondary)]">{client.email}</td>
                    <td className="px-4 py-3 text-[var(--fg-secondary)] font-mono text-[12px]">
                      {client.phone ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${PLAN_COLORS[client.plan] ?? ''}`}>
                        {client.plan === 'ENTERPRISE' && <Crown size={10} />}
                        {client.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-secondary)]">
                      {client._count?.instances ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={client.suspended ? 'error' : client.active ? 'success' : 'neutral'}
                        dot
                      >
                        {client.suspended ? 'Suspendido' : client.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--fg-tertiary)]">
                      {formatRelativeTime(client.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setEditClient(client)}
                          title="Editar"
                        >
                          <User size={13} className="text-[var(--accent)]" />
                        </Button>
                        {client.suspended ? (
                          <Button variant="ghost" size="sm" onClick={() => reactivate.mutate(client.id)}
                            loading={reactivate.isPending} title="Reactivar">
                            <ShieldCheck size={13} className="text-[var(--success)]" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => suspend.mutate(client.id)}
                            loading={suspend.isPending} title="Suspender">
                            <ShieldOff size={13} className="text-[var(--warning)]" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(client.id)} title="Eliminar">
                          <Trash2 size={13} className="text-[var(--destructive)]" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <User size={24} className="text-[var(--fg-tertiary)]" />
                        <p className="text-[13px] text-[var(--fg-tertiary)]">No hay clientes registrados</p>
                        <button onClick={() => setCreateOpen(true)}
                          className="text-[13px] text-[var(--accent)] hover:underline mt-1">
                          Crear el primero
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {data && data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
                <span className="text-[12px] text-[var(--fg-tertiary)]">
                  {data.pagination.total} clientes · pág. {page}/{data.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={!data.pagination.hasPrevPage} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                  <Button variant="secondary" size="sm" disabled={!data.pagination.hasNextPage} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <AnimatePresence>
        {createOpen && (
          <CreateClientModal
            key="create"
            onClose={() => setCreateOpen(false)}
            onCreated={() => qc.invalidateQueries({ queryKey: ['clients'] })}
          />
        )}
        {editClient && (
          <EditClientModal
            key="edit"
            client={editClient}
            onClose={() => setEditClient(null)}
            onSaved={() => qc.invalidateQueries({ queryKey: ['clients'] })}
          />
        )}
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
            >
              <h3 className="text-[16px] font-semibold text-[var(--fg)] mb-2">Eliminar cliente</h3>
              <p className="text-[13px] text-[var(--fg-secondary)] mb-5">
                Esta acción es permanente. Se eliminarán todas las instancias asociadas.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
                <Button variant="destructive" className="flex-1" loading={remove.isPending}
                  onClick={() => remove.mutate(confirmDelete)}>Eliminar</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
