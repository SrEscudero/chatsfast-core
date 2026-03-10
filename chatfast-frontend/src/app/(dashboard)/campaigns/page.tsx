'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Play, Pause, X, Trash2, Megaphone, Upload,
  CheckCircle, AlertCircle, Clock, BarChart2, ChevronDown,
  FileText, Users,
} from 'lucide-react';
import { campaignsApi, instancesApi } from '@/lib/api';
import { Campaign, CampaignStatus, Instance } from '@/types/api.types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner, PageSpinner } from '@/components/ui/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusColor(s: CampaignStatus) {
  switch (s) {
    case 'RUNNING':   return 'text-[var(--accent)] bg-[var(--accent)]/10';
    case 'COMPLETED': return 'text-[var(--success)] bg-[var(--success)]/10';
    case 'PAUSED':    return 'text-[var(--warning)] bg-[var(--warning)]/10';
    case 'CANCELLED': return 'text-[var(--destructive)] bg-[var(--destructive)]/10';
    case 'SCHEDULED': return 'text-purple-500 bg-purple-500/10';
    default:          return 'text-[var(--fg-tertiary)] bg-[var(--border)]';
  }
}

function statusLabel(s: CampaignStatus) {
  const map: Record<CampaignStatus, string> = {
    DRAFT: 'Borrador', SCHEDULED: 'Programada', RUNNING: 'Enviando',
    PAUSED: 'Pausada', COMPLETED: 'Completada', CANCELLED: 'Cancelada',
  };
  return map[s] ?? s;
}

function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  if (total === 0) return <div className="h-1.5 rounded-full bg-[var(--border)]" />;
  const sentPct   = Math.round((sent / total) * 100);
  const failedPct = Math.round((failed / total) * 100);
  return (
    <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden flex">
      <div style={{ width: `${sentPct}%` }} className="bg-[var(--success)] transition-all duration-500" />
      <div style={{ width: `${failedPct}%` }} className="bg-[var(--destructive)] transition-all duration-500" />
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

interface CreateForm {
  name: string;
  instanceId: string;
  message: string;
  delayMs: number;
  phones: string; // textarea: one per line
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateForm>({
    name: '', instanceId: '', message: '', delayMs: 1500, phones: '',
  });
  const [error, setError] = useState('');

  const { data: instData } = useQuery({
    queryKey: ['instances-mine'],
    queryFn: async () => {
      const res = await instancesApi.listMine({ limit: 100 });
      return res.data.data as { items: Instance[] };
    },
  });
  const connectedInstances = (instData?.items ?? []).filter(i => i.status === 'CONNECTED');

  const createMut = useMutation({
    mutationFn: async () => {
      const phones = form.phones
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => {
          const parts = line.split(',').map(p => p.trim());
          return { phone: parts[0], name: parts[1] ?? null };
        });

      if (!form.name.trim()) throw new Error('El nombre es requerido');
      if (!form.instanceId) throw new Error('Selecciona una instancia');
      if (!form.message.trim()) throw new Error('El mensaje es requerido');
      if (phones.length === 0) throw new Error('Agrega al menos un número');

      return campaignsApi.create({
        name: form.name.trim(),
        instanceId: form.instanceId,
        message: form.message.trim(),
        delayMs: form.delayMs,
        items: phones,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const phoneCount = form.phones.split('\n').filter(l => l.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg bg-[var(--bg-elevated)] rounded-[16px] border border-[var(--border)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
              <Megaphone size={14} className="text-[var(--accent)]" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--fg)]">Nueva campaña</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-[var(--border)]/50 text-[var(--fg-tertiary)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[var(--fg-secondary)]">Nombre de la campaña</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Promo Marzo 2026"
              className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {/* Instance selector */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[var(--fg-secondary)]">Instancia</label>
            <div className="relative">
              <select
                value={form.instanceId}
                onChange={e => setForm(f => ({ ...f, instanceId: e.target.value }))}
                className="w-full px-3 py-2 pr-8 text-[13.5px] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[var(--fg)] outline-none focus:border-[var(--accent)]/60 transition-colors appearance-none"
              >
                <option value="">Seleccionar instancia conectada...</option>
                {connectedInstances.map(i => (
                  <option key={i.id} value={i.id}>{i.name} {i.phoneNumber ? `(${i.phoneNumber})` : ''}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)] pointer-events-none" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[var(--fg-secondary)]">Mensaje</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Escribe el mensaje que se enviará a todos los contactos..."
              rows={4}
              className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors resize-none"
            />
          </div>

          {/* Delay */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-[var(--fg-secondary)]">Delay entre mensajes</label>
              <span className="text-[12px] text-[var(--accent)] font-medium">{(form.delayMs / 1000).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={500} max={10000} step={500}
              value={form.delayMs}
              onChange={e => setForm(f => ({ ...f, delayMs: Number(e.target.value) }))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--fg-tertiary)]">
              <span>0.5s (rápido)</span>
              <span>10s (seguro)</span>
            </div>
          </div>

          {/* Phones */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-[var(--fg-secondary)]">
                Destinatarios
              </label>
              {phoneCount > 0 && (
                <span className="text-[12px] text-[var(--accent)] font-medium flex items-center gap-1">
                  <Users size={11} />
                  {phoneCount} contacto{phoneCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <textarea
              value={form.phones}
              onChange={e => setForm(f => ({ ...f, phones: e.target.value }))}
              placeholder={"Un número por línea. Formato:\n5215512345678\n5215598765432,Juan Pérez\n5215500000001,María García"}
              rows={6}
              className="w-full px-3 py-2 text-[13px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] placeholder:font-sans outline-none focus:border-[var(--accent)]/60 transition-colors resize-none"
            />
            <p className="text-[11px] text-[var(--fg-tertiary)]">
              Formato: <code className="text-[var(--accent)]">número</code> o <code className="text-[var(--accent)]">número,nombre</code> — un contacto por línea
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] bg-[var(--destructive)]/8 border border-[var(--destructive)]/20">
              <AlertCircle size={13} className="text-[var(--destructive)] flex-shrink-0" />
              <p className="text-[12.5px] text-[var(--destructive)]">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? <Spinner className="w-3.5 h-3.5 mr-1.5" /> : null}
            Crear campaña
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const launchMut  = useMutation({ mutationFn: () => campaignsApi.launch(campaign.id),  onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }) });
  const pauseMut   = useMutation({ mutationFn: () => campaignsApi.pause(campaign.id),   onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }) });
  const cancelMut  = useMutation({ mutationFn: () => campaignsApi.cancel(campaign.id),  onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }) });
  const deleteMut  = useMutation({ mutationFn: () => campaignsApi.delete(campaign.id),  onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }) });

  const canLaunch  = ['DRAFT', 'PAUSED', 'SCHEDULED'].includes(campaign.status);
  const canPause   = campaign.status === 'RUNNING';
  const canCancel  = ['RUNNING', 'PAUSED', 'SCHEDULED'].includes(campaign.status);
  const canDelete  = ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(campaign.status);

  const completedPct = campaign.totalCount > 0
    ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.totalCount) * 100)
    : 0;

  return (
    <motion.div
      layout
      className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[12px] overflow-hidden"
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <h3 className="text-[14px] font-semibold text-[var(--fg)] truncate">{campaign.name}</h3>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', statusColor(campaign.status))}>
                {statusLabel(campaign.status)}
              </span>
            </div>
            <p className="text-[12px] text-[var(--fg-tertiary)]">
              {campaign.instance?.name ?? '—'} · Creada {fmtDate(campaign.createdAt)}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {canLaunch && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => launchMut.mutate()}
                disabled={launchMut.isPending}
                title="Iniciar campaña"
                className="w-8 h-8 rounded-[8px] bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 flex items-center justify-center transition-colors"
              >
                {launchMut.isPending ? <Spinner className="w-3.5 h-3.5" /> : <Play size={14} />}
              </motion.button>
            )}
            {canPause && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => pauseMut.mutate()}
                disabled={pauseMut.isPending}
                title="Pausar campaña"
                className="w-8 h-8 rounded-[8px] bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/20 flex items-center justify-center transition-colors"
              >
                {pauseMut.isPending ? <Spinner className="w-3.5 h-3.5" /> : <Pause size={14} />}
              </motion.button>
            )}
            {canCancel && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                title="Cancelar campaña"
                className="w-8 h-8 rounded-[8px] bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20 flex items-center justify-center transition-colors"
              >
                {cancelMut.isPending ? <Spinner className="w-3.5 h-3.5" /> : <X size={14} />}
              </motion.button>
            )}
            {canDelete && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => { if (confirm('¿Eliminar esta campaña?')) deleteMut.mutate(); }}
                disabled={deleteMut.isPending}
                title="Eliminar campaña"
                className="w-8 h-8 rounded-[8px] text-[var(--fg-tertiary)] hover:bg-[var(--border)]/50 hover:text-[var(--destructive)] flex items-center justify-center transition-colors"
              >
                {deleteMut.isPending ? <Spinner className="w-3.5 h-3.5" /> : <Trash2 size={14} />}
              </motion.button>
            )}
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-8 h-8 rounded-[8px] text-[var(--fg-tertiary)] hover:bg-[var(--border)]/50 flex items-center justify-center transition-colors"
            >
              <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4 space-y-2">
          <ProgressBar sent={campaign.sentCount} failed={campaign.failedCount} total={campaign.totalCount} />
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[var(--success)]">
                <CheckCircle size={10} />
                {campaign.sentCount} enviados
              </span>
              {campaign.failedCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--destructive)]">
                  <AlertCircle size={10} />
                  {campaign.failedCount} fallidos
                </span>
              )}
              <span className="text-[var(--fg-tertiary)]">
                <Clock size={10} className="inline mr-0.5" />
                {campaign.totalCount - campaign.sentCount - campaign.failedCount} pendientes
              </span>
            </div>
            <span className="font-semibold text-[var(--fg-secondary)]">{completedPct}%</span>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--border)]"
          >
            <div className="px-5 py-4 space-y-3">
              {/* Message preview */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={10} />
                  Mensaje
                </p>
                <div className="px-3 py-2.5 bg-[var(--bg)] rounded-[8px] border border-[var(--border)]">
                  <p className="text-[13px] text-[var(--fg)] leading-relaxed whitespace-pre-wrap">{campaign.message}</p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="px-3 py-2.5 bg-[var(--bg)] rounded-[8px] border border-[var(--border)] text-center">
                  <p className="text-[18px] font-bold text-[var(--fg)]">{campaign.totalCount}</p>
                  <p className="text-[11px] text-[var(--fg-tertiary)] mt-0.5">Total</p>
                </div>
                <div className="px-3 py-2.5 bg-[var(--success)]/6 rounded-[8px] border border-[var(--success)]/20 text-center">
                  <p className="text-[18px] font-bold text-[var(--success)]">{campaign.sentCount}</p>
                  <p className="text-[11px] text-[var(--success)]/70 mt-0.5">Enviados</p>
                </div>
                <div className="px-3 py-2.5 bg-[var(--destructive)]/6 rounded-[8px] border border-[var(--destructive)]/20 text-center">
                  <p className="text-[18px] font-bold text-[var(--destructive)]">{campaign.failedCount}</p>
                  <p className="text-[11px] text-[var(--destructive)]/70 mt-0.5">Fallidos</p>
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-4 text-[11px] text-[var(--fg-tertiary)]">
                {campaign.startedAt   && <span>Iniciada: {fmtDate(campaign.startedAt)}</span>}
                {campaign.completedAt && <span>Completada: {fmtDate(campaign.completedAt)}</span>}
                <span>Delay: {(campaign.delayMs / 1000).toFixed(1)}s entre mensajes</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'ALL'>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await campaignsApi.list({ limit: 50 });
      return res.data.data as { items: Campaign[] };
    },
    refetchInterval: 5_000,
  });

  const campaigns = (data?.items ?? []).filter(c =>
    statusFilter === 'ALL' ? true : c.status === statusFilter,
  );

  const counts = (data?.items ?? []).reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalItems = data?.items ?? [];

  const STATUS_FILTERS: Array<{ value: CampaignStatus | 'ALL'; label: string }> = [
    { value: 'ALL',       label: `Todas (${totalItems.length})` },
    { value: 'RUNNING',   label: `Enviando (${counts.RUNNING ?? 0})` },
    { value: 'PAUSED',    label: `Pausadas (${counts.PAUSED ?? 0})` },
    { value: 'DRAFT',     label: `Borrador (${counts.DRAFT ?? 0})` },
    { value: 'COMPLETED', label: `Completadas (${counts.COMPLETED ?? 0})` },
    { value: 'CANCELLED', label: `Canceladas (${counts.CANCELLED ?? 0})` },
  ];

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--fg)]">Campañas</h2>
            <p className="text-[13px] text-[var(--fg-tertiary)] mt-0.5">
              {totalItems.length} campaña{totalItems.length !== 1 ? 's' : ''} en total
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} className="mr-1.5" />
            Nueva campaña
          </Button>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors',
                statusFilter === f.value
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--border)]/40',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <PageSpinner />
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--border)]/50 flex items-center justify-center">
              <Megaphone size={22} className="text-[var(--fg-tertiary)]" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[var(--fg)]">
                {statusFilter === 'ALL' ? 'No hay campañas' : `No hay campañas ${statusFilter.toLowerCase()}`}
              </p>
              <p className="text-[13px] text-[var(--fg-tertiary)] mt-1">
                {statusFilter === 'ALL' ? 'Crea tu primera campaña de mensajería masiva' : 'Prueba otro filtro'}
              </p>
            </div>
            {statusFilter === 'ALL' && (
              <Button size="sm" onClick={() => setShowCreate(true)} className="mt-2">
                <Plus size={13} className="mr-1.5" />
                Crear campaña
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {campaigns.map(c => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </>
  );
}
