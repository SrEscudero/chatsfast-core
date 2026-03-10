'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { RotateCcw, Square, Play, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { infraApi } from '@/lib/api';
import type { SystemMetrics, ContainerInfo, ApiResponse } from '@/types/api.types';

// ─── Gauge ────────────────────────────────────────────────

function GaugeBar({ value, label }: { value: number; label: string }) {
  const color =
    value > 85 ? 'var(--destructive)' :
    value > 65 ? 'var(--warning)' :
    'var(--success)';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-[var(--fg-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--fg)]" style={{ color }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

// ─── Metrics Card ────────────────────────────────────────

function MetricsSection({ metrics }: { metrics: SystemMetrics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* CPU */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Cpu size={15} className="text-[var(--accent)]" strokeWidth={1.8} />
            <h3 className="text-[13px] font-semibold text-[var(--fg)]">CPU</h3>
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
          <div className="flex items-center gap-2 mb-4">
            <MemoryStick size={15} className="text-[var(--accent)]" strokeWidth={1.8} />
            <h3 className="text-[13px] font-semibold text-[var(--fg)]">Memoria</h3>
          </div>
          <GaugeBar value={metrics.memory.usagePercent} label={`${metrics.memory.usedGb} / ${metrics.memory.totalGb} GB`} />
          <div className="mt-3 text-[11px] text-[var(--fg-tertiary)]">
            {metrics.memory.freeGb} GB disponibles
          </div>
        </Card>
      </motion.div>

      {/* Disk */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={15} className="text-[var(--accent)]" strokeWidth={1.8} />
            <h3 className="text-[13px] font-semibold text-[var(--fg)]">Disco</h3>
          </div>
          <div className="space-y-3">
            {metrics.disk.slice(0, 3).map((d) => (
              <GaugeBar key={d.mount} value={d.usagePercent} label={`${d.mount} — ${d.freeGb} GB libres`} />
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── OS Card ────────────────────────────────────────────

function OsCard({ metrics }: { metrics: SystemMetrics }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <Card>
        <h3 className="text-[13px] font-semibold text-[var(--fg)] mb-3">Sistema operativo</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Host',       value: metrics.os.hostname },
            { label: 'Sistema',    value: metrics.os.distro },
            { label: 'Versión',    value: metrics.os.release },
            { label: 'Uptime',     value: metrics.os.uptimeFormatted },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--bg)] rounded-[10px] p-3">
              <p className="text-[11px] text-[var(--fg-tertiary)] mb-0.5">{label}</p>
              <p className="text-[13px] font-medium text-[var(--fg)] truncate">{value}</p>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Containers Table ────────────────────────────────────

function ContainersSection({ containers, qc }: { containers: ContainerInfo[]; qc: ReturnType<typeof useQueryClient> }) {
  const restart = useMutation({
    mutationFn: (id: string) => infraApi.restart(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
  const stop = useMutation({
    mutationFn: (id: string) => infraApi.stop(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
  const start = useMutation({
    mutationFn: (id: string) => infraApi.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <Card padding="none">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-[13px] font-semibold text-[var(--fg)]">Contenedores Docker</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {['Contenedor', 'Imagen', 'Estado', 'Puertos', 'Acciones'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {containers.map((c, i) => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="border-b border-[var(--border)]/50 hover:bg-[var(--bg)] transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--fg)]">{c.name}</p>
                  <p className="text-[11px] font-mono text-[var(--fg-tertiary)]">{c.id}</p>
                </td>
                <td className="px-4 py-3 text-[var(--fg-secondary)] font-mono text-[12px] max-w-[160px] truncate">
                  {c.image}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={c.state === 'running' ? 'success' : c.state === 'exited' ? 'neutral' : 'warning'}
                    dot
                  >
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[var(--fg-tertiary)] font-mono text-[11px]">
                  {c.ports.filter(p => p.publicPort).map(p => `${p.publicPort}:${p.privatePort}`).join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => restart.mutate(c.id)} loading={restart.isPending} title="Reiniciar">
                      <RotateCcw size={12} />
                    </Button>
                    {c.state === 'running' ? (
                      <Button variant="ghost" size="sm" onClick={() => stop.mutate(c.id)} loading={stop.isPending} title="Detener">
                        <Square size={12} className="text-[var(--destructive)]" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => start.mutate(c.id)} loading={start.isPending} title="Iniciar">
                        <Play size={12} className="text-[var(--success)]" />
                      </Button>
                    )}
                  </div>
                </td>
              </motion.tr>
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
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function InfraPage() {
  const qc = useQueryClient();

  const metricsQ = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const { data } = await infraApi.getMetrics();
      return (data as ApiResponse<SystemMetrics>).data;
    },
    refetchInterval: 10_000,
  });

  const containersQ = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const { data } = await infraApi.getContainers();
      return (data as ApiResponse<{ containers: ContainerInfo[] }>).data.containers;
    },
    refetchInterval: 15_000,
  });

  if (metricsQ.isLoading) return <PageSpinner />;

  return (
    <div className="max-w-6xl space-y-5">
      {metricsQ.data && <MetricsSection metrics={metricsQ.data} />}
      {metricsQ.data && <OsCard metrics={metricsQ.data} />}
      <ContainersSection containers={containersQ.data ?? []} qc={qc} />
    </div>
  );
}
