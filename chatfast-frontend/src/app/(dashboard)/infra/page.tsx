'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw, Square, Play, Cpu, MemoryStick, HardDrive,
  Trash2, Terminal, ChevronDown, ChevronRight, X,
  Network, Activity, Server, RefreshCw,
  ArrowDown, ArrowUp, Loader2, Database, Radio, Container,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { infraApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SystemMetrics, ContainerInfo, ApiResponse, InfraHealthStatus } from '@/types/api.types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// ─── Toast System ────────────────────────────────────────────────────────────

interface Toast { id: number; message: string; type: 'success' | 'error'; }
let toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  return { toasts, success: (m: string) => add(m, 'success'), error: (m: string) => add(m, 'error') };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            className={cn(
              'px-4 py-2.5 rounded-[10px] text-[13px] font-medium shadow-lg border backdrop-blur-sm',
              t.type === 'success'
                ? 'bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]'
                : 'bg-[var(--destructive)]/10 border-[var(--destructive)]/30 text-[var(--destructive)]',
            )}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const w = 120;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={height} className="overflow-visible opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Gauge Bar ────────────────────────────────────────────────────────────────

function GaugeBar({ value, label }: { value: number; label: string }) {
  const color = value > 85 ? 'var(--destructive)' : value > 65 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-[var(--fg-secondary)]">{label}</span>
        <span className="font-semibold" style={{ color }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="h-full rounded-full" style={{ background: color }}
        />
      </div>
    </div>
  );
}

// ─── Health Section ──────────────────────────────────────────────────────────

const SERVICE_ICONS: Record<string, typeof Database> = {
  'PostgreSQL': Database,
  'Evolution API': Radio,
  'Docker': Container,
};

function HealthSection() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['infra-health'],
    queryFn: async () => {
      const { data } = await infraApi.getHealth();
      return (data as ApiResponse<InfraHealthStatus>).data;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const overallColor = data?.overall === 'healthy'
    ? 'var(--success)' : data?.overall === 'degraded'
    ? 'var(--warning)' : 'var(--destructive)';

  const overallLabel = data?.overall === 'healthy'
    ? 'Todos los servicios operativos' : data?.overall === 'degraded'
    ? 'Algunos servicios con problemas' : 'Servicios caídos';

  const OverallIcon = data?.overall === 'healthy'
    ? CheckCircle2 : data?.overall === 'degraded'
    ? AlertTriangle : XCircle;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wide">Estado de servicios</h2>
        <button
          onClick={() => refetch()}
          className="p-1 rounded hover:bg-[var(--border)] transition-colors"
        >
          <RefreshCw size={12} className={cn('text-[var(--fg-tertiary)]', isFetching && 'animate-spin')} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <Card key={i}><div className="h-14 flex items-center justify-center"><Spinner /></div></Card>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Overall */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${overallColor} 15%, transparent)` }}>
                  <OverallIcon size={16} style={{ color: overallColor }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--fg)]">Sistema</p>
                  <p className="text-[11px]" style={{ color: overallColor }}>{overallLabel}</p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Per-service */}
          {data.services.map((svc, i) => {
            const Icon = SERVICE_ICONS[svc.name] ?? Server;
            const ok = svc.status === 'ok';
            const color = ok ? 'var(--success)' : 'var(--destructive)';
            return (
              <motion.div key={svc.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 1) * 0.04 }}>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
                      <Icon size={15} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--fg)]">{svc.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color }}>
                          {ok ? 'Operativo' : 'Error'}
                        </span>
                        <span className="text-[10px] text-[var(--fg-tertiary)] font-mono">{svc.latencyMs}ms</span>
                      </div>
                    </div>
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', ok ? 'bg-[var(--success)]' : 'bg-[var(--destructive)] animate-pulse')} />
                  </div>
                  {svc.error && (
                    <p className="mt-2 text-[10px] text-[var(--destructive)] font-mono truncate" title={svc.error}>
                      {svc.error}
                    </p>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Live Metrics Section ─────────────────────────────────────────────────────

const MAX_HISTORY = 40;

function MetricsSection() {
  const [metrics,    setMetrics]    = useState<SystemMetrics | null>(null);
  const [cpuHist,    setCpuHist]    = useState<number[]>([]);
  const [memHist,    setMemHist]    = useState<number[]>([]);
  const [live,       setLive]       = useState(true);
  const esRef = useRef<AbortController | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSSE = useCallback(() => {
    if (esRef.current) esRef.current.abort();
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    const ac = new AbortController();
    esRef.current = ac;

    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    fetch(`${BASE_URL}/infra/metrics/live`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ac.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done || ac.signal.aborted) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        let eventName = '';
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          if (line.startsWith('data:') && eventName === 'metrics') {
            try {
              const m: SystemMetrics = JSON.parse(line.slice(5));
              setMetrics(m);
              setCpuHist(h => [...h.slice(-MAX_HISTORY + 1), m.cpu.usagePercent]);
              setMemHist(h => [...h.slice(-MAX_HISTORY + 1), m.memory.usagePercent]);
            } catch { /* ignore parse error */ }
            eventName = '';
          }
        }
      }
      // Stream ended naturally — reconnect
      if (!ac.signal.aborted) {
        reconnectTimer.current = setTimeout(startSSE, 3000);
      }
    }).catch(() => {
      // SSE failed — reconnect after delay
      if (!ac.signal.aborted) {
        reconnectTimer.current = setTimeout(startSSE, 5000);
      }
    });
  }, []);

  useEffect(() => {
    if (live) startSSE();
    return () => {
      esRef.current?.abort();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [live, startSSE]);

  const toggle = () => setLive(v => !v);

  if (!metrics) return (
    <div className="grid grid-cols-3 gap-4">
      {[0, 1, 2].map(i => (
        <Card key={i}><div className="h-24 flex items-center justify-center"><Spinner /></div></Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wide">Recursos del sistema</h2>
        <button
          onClick={toggle}
          className={cn(
            'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors',
            live
              ? 'border-[var(--success)]/40 text-[var(--success)] bg-[var(--success)]/8'
              : 'border-[var(--border)] text-[var(--fg-tertiary)]',
          )}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--fg-tertiary)]')} />
          {live ? 'En vivo' : 'Pausado'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-[var(--accent)]" strokeWidth={1.8} />
                <span className="text-[13px] font-semibold text-[var(--fg)]">CPU</span>
              </div>
              <Sparkline data={cpuHist} color="var(--accent)" />
            </div>
            <GaugeBar value={metrics.cpu.usagePercent} label={metrics.cpu.brand} />
            <div className="mt-3 flex gap-4 text-[11px] text-[var(--fg-tertiary)]">
              <span>{metrics.cpu.cores} cores</span>
              <span>{metrics.cpu.speed} GHz</span>
            </div>
          </Card>
        </motion.div>

        {/* Memory */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MemoryStick size={14} className="text-[var(--accent)]" strokeWidth={1.8} />
                <span className="text-[13px] font-semibold text-[var(--fg)]">Memoria</span>
              </div>
              <Sparkline data={memHist} color="#8b5cf6" />
            </div>
            <GaugeBar value={metrics.memory.usagePercent} label={`${metrics.memory.usedGb} / ${metrics.memory.totalGb} GB`} />
            <div className="mt-3 text-[11px] text-[var(--fg-tertiary)]">{metrics.memory.freeGb} GB disponibles</div>
          </Card>
        </motion.div>

        {/* Disk */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <HardDrive size={14} className="text-[var(--accent)]" strokeWidth={1.8} />
              <span className="text-[13px] font-semibold text-[var(--fg)]">Disco</span>
            </div>
            <div className="space-y-3">
              {metrics.disk.slice(0, 3).map(d => (
                <GaugeBar key={d.mount} value={d.usagePercent} label={`${d.mount} — ${d.freeGb} GB libres`} />
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* OS row */}
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Host',    value: metrics.os.hostname },
            { label: 'Sistema', value: metrics.os.distro },
            { label: 'Version', value: metrics.os.release },
            { label: 'Uptime',  value: metrics.os.uptimeFormatted },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--bg)] rounded-[10px] p-3">
              <p className="text-[10px] text-[var(--fg-tertiary)] mb-0.5 uppercase tracking-wide">{label}</p>
              <p className="text-[13px] font-medium text-[var(--fg)] truncate">{value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Log Terminal ─────────────────────────────────────────────────────────────

interface LogLine { ts: string; msg: string; isError: boolean; }

function LogTerminal({ containerId, containerName, onClose }: {
  containerId: string; containerName: string; onClose: () => void;
}) {
  const [lines,    setLines]    = useState<LogLine[]>([]);
  const [paused,   setPaused]   = useState(false);
  const [filter,   setFilter]   = useState('');
  const [wrap,     setWrap]     = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const pausedRef  = useRef(false);
  const abortRef   = useRef<AbortController | null>(null);

  pausedRef.current = paused;

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    fetch(`${BASE_URL}/infra/containers/${containerId}/logs`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ac.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done || ac.signal.aborted) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        let eventName = '';
        for (const part of parts) {
          if (part.startsWith('event:')) { eventName = part.slice(6).trim(); continue; }
          if (part.startsWith('data:') && eventName === 'log') {
            try {
              const { message } = JSON.parse(part.slice(5));
              const isError = /error|err|fail|exception|fatal/i.test(message);
              const ts = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              setLines(l => {
                const next = [...l.slice(-1000), { ts, msg: message, isError }];
                return next;
              });
            } catch { /* ignore */ }
            eventName = '';
          }
        }
      }
    }).catch(() => { /* closed/aborted */ });

    return () => ac.abort();
  }, [containerId]);

  // Auto-scroll
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, paused]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom && !paused) setPaused(true);
    if (atBottom && paused) setPaused(false);
  };

  const displayed = filter
    ? lines.filter(l => l.msg.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="rounded-[12px] overflow-hidden border border-[var(--border)] shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#161b22] border-b border-white/10">
        <Terminal size={13} className="text-[var(--accent)]" />
        <span className="text-[13px] font-medium text-white/80 font-mono flex-1">
          logs — {containerName}
        </span>
        {/* Filter */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtrar..."
          className="h-6 px-2 rounded-[5px] text-[11px] bg-white/8 border border-white/15 text-white/80 placeholder:text-white/30 outline-none focus:border-[var(--accent)]/50 w-28 font-mono"
        />
        {/* Wrap */}
        <button
          onClick={() => setWrap(v => !v)}
          className={cn('text-[10px] px-2 py-0.5 rounded border transition-colors font-mono',
            wrap ? 'border-[var(--accent)]/50 text-[var(--accent)]' : 'border-white/15 text-white/40')}
          title="Toggle word wrap"
        >wrap</button>
        {/* Pause */}
        <button
          onClick={() => {
            setPaused(v => !v);
            if (paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={cn('text-[10px] px-2 py-0.5 rounded border transition-colors font-mono',
            paused ? 'border-yellow-400/50 text-yellow-400' : 'border-white/15 text-white/40')}
        >{paused ? '▶ resumir' : '⏸ pausar'}</button>
        {/* Clear */}
        <button
          onClick={() => setLines([])}
          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/40 hover:text-white/70 transition-colors font-mono"
        >limpiar</button>
        {/* Close */}
        <button onClick={onClose} className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
          <X size={12} />
        </button>
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="bg-[#0d1117] h-72 overflow-y-auto font-mono text-[11.5px] px-3 py-2 space-y-[1px]"
      >
        {displayed.length === 0 ? (
          <p className="text-white/25 pt-4 text-center">Esperando logs...</p>
        ) : (
          displayed.map((l, i) => (
            <div key={i} className={cn('flex gap-2 leading-relaxed', !wrap && 'whitespace-nowrap')}>
              <span className="text-white/25 flex-shrink-0">{l.ts}</span>
              <span className={cn(
                'flex-1',
                l.isError ? 'text-red-400' : 'text-[#7ee787]',
                wrap ? 'break-all' : '',
              )}>{l.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-t border-white/10">
        <span className="text-[10px] text-white/30 font-mono">{lines.length} lineas</span>
        {paused && (
          <span className="text-[10px] text-yellow-400/80 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
            Scroll pausado — desplazate al final para continuar
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Container Detail Panel ───────────────────────────────────────────────────

function ContainerDetail({ containerId, onClose }: { containerId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['container-detail', containerId],
    queryFn: async () => {
      const { data } = await infraApi.getDetail(containerId);
      return (data as ApiResponse<Record<string, any>>).data;
    },
    staleTime: 30_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="border-t border-[var(--border)] bg-[var(--bg)] px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-semibold text-[var(--fg)]">Inspeccion</span>
          <button onClick={onClose}><X size={13} className="text-[var(--fg-tertiary)]" /></button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
            {/* Info */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--fg-tertiary)] font-medium">Info</p>
              {[
                ['ID',          data.id],
                ['IP',          data.ipAddress ?? '—'],
                ['Redes',       (data.networks as string[]).join(', ') || '—'],
                ['Reinicios',   String(data.restartCount)],
                ['Plataforma',  data.platform],
                ['Iniciado',    data.startedAt ? new Date(data.startedAt).toLocaleString('es') : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-[var(--fg-tertiary)] w-24 flex-shrink-0">{k}</span>
                  <span className="text-[var(--fg)] font-mono break-all">{v}</span>
                </div>
              ))}
            </div>
            {/* Mounts */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--fg-tertiary)] font-medium mb-2">Volumenes</p>
              {(data.mounts as any[]).length === 0 ? (
                <p className="text-[var(--fg-tertiary)]">Sin volumenes</p>
              ) : (data.mounts as any[]).map((m, i) => (
                <div key={i} className="font-mono text-[11px] text-[var(--fg-secondary)] mb-1 truncate">
                  <span className="text-[var(--fg-tertiary)]">{m.type}:</span> {m.source} → {m.destination}
                </div>
              ))}
            </div>
            {/* Env */}
            {(data.env as string[]).length > 0 && (
              <div className="md:col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-[var(--fg-tertiary)] font-medium mb-2">Variables de entorno (filtradas)</p>
                <div className="bg-[var(--bg-elevated)] rounded-[8px] p-3 max-h-36 overflow-y-auto font-mono text-[11px] space-y-0.5">
                  {(data.env as string[]).map((e, i) => (
                    <div key={i} className="text-[var(--fg-secondary)] truncate">{e}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// ─── Containers Section ───────────────────────────────────────────────────────

function ContainersSection({ containers, qc, toast }: {
  containers: ContainerInfo[];
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>;
}) {
  const [logsFor,   setLogsFor]   = useState<{ id: string; name: string } | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [pruneConfirm, setPruneConfirm] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const restart = useMutation({
    mutationFn: (id: string) => { setActionId(id); return infraApi.restart(id); },
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['containers'] }); toast.success(`Contenedor reiniciado`); setActionId(null); },
    onError: (err: any) => { toast.error(err?.response?.data?.message ?? 'Error al reiniciar'); setActionId(null); },
  });
  const stop = useMutation({
    mutationFn: (id: string) => { setActionId(id); return infraApi.stop(id); },
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['containers'] }); toast.success(`Contenedor detenido`); setActionId(null); },
    onError: (err: any) => { toast.error(err?.response?.data?.message ?? 'Error al detener'); setActionId(null); },
  });
  const start = useMutation({
    mutationFn: (id: string) => { setActionId(id); return infraApi.start(id); },
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['containers'] }); toast.success(`Contenedor iniciado`); setActionId(null); },
    onError: (err: any) => { toast.error(err?.response?.data?.message ?? 'Error al iniciar'); setActionId(null); },
  });
  const prune = useMutation({
    mutationFn: () => infraApi.prune(),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['containers'] });
      setPruneConfirm(false);
      const count = res?.data?.data?.removed?.length ?? 0;
      toast.success(`${count} contenedores eliminados`);
    },
    onError: (err: any) => { toast.error(err?.response?.data?.message ?? 'Error al limpiar'); setPruneConfirm(false); },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
      <Card padding="none">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-[var(--accent)]" />
            <h3 className="text-[13px] font-semibold text-[var(--fg)]">Contenedores Docker</h3>
            <span className="text-[11px] text-[var(--fg-tertiary)]">({containers.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {pruneConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--destructive)]">Eliminar detenidos?</span>
                <button
                  onClick={() => prune.mutate()}
                  disabled={prune.isPending}
                  className="text-[11px] px-2.5 py-1 rounded-[6px] bg-[var(--destructive)] text-white hover:opacity-80 transition-opacity"
                >
                  {prune.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Confirmar'}
                </button>
                <button onClick={() => setPruneConfirm(false)} className="text-[11px] text-[var(--fg-tertiary)] hover:text-[var(--fg)]">Cancelar</button>
              </div>
            ) : (
              <button
                onClick={() => setPruneConfirm(true)}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[6px] border border-[var(--border)] text-[var(--fg-tertiary)] hover:text-[var(--destructive)] hover:border-[var(--destructive)]/40 transition-colors"
              >
                <Trash2 size={11} /> Limpiar detenidos
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {['Contenedor', 'Imagen', 'Estado', 'Puertos', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {containers.map((c, i) => (
              <Fragment key={c.id}>
                <motion.tr
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="border-b border-[var(--border)]/50 hover:bg-[var(--bg)]/60 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setDetailFor(detailFor === c.id ? null : c.id)}
                      className="flex items-center gap-1.5 text-left"
                    >
                      {detailFor === c.id ? <ChevronDown size={12} className="text-[var(--accent)]" /> : <ChevronRight size={12} className="text-[var(--fg-tertiary)]" />}
                      <div>
                        <p className="font-medium text-[var(--fg)]">{c.name}</p>
                        <p className="text-[10px] font-mono text-[var(--fg-tertiary)]">{c.id}</p>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--fg-secondary)] font-mono text-[11px] max-w-[150px] truncate">{c.image}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.state === 'running' ? 'success' : c.state === 'exited' ? 'neutral' : 'warning'} dot>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--fg-tertiary)] font-mono text-[10px]">
                    {c.ports.filter(p => p.publicPort).map(p => `${p.publicPort}:${p.privatePort}`).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="sm" title="Reiniciar"
                        onClick={() => restart.mutate(c.id)}
                        loading={restart.isPending && actionId === c.id}
                      >
                        <RotateCcw size={12} />
                      </Button>
                      {c.state === 'running' ? (
                        <Button
                          variant="ghost" size="sm" title="Detener"
                          onClick={() => stop.mutate(c.id)}
                          loading={stop.isPending && actionId === c.id}
                        >
                          <Square size={12} className="text-[var(--destructive)]" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost" size="sm" title="Iniciar"
                          onClick={() => start.mutate(c.id)}
                          loading={start.isPending && actionId === c.id}
                        >
                          <Play size={12} className="text-[var(--success)]" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="sm" title="Ver logs"
                        onClick={() => setLogsFor(logsFor?.id === c.id ? null : { id: c.id, name: c.name })}
                      >
                        <Terminal size={12} className={logsFor?.id === c.id ? 'text-[var(--accent)]' : ''} />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
                {/* Container detail inline */}
                <AnimatePresence>
                  {detailFor === c.id && (
                    <tr key={`detail-${c.id}`}>
                      <td colSpan={5} className="p-0">
                        <ContainerDetail containerId={c.id} onClose={() => setDetailFor(null)} />
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </Fragment>
            ))}
            {containers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[var(--fg-tertiary)] text-[13px]">
                  Docker no disponible o sin contenedores.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Log terminal */}
      <AnimatePresence>
        {logsFor && (
          <LogTerminal key={logsFor.id} containerId={logsFor.id} containerName={logsFor.name} onClose={() => setLogsFor(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Processes Section ────────────────────────────────────────────────────────

function ProcessesSection() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const { data } = await infraApi.getProcesses();
      return (data as ApiResponse<{ processes: any[] }>).data.processes;
    },
    staleTime: 5_000,
    enabled: expanded,
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <Card padding="none">
        <div
          role="button" tabIndex={0}
          onClick={() => setExpanded(v => !v)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg)]/50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[var(--accent)]" />
            <span className="text-[13px] font-semibold text-[var(--fg)]">Procesos del sistema</span>
            <span className="text-[11px] text-[var(--fg-tertiary)]">(Top 15 por CPU)</span>
          </div>
          <div className="flex items-center gap-2">
            {expanded && (
              <button
                onClick={e => { e.stopPropagation(); refetch(); }}
                className="p-1 rounded hover:bg-[var(--border)] transition-colors"
              >
                <RefreshCw size={11} className={cn('text-[var(--fg-tertiary)]', isFetching && 'animate-spin')} />
              </button>
            )}
            {expanded ? <ChevronDown size={14} className="text-[var(--fg-tertiary)]" /> : <ChevronRight size={14} className="text-[var(--fg-tertiary)]" />}
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
            >
              <div className="border-t border-[var(--border)]">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        {['PID', 'Proceso', 'CPU %', 'RAM MB', 'Estado', 'Usuario'].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data ?? []).map((p: any, i: number) => (
                        <tr key={p.pid} className="border-b border-[var(--border)]/40 hover:bg-[var(--bg)] transition-colors">
                          <td className="px-4 py-2 font-mono text-[var(--fg-tertiary)]">{p.pid}</td>
                          <td className="px-4 py-2 font-medium text-[var(--fg)] max-w-[180px] truncate">{p.name}</td>
                          <td className="px-4 py-2">
                            <span className={cn('font-mono font-semibold', p.cpu > 30 ? 'text-[var(--destructive)]' : p.cpu > 10 ? 'text-[var(--warning)]' : 'text-[var(--success)]')}>
                              {p.cpu.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-[var(--fg-secondary)]">{p.memMb.toFixed(0)}</td>
                          <td className="px-4 py-2 text-[var(--fg-tertiary)] font-mono">{p.state}</td>
                          <td className="px-4 py-2 text-[var(--fg-tertiary)] truncate max-w-[100px]">{p.user}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ─── Network Section ──────────────────────────────────────────────────────────

function NetworkSection() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['network-stats'],
    queryFn: async () => {
      const { data } = await infraApi.getNetwork();
      return (data as ApiResponse<{ interfaces: any[] }>).data.interfaces;
    },
    staleTime: 10_000,
    refetchInterval: expanded ? 10_000 : false,
    enabled: expanded,
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
      <Card padding="none">
        <div
          role="button" tabIndex={0}
          onClick={() => setExpanded(v => !v)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg)]/50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Network size={14} className="text-[var(--accent)]" />
            <span className="text-[13px] font-semibold text-[var(--fg)]">Interfaces de red</span>
          </div>
          <div className="flex items-center gap-2">
            {expanded && (
              <button onClick={e => { e.stopPropagation(); refetch(); }} className="p-1 rounded hover:bg-[var(--border)] transition-colors">
                <RefreshCw size={11} className={cn('text-[var(--fg-tertiary)]', isFetching && 'animate-spin')} />
              </button>
            )}
            {expanded ? <ChevronDown size={14} className="text-[var(--fg-tertiary)]" /> : <ChevronRight size={14} className="text-[var(--fg-tertiary)]" />}
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
            >
              <div className="border-t border-[var(--border)]">
                {isLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        {['Interfaz', 'RX total', 'TX total', 'RX /s', 'TX /s'].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data ?? []).map((n: any) => (
                        <tr key={n.iface} className="border-b border-[var(--border)]/40 hover:bg-[var(--bg)] transition-colors">
                          <td className="px-4 py-2 font-mono font-medium text-[var(--fg)]">{n.iface}</td>
                          <td className="px-4 py-2 font-mono text-[var(--fg-secondary)] flex items-center gap-1">
                            <ArrowDown size={10} className="text-blue-400" />{n.rxMb.toFixed(1)} MB
                          </td>
                          <td className="px-4 py-2 font-mono text-[var(--fg-secondary)]">
                            <span className="flex items-center gap-1"><ArrowUp size={10} className="text-green-400" />{n.txMb.toFixed(1)} MB</span>
                          </td>
                          <td className="px-4 py-2 font-mono text-[var(--fg-tertiary)]">{n.rxSec} KB/s</td>
                          <td className="px-4 py-2 font-mono text-[var(--fg-tertiary)]">{n.txSec} KB/s</td>
                        </tr>
                      ))}
                      {(data ?? []).length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-6 text-center text-[var(--fg-tertiary)]">Sin datos de red</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InfraPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const containersQ = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const { data } = await infraApi.getContainers();
      return (data as ApiResponse<{ containers: ContainerInfo[] }>).data.containers;
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="max-w-6xl space-y-4">
      {/* Service Health */}
      <HealthSection />

      {/* Live Metrics (CPU, RAM, Disk, OS) */}
      <MetricsSection />

      {/* Docker Containers */}
      <ContainersSection containers={containersQ.data ?? []} qc={qc} toast={toast} />

      {/* Processes (collapsible) */}
      <ProcessesSection />

      {/* Network (collapsible) */}
      <NetworkSection />

      {/* Toasts */}
      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
