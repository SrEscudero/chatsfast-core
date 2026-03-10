'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, RefreshCw, RotateCcw, WifiOff, QrCode,
  Settings, Trash2, Wifi, X, Copy, Check, ChevronRight,
  Smartphone, Calendar, Clock, User, Zap, Link, Globe,
  CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge, instanceStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { instancesApi, clientsApi } from '@/lib/api';
import { formatRelativeTime, cn } from '@/lib/utils';
import type { Instance, ApiResponse, PaginatedResponse, User } from '@/types/api.types';

// ─── QR Modal ────────────────────────────────────────────────────────────────

function QRModal({ instance, onClose, onConnected }: { instance: Instance; onClose: () => void; onConnected: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(instance.status === 'CONNECTED');
  const qc = useQueryClient();

  const fetchQR = useCallback(async () => {
    if (connected) return;
    setLoading(true); setError('');
    try {
      const { data } = await instancesApi.getQR(instance.id);
      const res = data as ApiResponse<{ base64: string }>;
      const raw = res.data.base64;
      setQr(raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`);
    } catch (e: any) {
      const msg = e.response?.data?.error?.message ?? 'No se pudo obtener el QR';
      if (msg.includes('conectada') || msg.includes('CONNECTED')) {
        setConnected(true);
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  }, [instance.id, connected]);

  useEffect(() => {
    if (connected) return;
    const iv = setInterval(async () => {
      try {
        const { data } = await instancesApi.getStatus(instance.id);
        const res = data as ApiResponse<{ status: string }>;
        if (res.data.status === 'CONNECTED') {
          setConnected(true);
          qc.invalidateQueries({ queryKey: ['instances'] });
          onConnected();
          clearInterval(iv);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [instance.id, connected, qc, onConnected]);

  useEffect(() => {
    fetchQR();
    if (connected) return;
    const iv = setInterval(fetchQR, 25000);
    return () => clearInterval(iv);
  }, [fetchQR, connected]);

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
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--fg)]">Conectar instancia</h3>
            <p className="text-[12px] text-[var(--fg-secondary)] mt-0.5">{instance.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--border)]/40 text-[var(--fg-tertiary)]">
            <X size={16} />
          </button>
        </div>

        {connected ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-16 h-16 rounded-full bg-[var(--success)]/15 flex items-center justify-center">
              <Wifi size={28} className="text-[var(--success)]" />
            </div>
            <p className="text-[15px] font-semibold text-[var(--fg)]">Instancia conectada</p>
            <p className="text-[13px] text-[var(--fg-secondary)] text-center">WhatsApp está activo y listo para enviar mensajes.</p>
            <Button onClick={onClose} className="mt-2">Cerrar</Button>
          </div>
        ) : loading && !qr ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner size="lg" />
            <p className="text-[13px] text-[var(--fg-secondary)]">Generando código QR…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-[13px] text-[var(--destructive)]">{error}</p>
            <Button variant="secondary" onClick={fetchQR}>Reintentar</Button>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img src={qr} alt="QR Code" className="w-52 h-52 rounded-xl border border-[var(--border)]" />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-elevated)]/60 rounded-xl">
                  <Spinner />
                </div>
              )}
            </div>
            <div className="text-center space-y-1">
              <p className="text-[13px] font-medium text-[var(--fg)]">Escanea con WhatsApp</p>
              <p className="text-[11px] text-[var(--fg-tertiary)]">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-tertiary)]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
              El QR se actualiza cada 25 segundos
            </div>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

// ─── Create Instance Modal ────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [type, setType] = useState<'BAILEYS' | 'WHATSAPP_CLOUD'>('BAILEYS');
  const [error, setError] = useState('');

  const { data: clientsData } = useQuery({
    queryKey: ['clients-mini'],
    queryFn: async () => {
      const { data } = await clientsApi.list({ limit: 100 });
      return (data as ApiResponse<PaginatedResponse<User>>).data;
    },
  });

  const create = useMutation({
    mutationFn: () => instancesApi.create({ name: name.trim(), clientId, connectionType: type }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.response?.data?.error?.message ?? 'Error al crear la instancia'),
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
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-semibold text-[var(--fg)]">Nueva instancia</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--border)]/40 text-[var(--fg-tertiary)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Input
            label="Nombre de la instancia"
            placeholder="mi-empresa-01"
            value={name}
            onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[var(--fg-secondary)]">Cliente propietario</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full h-10 rounded-[var(--radius-sm)] px-3 text-[14px] bg-[var(--bg-elevated)] text-[var(--fg)] border border-[var(--border)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Selecciona un cliente</option>
              {clientsData?.items.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[var(--fg-secondary)]">Tipo de conexión</label>
            <div className="grid grid-cols-2 gap-2">
              {(['BAILEYS', 'WHATSAPP_CLOUD'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    'h-9 rounded-[8px] text-[13px] font-medium border transition-colors',
                    type === t
                      ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--fg-secondary)] hover:bg-[var(--border)]/30',
                  )}
                >
                  {t === 'BAILEYS' ? 'Baileys' : 'Cloud API'}
                </button>
              ))}
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
              disabled={!name.trim() || !clientId}
              onClick={() => create.mutate()}
            >
              Crear instancia
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start gap-3 py-3 border-b border-[var(--border)]/60 last:border-0">
      <div className="w-7 h-7 rounded-[7px] bg-[var(--border)]/50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={13} className="text-[var(--fg-tertiary)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[var(--fg-tertiary)] mb-0.5">{label}</p>
        <p className={cn('text-[13px] text-[var(--fg)] break-all', mono && 'font-mono text-[12px]')}>{value}</p>
      </div>
      {copyable && (
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-[6px] text-[var(--fg-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex-shrink-0 mt-0.5"
        >
          {copied ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} />}
        </button>
      )}
    </div>
  );
}

// ─── Instance Settings ────────────────────────────────────────────────────────

interface EvolutionSettings {
  rejectCall: boolean;
  msgCall: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-[var(--border)]/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--fg)]">{label}</p>
        <p className="text-[11px] text-[var(--fg-tertiary)] mt-0.5 leading-snug">{description}</p>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
          disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        <span className={cn(
          'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-1',
        )} />
      </button>
    </div>
  );
}

function InstanceSettings({ instanceId, instanceName }: { instanceId: string; instanceName: string }) {
  const [settings, setSettings] = useState<EvolutionSettings>({
    rejectCall: false,
    msgCall: '',
    groupsIgnore: false,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    instancesApi.getSettings(instanceId)
      .then(({ data }) => {
        const res = data as ApiResponse<EvolutionSettings>;
        const s = res.data;
        setSettings({
          rejectCall: s.rejectCall ?? false,
          msgCall: s.msgCall ?? '',
          groupsIgnore: s.groupsIgnore ?? false,
          alwaysOnline: s.alwaysOnline ?? false,
          readMessages: s.readMessages ?? false,
          readStatus: s.readStatus ?? false,
          syncFullHistory: s.syncFullHistory ?? false,
        });
      })
      .catch(() => setError('No se pudo cargar la configuración'))
      .finally(() => setLoading(false));
  }, [instanceId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await instancesApi.setSettings(instanceId, settings as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof EvolutionSettings) => (value: boolean | string) =>
    setSettings(s => ({ ...s, [key]: value }));

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Spinner />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Behavior */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider mb-2">Comportamiento</p>
        <div className="bg-[var(--bg)] rounded-[10px] border border-[var(--border)] px-4">
          <SettingToggle
            label="Rechazar llamadas"
            description="Rechaza automáticamente las llamadas entrantes de WhatsApp"
            checked={settings.rejectCall}
            onChange={set('rejectCall') as (v: boolean) => void}
          />
          {settings.rejectCall && (
            <div className="pb-3">
              <input
                value={settings.msgCall}
                onChange={e => set('msgCall')(e.target.value)}
                placeholder="Mensaje al rechazar llamada (opcional)"
                className="w-full h-9 px-3 rounded-[8px] text-[13px] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
              />
            </div>
          )}
          <SettingToggle
            label="Ignorar grupos"
            description="No procesa mensajes de grupos de WhatsApp"
            checked={settings.groupsIgnore}
            onChange={set('groupsIgnore') as (v: boolean) => void}
          />
          <SettingToggle
            label="Siempre en línea"
            description="Mantiene el estado de presencia como 'En línea' constantemente"
            checked={settings.alwaysOnline}
            onChange={set('alwaysOnline') as (v: boolean) => void}
          />
        </div>
      </div>

      {/* Messages */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider mb-2">Mensajes</p>
        <div className="bg-[var(--bg)] rounded-[10px] border border-[var(--border)] px-4">
          <SettingToggle
            label="Marcar como leído automáticamente"
            description="Los mensajes entrantes se marcan como leídos al recibirlos (doble check azul)"
            checked={settings.readMessages}
            onChange={set('readMessages') as (v: boolean) => void}
          />
          <SettingToggle
            label="Confirmar lectura de estados"
            description="Envía confirmación de lectura para los estados/stories de tus contactos"
            checked={settings.readStatus}
            onChange={set('readStatus') as (v: boolean) => void}
          />
        </div>
      </div>

      {/* Sync */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider mb-2">Sincronización</p>
        <div className="bg-[var(--bg)] rounded-[10px] border border-[var(--border)] px-4">
          <SettingToggle
            label="Historial completo al conectar"
            description="Sincroniza todo el historial de mensajes al conectar (puede ser lento)"
            checked={settings.syncFullHistory}
            onChange={set('syncFullHistory') as (v: boolean) => void}
          />
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-[var(--destructive)] bg-[var(--destructive)]/8 rounded-[8px] px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          'w-full h-9 rounded-[8px] text-[13px] font-medium flex items-center justify-center gap-2 transition-colors',
          saved
            ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30'
            : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
          saving && 'opacity-60 cursor-wait',
        )}
      >
        {saving ? <Spinner className="w-3.5 h-3.5" /> :
         saved   ? <><Check size={13} /> Guardado</> :
                   'Guardar configuración'}
      </button>
    </div>
  );
}

// ─── Instance Detail Drawer ───────────────────────────────────────────────────

function InstanceDetailDrawer({
  instance,
  onClose,
  onDelete,
  onQR,
}: {
  instance: Instance;
  onClose: () => void;
  onDelete: (inst: Instance) => void;
  onQR: (inst: Instance) => void;
}) {
  const qc = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'config' | 'settings'>('info');

  // Load current webhook
  useEffect(() => {
    instancesApi.getWebhook(instance.id)
      .then(({ data }) => {
        const res = data as ApiResponse<{ webhook?: { url?: string }; url?: string }>;
        setWebhookUrl(res.data?.webhook?.url ?? res.data?.url ?? '');
      })
      .catch(() => {});
  }, [instance.id]);

  const saveWebhook = async () => {
    setWebhookLoading(true);
    try {
      await instancesApi.setWebhook(instance.id, { url: webhookUrl });
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 2000);
    } catch {}
    finally { setWebhookLoading(false); }
  };

  const restartMut = useMutation({
    mutationFn: () => instancesApi.restart(instance.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
  const disconnectMut = useMutation({
    mutationFn: () => instancesApi.disconnect(instance.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['instances'] }); onClose(); },
  });

  const { variant, label: statusLabel } = instanceStatusBadge(instance.status);

  const statusIcon = {
    CONNECTED:    <Wifi size={12} className="text-[var(--success)]" />,
    CONNECTING:   <Loader2 size={12} className="text-[var(--warning)] animate-spin" />,
    DISCONNECTED: <WifiOff size={12} className="text-[var(--fg-tertiary)]" />,
    ERROR:        <AlertCircle size={12} className="text-[var(--destructive)]" />,
    PENDING:      <Clock size={12} className="text-[var(--fg-tertiary)]" />,
  }[instance.status] ?? null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[420px] bg-[var(--bg-elevated)] border-l border-[var(--border)] shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
            <Smartphone size={18} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-[var(--fg)] truncate">{instance.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusIcon}
              <span className={cn(
                'text-[11px] font-medium',
                instance.status === 'CONNECTED'    ? 'text-[var(--success)]'     :
                instance.status === 'ERROR'        ? 'text-[var(--destructive)]' :
                instance.status === 'CONNECTING'   ? 'text-[var(--warning)]'     :
                                                     'text-[var(--fg-tertiary)]',
              )}>
                {statusLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-[var(--border)]/50 text-[var(--fg-tertiary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-5 py-3 border-b border-[var(--border)] bg-[var(--bg)]/40">
          {instance.status !== 'CONNECTED' && (
            <button
              onClick={() => onQR(instance)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-[8px] text-[12.5px] font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              <QrCode size={13} />
              Conectar QR
            </button>
          )}
          <button
            onClick={() => restartMut.mutate()}
            disabled={restartMut.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-[8px] text-[12.5px] font-medium border border-[var(--border)] text-[var(--fg-secondary)] hover:bg-[var(--border)]/40 transition-colors disabled:opacity-50"
          >
            {restartMut.isPending ? <Spinner className="w-3.5 h-3.5" /> : <RotateCcw size={13} />}
            Reiniciar
          </button>
          {instance.status === 'CONNECTED' && (
            <button
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-[8px] text-[12.5px] font-medium border border-[var(--destructive)]/30 text-[var(--destructive)] hover:bg-[var(--destructive)]/8 transition-colors disabled:opacity-50"
            >
              {disconnectMut.isPending ? <Spinner className="w-3.5 h-3.5" /> : <WifiOff size={13} />}
              Desconectar
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-5">
          {([
            { key: 'info', label: 'Información' },
            { key: 'config', label: 'Configuración' },
            { key: 'settings', label: 'Ajustes' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'py-3 px-1 mr-5 text-[13px] font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--fg-tertiary)] hover:text-[var(--fg)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'info' ? (
            <div className="space-y-1">
              {/* Status card */}
              <div className={cn(
                'flex items-center gap-3 px-4 py-3.5 rounded-[12px] border mb-4',
                instance.status === 'CONNECTED'    ? 'bg-[var(--success)]/8 border-[var(--success)]/25'     :
                instance.status === 'ERROR'        ? 'bg-[var(--destructive)]/8 border-[var(--destructive)]/25' :
                instance.status === 'CONNECTING'   ? 'bg-[var(--warning)]/8 border-[var(--warning)]/25'     :
                                                     'bg-[var(--border)]/30 border-[var(--border)]',
              )}>
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center',
                  instance.status === 'CONNECTED'    ? 'bg-[var(--success)]/15'     :
                  instance.status === 'ERROR'        ? 'bg-[var(--destructive)]/15' :
                  instance.status === 'CONNECTING'   ? 'bg-[var(--warning)]/15'     :
                                                       'bg-[var(--border)]/50',
                )}>
                  {instance.status === 'CONNECTED'
                    ? <Wifi size={17} className="text-[var(--success)]" />
                    : instance.status === 'ERROR'
                    ? <AlertCircle size={17} className="text-[var(--destructive)]" />
                    : instance.status === 'CONNECTING'
                    ? <Loader2 size={17} className="text-[var(--warning)] animate-spin" />
                    : <WifiOff size={17} className="text-[var(--fg-tertiary)]" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--fg)]">{statusLabel}</p>
                  <p className="text-[11px] text-[var(--fg-tertiary)]">
                    {instance.status === 'CONNECTED'    ? 'WhatsApp activo y recibiendo mensajes'  :
                     instance.status === 'CONNECTING'   ? 'Estableciendo conexión con WhatsApp…'   :
                     instance.status === 'DISCONNECTED' ? 'Sin conexión, escanea el QR para conectar' :
                     instance.status === 'ERROR'        ? 'Error de conexión, reinicia la instancia' :
                                                          'Instancia pendiente de configuración'}
                  </p>
                </div>
              </div>

              <InfoRow icon={Smartphone} label="Nombre de la instancia" value={instance.name} />
              <InfoRow icon={Zap}        label="Instance ID (UUID)" value={instance.id} mono copyable />
              <InfoRow
                icon={Globe}
                label="Número conectado"
                value={instance.phoneNumber ?? 'No conectado'}
              />
              <InfoRow
                icon={User}
                label="Cliente propietario"
                value={instance.client?.name ?? '—'}
              />
              <InfoRow
                icon={Settings}
                label="Tipo de conexión"
                value={instance.connectionType === 'BAILEYS' ? 'Baileys (WhatsApp Web)' : 'WhatsApp Cloud API'}
              />
              <InfoRow
                icon={Calendar}
                label="Creado"
                value={new Date(instance.createdAt).toLocaleString('es', {
                  day: '2-digit', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              />
              <InfoRow
                icon={Clock}
                label="Última actividad"
                value={instance.lastSeen ? formatRelativeTime(instance.lastSeen) : 'Sin actividad'}
              />
            </div>
          ) : activeTab === 'config' ? (
            <div className="space-y-5">
              {/* Webhook */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Link size={14} className="text-[var(--fg-tertiary)]" />
                  <h4 className="text-[13px] font-semibold text-[var(--fg)]">URL del Webhook</h4>
                </div>
                <input
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://tu-servidor.com/webhook"
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors font-mono"
                />
                <p className="text-[11px] text-[var(--fg-tertiary)] leading-relaxed">
                  Evolution API enviará eventos de mensajes entrantes, cambios de estado y actualizaciones de conexión a esta URL.
                </p>
                <button
                  onClick={saveWebhook}
                  disabled={webhookLoading}
                  className={cn(
                    'w-full h-9 rounded-[8px] text-[13px] font-medium flex items-center justify-center gap-2 transition-colors',
                    webhookSaved
                      ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30'
                      : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
                    webhookLoading && 'opacity-60 cursor-wait',
                  )}
                >
                  {webhookLoading ? <Spinner className="w-3.5 h-3.5" /> :
                   webhookSaved   ? <><Check size={13} /> Guardado</> :
                                    'Guardar webhook'}
                </button>
              </div>

              {/* Rename */}
              <div className="space-y-3 pt-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Smartphone size={14} className="text-[var(--fg-tertiary)]" />
                  <h4 className="text-[13px] font-semibold text-[var(--fg)]">Información técnica</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--bg)] rounded-[8px] border border-[var(--border)]">
                    <div>
                      <p className="text-[11px] text-[var(--fg-tertiary)]">ID interno</p>
                      <p className="text-[12px] font-mono text-[var(--fg)] mt-0.5 break-all">{instance.id}</p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(instance.id)}
                      className="p-1.5 ml-2 rounded-[6px] text-[var(--fg-tertiary)] hover:text-[var(--accent)] flex-shrink-0"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className="px-3 py-2.5 bg-[var(--bg)] rounded-[8px] border border-[var(--border)]">
                    <p className="text-[11px] text-[var(--fg-tertiary)]">Tipo de conexión</p>
                    <p className="text-[12px] text-[var(--fg)] mt-0.5 font-medium">{instance.connectionType}</p>
                  </div>
                </div>
              </div>

              {/* Danger zone */}
              <div className="space-y-3 pt-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-[var(--destructive)]" />
                  <h4 className="text-[13px] font-semibold text-[var(--destructive)]">Zona de peligro</h4>
                </div>
                <button
                  onClick={() => { onClose(); onDelete(instance); }}
                  className="w-full h-9 rounded-[8px] text-[13px] font-medium flex items-center justify-center gap-2 border border-[var(--destructive)]/30 text-[var(--destructive)] hover:bg-[var(--destructive)]/8 transition-colors"
                >
                  <Trash2 size={13} />
                  Eliminar instancia permanentemente
                </button>
                <p className="text-[11px] text-[var(--fg-tertiary)]">
                  Esta acción eliminará la instancia de Evolution API y de la base de datos. No se puede deshacer.
                </p>
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <InstanceSettings instanceId={instance.id} instanceName={instance.name} />
          ) : null}
        </div>
      </motion.div>
    </>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ instance, onClose, onConfirm, loading }: {
  instance: Instance;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
      >
        <div className="w-12 h-12 rounded-full bg-[var(--destructive)]/12 flex items-center justify-center mb-4">
          <Trash2 size={20} className="text-[var(--destructive)]" />
        </div>
        <h3 className="text-[16px] font-semibold text-[var(--fg)] mb-2">Eliminar instancia</h3>
        <p className="text-[13px] text-[var(--fg-secondary)] mb-5">
          Se eliminará <strong className="text-[var(--fg)]">{instance.name}</strong> permanentemente de Evolution API y de la base de datos. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" className="flex-1" loading={loading} onClick={onConfirm}>Eliminar</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InstancesPage() {
  const qc = useQueryClient();
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [qrInstance, setQrInstance]     = useState<Instance | null>(null);
  const [createOpen, setCreateOpen]     = useState(false);
  const [detailInstance, setDetail]     = useState<Instance | null>(null);
  const [confirmDelete, setConfirmDel]  = useState<Instance | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['instances', page, search],
    queryFn: async () => {
      const { data } = await instancesApi.listMine({ page, limit: 15, search: search || undefined });
      return (data as ApiResponse<PaginatedResponse<Instance>>).data;
    },
    placeholderData: prev => prev,
    refetchInterval: 10_000,
  });

  const deleteInst = useMutation({
    mutationFn: (id: string) => instancesApi.delete(id),
    onSuccess: () => {
      setConfirmDel(null);
      setDetail(null);
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
  });

  return (
    <div className="max-w-6xl space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="Buscar instancia…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            icon={<Search size={14} />}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ['instances'] }); refetch(); }}>
          <RefreshCw size={13} /> Actualizar
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> Nueva instancia
        </Button>
      </div>

      {/* Table */}
      <Card padding="none">
        {isLoading ? <PageSpinner /> : isError ? (
          <div className="p-10 text-center">
            <p className="text-[13px] text-[var(--destructive)]">Error al cargar instancias. Verifica que el backend esté corriendo.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Instancia', 'Estado', 'Teléfono', 'Cliente', 'Última actividad', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--fg-tertiary)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((instance, i) => {
                  const { variant, label } = instanceStatusBadge(instance.status);
                  const isSelected = detailInstance?.id === instance.id;
                  return (
                    <motion.tr
                      key={instance.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                      onClick={() => setDetail(isSelected ? null : instance)}
                      className={cn(
                        'border-b border-[var(--border)]/50 transition-colors cursor-pointer group',
                        isSelected
                          ? 'bg-[var(--accent)]/6 border-l-2 border-l-[var(--accent)]'
                          : 'hover:bg-[var(--bg)]',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-[8px] bg-[var(--border)]/50 flex items-center justify-center flex-shrink-0">
                            <Smartphone size={13} className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--fg-tertiary)]'} />
                          </div>
                          <p className={cn('font-medium', isSelected ? 'text-[var(--accent)]' : 'text-[var(--fg)]')}>
                            {instance.name}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={variant} dot>{label}</Badge></td>
                      <td className="px-4 py-3 text-[var(--fg-secondary)] font-mono text-[12px]">
                        {instance.phoneNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--fg-secondary)]">
                        {instance.client?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--fg-tertiary)]">
                        {instance.lastSeen ? formatRelativeTime(instance.lastSeen) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight
                          size={15}
                          className={cn(
                            'transition-transform text-[var(--fg-tertiary)]',
                            isSelected && 'rotate-90 text-[var(--accent)]',
                          )}
                        />
                      </td>
                    </motion.tr>
                  );
                })}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Smartphone size={24} className="text-[var(--fg-tertiary)]" />
                        <p className="text-[13px] text-[var(--fg-tertiary)]">No hay instancias</p>
                        <button
                          onClick={() => setCreateOpen(true)}
                          className="text-[13px] text-[var(--accent)] hover:underline mt-1"
                        >
                          Crear la primera
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
                  {data.pagination.total} instancias · pág. {page}/{data.pagination.totalPages}
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

      {/* Hint text */}
      {data && data.items.length > 0 && !detailInstance && (
        <p className="text-[12px] text-[var(--fg-tertiary)] text-center">
          Haz clic en una instancia para ver todos sus detalles y configuración
        </p>
      )}

      {/* Overlays */}
      <AnimatePresence>
        {detailInstance && (
          <InstanceDetailDrawer
            key="detail"
            instance={detailInstance}
            onClose={() => setDetail(null)}
            onDelete={inst => setConfirmDel(inst)}
            onQR={inst => setQrInstance(inst)}
          />
        )}

        {qrInstance && (
          <QRModal
            key="qr"
            instance={qrInstance}
            onClose={() => setQrInstance(null)}
            onConnected={() => {
              qc.invalidateQueries({ queryKey: ['instances'] });
              setQrInstance(null);
            }}
          />
        )}

        {createOpen && (
          <CreateModal
            key="create"
            onClose={() => setCreateOpen(false)}
            onCreated={() => qc.invalidateQueries({ queryKey: ['instances'] })}
          />
        )}

        {confirmDelete && (
          <DeleteConfirm
            key="delete"
            instance={confirmDelete}
            onClose={() => setConfirmDel(null)}
            onConfirm={() => deleteInst.mutate(confirmDelete.id)}
            loading={deleteInst.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
