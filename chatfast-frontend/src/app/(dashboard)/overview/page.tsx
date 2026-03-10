'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users, Smartphone, Wifi, Activity, Database, Zap } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import { overviewApi } from '@/lib/api';
import type { OverviewStats, HealthStatus, ApiResponse } from '@/types/api.types';

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'accent',
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color?: 'accent' | 'success' | 'warning' | 'error';
  delay?: number;
}) {
  const colorMap = {
    accent:  { bg: 'bg-[var(--accent)]/10',      text: 'text-[var(--accent)]' },
    success: { bg: 'bg-[var(--success)]/10',     text: 'text-[var(--success)]' },
    warning: { bg: 'bg-[var(--warning)]/10',     text: 'text-[var(--warning)]' },
    error:   { bg: 'bg-[var(--destructive)]/10', text: 'text-[var(--destructive)]' },
  };
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <Card className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>
          <Icon size={18} className={c.text} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] text-[var(--fg-secondary)] font-medium">{label}</p>
          <p className="text-[22px] font-semibold text-[var(--fg)] leading-none mt-0.5">{value}</p>
          {sub && <p className="text-[11px] text-[var(--fg-tertiary)] mt-0.5">{sub}</p>}
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Health Indicator ──────────────────────────────────────

function HealthCard({ health }: { health: HealthStatus }) {
  const overallVariant = {
    healthy: 'success',
    degraded: 'warning',
    unhealthy: 'error',
  }[health.overall] as 'success' | 'warning' | 'error';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.3 }}
    >
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-[var(--fg)]">Estado de servicios</h3>
          <Badge variant={overallVariant} dot>
            {health.overall === 'healthy' ? 'Operativo' : health.overall === 'degraded' ? 'Degradado' : 'Caído'}
          </Badge>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Base de datos', data: health.database, icon: Database },
            { label: 'Evolution API',  data: health.evolutionApi, icon: Zap },
          ].map(({ label, data, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] text-[var(--fg-secondary)]">
                <Icon size={14} strokeWidth={1.8} />
                {label}
              </div>
              <div className="flex items-center gap-2">
                {data.latencyMs !== null && (
                  <span className="text-[11px] text-[var(--fg-tertiary)]">{data.latencyMs}ms</span>
                )}
                <Badge variant={data.status === 'ok' ? 'success' : 'error'} dot>
                  {data.status === 'ok' ? 'OK' : 'Error'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Instance distribution ─────────────────────────────────

function InstanceDistribution({ instances }: { instances: OverviewStats['instances'] }) {
  const items = [
    { label: 'Conectadas',    value: instances.connected,    color: 'var(--success)' },
    { label: 'Conectando',    value: instances.connecting,   color: 'var(--warning)' },
    { label: 'Desconectadas', value: instances.disconnected, color: 'var(--fg-tertiary)' },
    { label: 'Error',         value: instances.error,        color: 'var(--destructive)' },
    { label: 'Pendientes',    value: instances.pending,      color: 'var(--accent)' },
  ];
  const total = instances.total || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
    >
      <Card>
        <h3 className="text-[14px] font-semibold text-[var(--fg)] mb-4">Distribución de instancias</h3>
        {/* Bar */}
        <div className="flex rounded-full overflow-hidden h-2 gap-0.5 mb-4">
          {items.map(({ label, value, color }) =>
            value > 0 ? (
              <div
                key={label}
                style={{ width: `${(value / total) * 100}%`, background: color }}
                className="transition-all duration-500"
              />
            ) : null,
          )}
        </div>
        <div className="space-y-2">
          {items.map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[13px] text-[var(--fg-secondary)]">{label}</span>
              </div>
              <span className="text-[13px] font-medium text-[var(--fg)]">{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function OverviewPage() {
  const statsQ = useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      const { data } = await overviewApi.getStats();
      return (data as ApiResponse<OverviewStats>).data;
    },
    refetchInterval: 30_000,
  });

  const healthQ = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await overviewApi.getHealth();
      return (data as ApiResponse<HealthStatus>).data;
    },
    refetchInterval: 15_000,
  });

  if (statsQ.isLoading) return <PageSpinner />;
  if (statsQ.isError) return (
    <div className="text-[var(--destructive)] text-[13px]">Error al cargar estadísticas.</div>
  );

  const stats = statsQ.data!;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}      label="Clientes"             value={stats.clients.total}     sub={`${stats.clients.active} activos`}          color="accent"   delay={0}    />
        <StatCard icon={Smartphone} label="Instancias"           value={stats.instances.total}   sub={`${stats.instances.connected} conectadas`}   color="success"  delay={0.05} />
        <StatCard icon={Wifi}       label="Sesiones activas"     value={stats.sessions.active}   sub="Tokens válidos"                              color="warning"  delay={0.1}  />
        <StatCard icon={Activity}   label="Clientes suspendidos" value={stats.clients.suspended} sub="Acceso bloqueado"                            color="error"    delay={0.15} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InstanceDistribution instances={stats.instances} />
        {healthQ.data && <HealthCard health={healthQ.data} />}
      </div>

      {/* Plan distribution */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.3 }}
      >
        <Card>
          <h3 className="text-[14px] font-semibold text-[var(--fg)] mb-4">Clientes por plan</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'] as const).map((plan) => (
              <div key={plan} className="bg-[var(--bg)] rounded-[10px] p-3 text-center">
                <p className="text-[20px] font-semibold text-[var(--fg)]">
                  {stats.clients.byPlan[plan] ?? 0}
                </p>
                <p className="text-[11px] font-medium text-[var(--fg-secondary)] mt-0.5">{plan}</p>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
