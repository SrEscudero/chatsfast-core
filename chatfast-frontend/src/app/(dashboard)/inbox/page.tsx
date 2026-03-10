'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Send, MessageSquare, Users, Check, CheckCheck,
  Image as ImageIcon, Mic, FileText, MapPin, ChevronDown, Loader2,
  Wifi, WifiOff, Smartphone, RefreshCcw, Globe,
  Play, Pause, Download, X, SquarePen, Phone,
} from 'lucide-react';
import { instancesApi, contactsApi } from '@/lib/api';
import { formatRelativeTime, cn } from '@/lib/utils';
import { Spinner, PageSpinner } from '@/components/ui/Spinner';
import type { ApiResponse, PaginatedResponse, Instance, Contact, Message } from '@/types/api.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Nombre visible: nombre guardado → número → JID sin sufijo */
function getDisplayName(contact: { name: string | null; phone: string | null; remoteJid: string; isGroup: boolean }): string {
  if (contact.name) return contact.name;
  if (contact.phone) return `+${contact.phone}`;
  // Quitar el sufijo @s.whatsapp.net o @g.us del JID
  const bare = contact.remoteJid.replace(/@.*/, '');
  return contact.isGroup ? `Grupo ${bare}` : `+${bare}`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 1) return 'Ayer';

  if (diffDays < 7)
    return d.toLocaleDateString('es', { weekday: 'short' }); // Lun, Mar…

  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Color de avatar consistente por JID (igual al de WhatsApp — determinístico) */
function avatarColor(remoteJid: string): string {
  const colors = [
    'bg-[#25D366]', 'bg-[#128C7E]', 'bg-[#075E54]',
    'bg-[#34B7F1]', 'bg-[#ECE5DD]', 'bg-[#E91E63]',
    'bg-[#9C27B0]', 'bg-[#3F51B5]', 'bg-[#FF9800]',
    'bg-[#F44336]', 'bg-[#00BCD4]', 'bg-[#4CAF50]',
  ];
  let hash = 0;
  for (let i = 0; i < remoteJid.length; i++) hash = remoteJid.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── Sender color (deterministic per name, for group messages) ────────────────

const SENDER_PALETTE = [
  '#E91E63', '#9C27B0', '#3F51B5', '#1976D2',
  '#0097A7', '#00796B', '#388E3C', '#F57C00',
  '#E64A19', '#5D4037', '#455A64', '#C62828',
];

function senderColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return SENDER_PALETTE[Math.abs(h) % SENDER_PALETTE.length];
}

// ─── URL detection ────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s<>"]+/g;

function renderTextWithLinks(text: string, isMe: boolean): React.ReactNode {
  const parts = text.split(URL_RE);
  const urls  = text.match(URL_RE) ?? [];
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(<span key={`t${i}`}>{part}</span>);
    if (urls[i]) {
      let display: string;
      try { display = new URL(urls[i]).hostname; } catch { display = urls[i]; }
      nodes.push(
        <a
          key={`u${i}`} href={urls[i]} target="_blank" rel="noopener noreferrer"
          className={cn(
            'underline underline-offset-2 break-all',
            isMe ? 'text-white/90 hover:text-white' : 'text-[var(--accent)] hover:opacity-80',
          )}
        >
          {urls[i]}
        </a>
      );
      // Link preview chip (domain only)
      nodes.push(
        <div key={`lp${i}`} className={cn(
          'mt-1.5 flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[11px]',
          isMe ? 'bg-white/15' : 'bg-[var(--border)]/60',
        )}>
          <Globe size={11} className={isMe ? 'text-white/70' : 'text-[var(--fg-tertiary)]'} />
          <span className={isMe ? 'text-white/80' : 'text-[var(--fg-secondary)]'}>{display}</span>
        </div>
      );
    }
  });
  return <>{nodes}</>;
}

function StatusTick({ status }: { status: string }) {
  if (status === 'READ')      return <CheckCheck size={13} className="text-blue-400 flex-shrink-0" />;
  if (status === 'DELIVERED') return <CheckCheck size={13} className="text-[var(--fg-tertiary)] flex-shrink-0" />;
  return <Check size={13} className="text-[var(--fg-tertiary)] flex-shrink-0" />;
}

// ─── Image Modal ──────────────────────────────────────────────────────────────

function ImageModal({ src, caption, onClose }: { src: string; caption?: string | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = caption ?? 'imagen';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          title="Descargar"
        >
          <Download size={16} className="text-white" />
        </button>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          title="Cerrar"
        >
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Image */}
      <div className="flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt={caption ?? 'Imagen'}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        {caption && (
          <p className="text-white/70 text-[13px] text-center max-w-lg">{caption}</p>
        )}
      </div>
    </div>
  );
}

// ─── Authenticated Image ─────────────────────────────────────────────────────

function AuthImage({
  instanceId, contactId, messageId, caption, isMe,
}: {
  instanceId: string; contactId: string; messageId: string;
  caption?: string | null; isMe: boolean;
}) {
  const [src,        setSrc]        = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    setLoading(true); setError(false); setSrc(null);
    contactsApi.getMedia(instanceId, contactId, messageId)
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [instanceId, contactId, messageId]);

  const bg = isMe ? 'bg-white/15' : 'bg-[var(--border)]/50';

  if (loading) return (
    <div className={cn('w-[220px] h-[140px] rounded-[10px] flex items-center justify-center', bg)}>
      <Spinner className="w-5 h-5" />
    </div>
  );
  if (error || !src) return (
    <div className={cn('w-[220px] h-[80px] rounded-[10px] flex items-center justify-center gap-2', bg)}>
      <ImageIcon size={16} className={isMe ? 'text-white/60' : 'text-[var(--fg-tertiary)]'} />
      <span className={cn('text-[12px]', isMe ? 'text-white/70' : 'text-[var(--fg-tertiary)]')}>No disponible</span>
    </div>
  );
  return (
    <>
      {modalOpen && <ImageModal src={src} caption={caption} onClose={() => setModalOpen(false)} />}
      <div className="flex flex-col gap-1.5">
        <button onClick={() => setModalOpen(true)} className="block p-0 border-0 bg-transparent cursor-zoom-in">
          <img
            src={src} alt={caption ?? 'Imagen'}
            className="rounded-[10px] max-w-[240px] max-h-[300px] object-cover hover:opacity-90 transition-opacity"
          />
        </button>
        {caption && (
          <span className={cn('text-[13px] leading-snug', isMe ? 'text-white/90' : 'text-[var(--fg)]')}>{caption}</span>
        )}
      </div>
    </>
  );
}

// ─── Authenticated Audio ──────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AuthAudio({
  instanceId, contactId, messageId, isMe,
}: {
  instanceId: string; contactId: string; messageId: string; isMe: boolean;
}) {
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [duration,  setDuration]  = useState(0);
  const [current,   setCurrent]   = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let url: string | null = null;
    setLoading(true); setError(false);
    contactsApi.getMedia(instanceId, contactId, messageId)
      .then(({ data }) => {
        url = URL.createObjectURL(data as Blob);
        setAudioUrl(url);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [instanceId, contactId, messageId]);

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const bg   = isMe ? 'bg-white/15' : 'bg-[var(--border)]/50';
  const base = isMe ? 'text-white/80' : 'text-[var(--fg-secondary)]';
  const progress = duration > 0 ? current / duration : 0;

  return (
    <div className={cn('flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 w-[230px]', bg)}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
          onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        />
      )}

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={loading || error || !audioUrl}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
          loading || error || !audioUrl
            ? isMe ? 'bg-white/10 opacity-50' : 'bg-[var(--border)] opacity-50'
            : isMe ? 'bg-white/25 hover:bg-white/35' : 'bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30',
        )}
      >
        {loading
          ? <Spinner className="w-3.5 h-3.5" />
          : error
            ? <Mic size={14} className={base} />
            : playing
              ? <Pause size={14} className={isMe ? 'text-white' : 'text-[var(--accent)]'} />
              : <Play size={14} className={isMe ? 'text-white' : 'text-[var(--accent)]'} />
        }
      </button>

      {/* Waveform + time */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Waveform bars with progress tint */}
        <div className="flex gap-[2px] items-center h-5">
          {Array.from({ length: 20 }).map((_, i) => {
            const filled = i / 20 <= progress;
            return (
              <div
                key={i}
                style={{ height: `${4 + Math.abs(Math.sin(i * 0.85 + 1)) * 11}px` }}
                className={cn(
                  'w-[2px] rounded-full flex-shrink-0 transition-colors',
                  filled
                    ? isMe ? 'bg-white/90' : 'bg-[var(--accent)]'
                    : isMe ? 'bg-white/35'  : 'bg-[var(--fg-tertiary)]/50',
                )}
              />
            );
          })}
        </div>
        {/* Duration */}
        <span className={cn('text-[10px] font-mono leading-none', isMe ? 'text-white/55' : 'text-[var(--fg-tertiary)]')}>
          {formatDuration(playing || current > 0 ? current : duration)}
        </span>
      </div>
    </div>
  );
}

// ─── Authenticated Document ───────────────────────────────────────────────────

function AuthDocument({
  instanceId, contactId, messageId, name, isMe,
}: {
  instanceId: string; contactId: string; messageId: string;
  name: string; isMe: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState(false);

  const bg   = isMe ? 'bg-white/15' : 'bg-[var(--border)]/50';
  const base = isMe ? 'text-white/80' : 'text-[var(--fg-secondary)]';

  const ext = name.split('.').pop()?.toUpperCase() ?? 'DOC';

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true); setError(false);
    try {
      const { data } = await contactsApi.getMedia(instanceId, contactId, messageId);
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 max-w-[250px] w-full text-left',
        'transition-opacity hover:opacity-80 active:opacity-70',
        bg,
      )}
    >
      {/* Icon with ext label */}
      <div className={cn(
        'w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 gap-0',
        isMe ? 'bg-white/20' : 'bg-[var(--border)]',
      )}>
        <FileText size={16} className={base} />
        <span className={cn('text-[8px] font-bold leading-none mt-0.5', isMe ? 'text-white/60' : 'text-[var(--fg-tertiary)]')}>
          {ext}
        </span>
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-[12px] font-medium truncate leading-snug', base)}>{name}</p>
        <p className={cn('text-[10px] mt-0.5', isMe ? 'text-white/50' : 'text-[var(--fg-tertiary)]')}>
          {downloading ? 'Descargando…' : done ? '✓ Descargado' : error ? 'Error al descargar' : 'Toca para descargar'}
        </p>
      </div>

      {/* Download icon */}
      <div className="flex-shrink-0">
        {downloading
          ? <Spinner className="w-3.5 h-3.5" />
          : <Download size={14} className={isMe ? 'text-white/50' : 'text-[var(--fg-tertiary)]'} />
        }
      </div>
    </button>
  );
}

// ─── Media Body ───────────────────────────────────────────────────────────────

function MediaBody({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const base = isMe ? 'text-white/80' : 'text-[var(--fg-secondary)]';
  const bg   = isMe ? 'bg-white/15' : 'bg-[var(--border)]/50';

  // ── Imagen ──────────────────────────────────────────────────────────────────
  if (msg.type === 'imageMessage') {
    return (
      <AuthImage
        instanceId={msg.instanceId}
        contactId={msg.contactId}
        messageId={msg.id}
        caption={msg.caption}
        isMe={isMe}
      />
    );
  }

  // ── Video ───────────────────────────────────────────────────────────────────
  if (msg.type === 'videoMessage') {
    return (
      <div className="flex flex-col gap-1">
        <div className={cn('flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 w-[200px]', bg)}>
          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', isMe ? 'bg-white/20' : 'bg-[var(--border)]')}>
            <ImageIcon size={16} className={base} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('text-[12px] font-medium', base)}>Video</p>
            {msg.caption && <p className={cn('text-[11px] truncate', isMe ? 'text-white/60' : 'text-[var(--fg-tertiary)]')}>{msg.caption}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Audio ───────────────────────────────────────────────────────────────────
  if (msg.type === 'audioMessage') {
    return (
      <AuthAudio
        instanceId={msg.instanceId}
        contactId={msg.contactId}
        messageId={msg.id}
        isMe={isMe}
      />
    );
  }

  // ── Documento ───────────────────────────────────────────────────────────────
  if (msg.type === 'documentMessage') {
    const name = msg.caption ?? msg.content?.replace(/^📄\s*(Documento:?\s*)?/, '') ?? 'Documento';
    return (
      <AuthDocument
        instanceId={msg.instanceId}
        contactId={msg.contactId}
        messageId={msg.id}
        name={name}
        isMe={isMe}
      />
    );
  }

  // ── Localización ─────────────────────────────────────────────────────────────
  if (msg.type === 'locationMessage') {
    const mapsUrl = msg.mediaUrl ?? (() => {
      // Fallback: intentar parsear del content "📍 lat,lng"
      const match = (msg.content ?? '').match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
      return match ? `https://www.google.com/maps?q=${match[1]},${match[2]}` : null;
    })();
    const label = msg.caption ?? msg.content?.replace(/^📍\s*/, '') ?? 'Ubicación';

    return (
      <a
        href={mapsUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-3 rounded-[10px] px-3 py-2.5 max-w-[240px] transition-opacity hover:opacity-80',
          bg, !mapsUrl && 'pointer-events-none',
        )}
      >
        {/* Mini mapa estático (OpenStreetMap iframe no requiere API key) */}
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', isMe ? 'bg-white/20' : 'bg-[var(--accent)]/15')}>
          <MapPin size={20} className={isMe ? 'text-white/80' : 'text-[var(--accent)]'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[12px] font-medium truncate', base)}>{label}</p>
          <p className={cn('text-[10px]', isMe ? 'text-white/55' : 'text-[var(--fg-tertiary)]')}>
            {mapsUrl ? 'Toca para abrir en Maps' : 'Ubicación'}
          </p>
        </div>
        {mapsUrl && <Globe size={12} className={isMe ? 'text-white/50' : 'text-[var(--fg-tertiary)]'} />}
      </a>
    );
  }

  // ── Sticker ──────────────────────────────────────────────────────────────────
  if (msg.type === 'stickerMessage') {
    return <span className="text-3xl leading-none">🎭</span>;
  }

  // ── Texto (con detección de links) ────────────────────────────────────────
  const text = msg.content ?? '(sin contenido)';
  const hasUrl = URL_RE.test(text);
  URL_RE.lastIndex = 0;
  return (
    <span className="break-words whitespace-pre-wrap text-[13.5px] leading-relaxed">
      {hasUrl ? renderTextWithLinks(text, isMe) : text}
    </span>
  );
}

// ─── New Chat Modal ───────────────────────────────────────────────────────────

function NewChatModal({
  instanceId,
  onClose,
  onSelect,
}: {
  instanceId: string;
  onClose: () => void;
  onSelect: (contact: Contact) => void;
}) {
  const [query,       setQuery]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [phoneError,  setPhoneError]  = useState('');
  const [starting,    setStarting]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    inputRef.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Search contacts in DB (includes phonebook contacts after sync)
  const { data: searchData, isLoading: searching } = useQuery({
    queryKey: ['new-chat-search', instanceId, query],
    queryFn: async () => {
      if (!query.trim()) return { items: [] as Contact[] };
      const { data } = await contactsApi.list(instanceId, { search: query.trim(), limit: 20 });
      return (data as ApiResponse<{ items: Contact[]; pagination: any }>).data;
    },
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  });

  const results = searchData?.items ?? [];

  const handleStartByPhone = async () => {
    const normalized = phone.replace(/[\s\-\(\)\+]/g, '');
    if (!normalized || !/^\d{7,15}$/.test(normalized)) {
      setPhoneError('Ingresa un número válido (solo dígitos, con código de país)');
      return;
    }
    setPhoneError('');
    setStarting(true);
    try {
      const { data } = await contactsApi.startChat(instanceId, normalized);
      onSelect((data as ApiResponse<Contact>).data);
      onClose();
    } catch (e: any) {
      setPhoneError(e.response?.data?.error?.message ?? 'Error al iniciar chat');
    } finally {
      setStarting(false);
    }
  };

  const handleSelectContact = async (contact: Contact) => {
    onSelect(contact);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[16px] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <SquarePen size={15} className="text-[var(--accent)]" />
            <span className="text-[14px] font-semibold text-[var(--fg)]">Nueva conversación</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-full hover:bg-[var(--border)] flex items-center justify-center transition-colors">
            <X size={13} className="text-[var(--fg-tertiary)]" />
          </button>
        </div>

        {/* Search section */}
        <div className="p-4 border-b border-[var(--border)]">
          <p className="text-[11px] text-[var(--fg-tertiary)] mb-2 font-medium uppercase tracking-wide">Buscar contacto</p>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Nombre o número…"
              className="w-full h-9 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {/* Results */}
          {query.trim().length >= 2 && (
            <div className="mt-2 max-h-[220px] overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--bg)]">
              {searching ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner />
                </div>
              ) : results.length === 0 ? (
                <p className="text-[12px] text-[var(--fg-tertiary)] text-center py-4">Sin resultados</p>
              ) : (
                results.map(contact => {
                  const name = getDisplayName(contact);
                  const initials = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleSelectContact(contact)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--border)]/30 transition-colors text-left"
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0',
                        contact.isGroup ? 'bg-[var(--accent)]/20' : avatarColor(contact.remoteJid),
                      )}>
                        {contact.profilePic ? (
                          <img src={contact.profilePic} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : contact.isGroup ? <Users size={14} /> : initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[var(--fg)] truncate">{name}</p>
                        {contact.phone && (
                          <p className="text-[11px] text-[var(--fg-tertiary)] font-mono">+{contact.phone}</p>
                        )}
                      </div>
                      {contact.lastMessageAt && (
                        <span className="text-[10px] text-[var(--fg-tertiary)] flex-shrink-0">{formatTime(contact.lastMessageAt)}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Manual phone entry */}
        <div className="p-4">
          <p className="text-[11px] text-[var(--fg-tertiary)] mb-2 font-medium uppercase tracking-wide">O ingresa un número</p>
          <p className="text-[11px] text-[var(--fg-tertiary)] mb-2">Con código de país, sin el signo +. Ej: 521234567890</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
              <input
                value={phone}
                onChange={e => { setPhone(e.target.value); setPhoneError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleStartByPhone(); }}
                placeholder="521234567890"
                className="w-full h-9 pl-8 pr-3 rounded-[8px] text-[13px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors font-mono"
              />
            </div>
            <button
              onClick={handleStartByPhone}
              disabled={starting || !phone.trim()}
              className={cn(
                'h-9 px-4 rounded-[8px] text-[13px] font-medium flex items-center gap-1.5 flex-shrink-0 transition-colors',
                phone.trim() && !starting
                  ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--border)]/50 text-[var(--fg-tertiary)] cursor-not-allowed',
              )}
            >
              {starting ? <Spinner className="w-3.5 h-3.5" /> : 'Iniciar'}
            </button>
          </div>
          {phoneError && (
            <p className="text-[11px] text-[var(--destructive)] mt-1.5">{phoneError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Instance Selector ────────────────────────────────────────────────────────

function InstanceSelector({
  selected,
  onSelect,
}: {
  selected: Instance | null;
  onSelect: (inst: Instance) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-instances'],
    queryFn: async () => {
      const { data } = await instancesApi.listMine({ limit: 50 });
      return (data as ApiResponse<PaginatedResponse<Instance>>).data.items;
    },
    staleTime: 30_000,
  });

  // Auto-select first connected instance
  useEffect(() => {
    if (!selected && data && data.length > 0) {
      const connected = data.find(i => i.status === 'CONNECTED') ?? data[0];
      onSelect(connected);
    }
  }, [data, selected, onSelect]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] text-left hover:border-[var(--accent)]/50 transition-colors"
      >
        <Smartphone size={13} className="text-[var(--fg-tertiary)] flex-shrink-0" />
        {isLoading ? (
          <span className="flex-1 text-[13px] text-[var(--fg-tertiary)]">Cargando…</span>
        ) : selected ? (
          <span className="flex-1 text-[13px] text-[var(--fg)] truncate">{selected.name}</span>
        ) : (
          <span className="flex-1 text-[13px] text-[var(--fg-tertiary)]">Selecciona instancia</span>
        )}
        {selected && (
          <span className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            selected.status === 'CONNECTED' ? 'bg-[var(--success)]' : 'bg-[var(--fg-tertiary)]',
          )} />
        )}
        <ChevronDown size={13} className={cn('text-[var(--fg-tertiary)] transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[10px] shadow-xl overflow-hidden"
          >
            {(data ?? []).map(inst => (
              <button
                key={inst.id}
                onClick={() => { onSelect(inst); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--border)]/30 transition-colors',
                  selected?.id === inst.id && 'bg-[var(--accent)]/8',
                )}
              >
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  inst.status === 'CONNECTED' ? 'bg-[var(--success)]' : 'bg-[var(--fg-tertiary)]',
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--fg)] truncate">{inst.name}</p>
                  {inst.phoneNumber && (
                    <p className="text-[11px] text-[var(--fg-tertiary)] font-mono">{inst.phoneNumber}</p>
                  )}
                </div>
                {inst.status === 'CONNECTED'
                  ? <Wifi size={12} className="text-[var(--success)] flex-shrink-0" />
                  : <WifiOff size={12} className="text-[var(--fg-tertiary)] flex-shrink-0" />}
              </button>
            ))}
            {data?.length === 0 && (
              <p className="text-[12px] text-[var(--fg-tertiary)] text-center py-4">Sin instancias</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Contact Item ─────────────────────────────────────────────────────────────

function ContactItem({
  contact,
  isSelected,
  onClick,
}: {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
}) {
  const displayName = getDisplayName(contact);
  const hasUnread = contact.unreadCount > 0;
  const initials = displayName
    .replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '')
    .trim()
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';

  const bgColor = contact.isGroup
    ? 'bg-[var(--accent)]/20'
    : avatarColor(contact.remoteJid);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-[var(--border)]/30',
        isSelected ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg)]',
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'w-[46px] h-[46px] rounded-full flex items-center justify-center text-[15px] font-semibold flex-shrink-0 text-white',
        bgColor,
      )}>
        {contact.profilePic ? (
          <img src={contact.profilePic} alt="" className="w-[46px] h-[46px] rounded-full object-cover" />
        ) : contact.isGroup ? (
          <Users size={20} />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name + time */}
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'text-[14px] truncate leading-snug',
            hasUnread ? 'font-semibold text-[var(--fg)]' : 'font-medium text-[var(--fg)]',
            isSelected && 'text-[var(--accent)]',
          )}>
            {displayName}
          </p>
          {contact.lastMessageAt && (
            <span className={cn(
              'text-[11px] flex-shrink-0 leading-snug',
              hasUnread ? 'text-[var(--accent)] font-medium' : 'text-[var(--fg-tertiary)]',
            )}>
              {formatTime(contact.lastMessageAt)}
            </span>
          )}
        </div>

        {/* Row 2: last message + unread badge */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={cn(
            'text-[12.5px] truncate leading-snug',
            hasUnread ? 'text-[var(--fg-secondary)]' : 'text-[var(--fg-tertiary)]',
          )}>
            {contact.lastMessage ?? (
              <span className="italic">Sin mensajes</span>
            )}
          </p>
          {hasUnread && (
            <span className="flex-shrink-0 min-w-[20px] h-[20px] rounded-full bg-[var(--accent)] text-white text-[11px] font-bold flex items-center justify-center px-1.5">
              {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  prevMsg,
  isGroup,
}: {
  msg: Message;
  prevMsg: Message | null;
  isGroup: boolean;
}) {
  const isMe = msg.fromMe;

  // Grouping: same sender within 2 min = consecutive block
  const sameBlock = (() => {
    if (!prevMsg) return false;
    if (prevMsg.fromMe !== msg.fromMe) return false;
    // In groups, also check sender name matches
    if (isGroup && !isMe && prevMsg.senderName !== msg.senderName) return false;
    const gap = new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime();
    return gap < 2 * 60 * 1000;
  })();

  const color     = (!isMe && msg.senderName) ? senderColor(msg.senderName) : '';
  const showName  = isGroup && !isMe && !sameBlock && !!msg.senderName;
  const showTail  = !sameBlock;
  const topMargin = sameBlock ? 'mt-[2px]' : 'mt-2';

  return (
    <div className={cn('flex items-end gap-2', isMe ? 'justify-end' : 'justify-start', topMargin)}>
      {/* Avatar placeholder (keeps alignment even when hidden) */}
      {!isMe && (
        <div className={cn('w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white mb-0.5',
          sameBlock ? 'invisible' : ''
        )}
          style={{ backgroundColor: color || 'var(--accent)' }}
        >
          {msg.senderName ? msg.senderName.charAt(0).toUpperCase() : '?'}
        </div>
      )}

      {/* Bubble */}
      <div className={cn('flex flex-col', isMe ? 'items-end' : 'items-start', 'max-w-[72%]')}>
        {/* Sender name */}
        {showName && (
          <span className="text-[11px] font-semibold mb-0.5 px-1" style={{ color }}>
            {msg.senderName}
          </span>
        )}

        <div className={cn(
          'px-3 py-2 text-[13.5px]',
          isMe
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--bg-elevated)] text-[var(--fg)] border border-[var(--border)]',
          // Corner rounding — tail on first message of block
          isMe
            ? cn('rounded-[14px]', showTail ? 'rounded-br-[4px]' : '')
            : cn('rounded-[14px]', showTail ? 'rounded-bl-[4px]' : ''),
        )}>
          <MediaBody msg={msg} isMe={isMe} />

          {/* Meta row */}
          <div className={cn(
            'flex items-center justify-end gap-1 mt-1',
            isMe ? 'text-white/55' : 'text-[var(--fg-tertiary)]',
          )}>
            <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
            {isMe && <StatusTick status={msg.status} />}
          </div>
        </div>
      </div>

      {/* Right spacer for incoming (keeps "sent" messages from touching edge) */}
      {!isMe && <div className="w-7 flex-shrink-0" />}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  instanceId,
  contact,
}: {
  instanceId: string;
  contact: Contact;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const presenceTimer    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const presenceInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isComposing      = useRef(false);

  // Número de destino para presence (mismo formato que sendText)
  const presenceNumber = contact.isGroup
    ? contact.remoteJid
    : (contact.phone ?? contact.remoteJid.replace(/@.*/, ''));

  const sendPresence = useCallback((state: 'composing' | 'paused') => {
    contactsApi.sendPresence(instanceId, presenceNumber, state).catch(() => {});
  }, [instanceId, presenceNumber]);

  /** Para el indicador y limpia todos los timers */
  const stopComposing = useCallback(() => {
    if (presenceTimer.current)    { clearTimeout(presenceTimer.current);   presenceTimer.current    = null; }
    if (presenceInterval.current) { clearInterval(presenceInterval.current); presenceInterval.current = null; }
    if (isComposing.current) {
      isComposing.current = false;
      sendPresence('paused');
    }
  }, [sendPresence]);

  /** Inicia o mantiene vivo el indicador "escribiendo..." */
  const startComposing = useCallback(() => {
    if (!isComposing.current) {
      isComposing.current = true;
      sendPresence('composing');
      // Reenviar composing cada 2s para que no desaparezca mientras sigue escribiendo
      presenceInterval.current = setInterval(() => sendPresence('composing'), 2000);
    }
    // Reiniciar el timer de inactividad: 3s sin escribir → paused
    if (presenceTimer.current) clearTimeout(presenceTimer.current);
    presenceTimer.current = setTimeout(stopComposing, 3000);
  }, [sendPresence, stopComposing]);

  // Limpia todo al desmontar o cambiar de contacto
  useEffect(() => {
    return () => {
      if (presenceTimer.current)    clearTimeout(presenceTimer.current);
      if (presenceInterval.current) clearInterval(presenceInterval.current);
    };
  }, [contact.id]);

  // Fetch messages — auto-marks as read on backend
  const { data: msgsData, isLoading } = useQuery({
    queryKey: ['messages', instanceId, contact.id],
    queryFn: async () => {
      const { data } = await contactsApi.getMessages(instanceId, contact.id, { limit: 100 });
      return (data as ApiResponse<{ items: Message[]; total: number }>).data;
    },
    refetchInterval: 3_000,
  });

  const messages = msgsData?.items ?? [];

  // Invalidate contacts list to refresh unread counts after opening chat
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['contacts', instanceId] });
  }, [contact.id, instanceId, qc]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Send message
  const send = useMutation({
    mutationFn: async (msg: string) => {
      // Grupos: Evolution API necesita el JID completo (120363...@g.us)
      // Contactos: número sin sufijo (521234567890)
      const number = contact.isGroup
        ? contact.remoteJid
        : (contact.phone ?? contact.remoteJid.replace(/@.*/, ''));
      await contactsApi.sendText(instanceId, number, msg);
    },
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['messages', instanceId, contact.id] });
      qc.invalidateQueries({ queryKey: ['contacts', instanceId] });
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    // Cancelar timers sin enviar "paused" — el mensaje ya sale
    if (presenceTimer.current)    { clearTimeout(presenceTimer.current);   presenceTimer.current    = null; }
    if (presenceInterval.current) { clearInterval(presenceInterval.current); presenceInterval.current = null; }
    isComposing.current = false;
    send.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = getDisplayName(contact);

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] flex-shrink-0">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-semibold text-white flex-shrink-0',
          contact.isGroup ? 'bg-[var(--accent)]/20' : avatarColor(contact.remoteJid),
        )}>
          {contact.profilePic ? (
            <img src={contact.profilePic} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : contact.isGroup ? (
            <Users size={16} />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[var(--fg)] truncate leading-snug">{displayName}</p>
          <p className="text-[11px] text-[var(--fg-tertiary)]">
            {contact.isGroup ? 'Grupo de WhatsApp' : contact.phone ? `+${contact.phone}` : contact.remoteJid}
          </p>
        </div>
        {msgsData && (
          <span className="text-[11px] text-[var(--fg-tertiary)] flex-shrink-0">
            {msgsData.total} msgs
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <MessageSquare size={28} className="text-[var(--fg-tertiary)]" />
            <p className="text-[13px] text-[var(--fg-tertiary)]">Sin mensajes aún</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                prevMsg={i > 0 ? messages[i - 1] : null}
                isGroup={contact.isGroup}
              />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
        {send.isError && (
          <p className="text-[11px] text-[var(--destructive)] mb-2">
            {(send.error as any)?.response?.data?.error?.message
              ?? (send.error as any)?.message
              ?? 'Error al enviar. Verifica que la instancia esté conectada.'}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => {
              const val = e.target.value;
              setText(val);
              if (val.trim()) {
                startComposing();
              } else {
                stopComposing();
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-[10px] border border-[var(--border)] bg-[var(--bg)]',
              'px-3 py-2.5 text-[13.5px] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)]',
              'outline-none focus:border-[var(--accent)]/60 transition-colors',
              'max-h-32 overflow-y-auto leading-relaxed',
            )}
            style={{ height: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || send.isPending}
            className={cn(
              'w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-colors',
              text.trim() && !send.isPending
                ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                : 'bg-[var(--border)]/50 text-[var(--fg-tertiary)] cursor-not-allowed',
            )}
          >
            {send.isPending ? <Spinner className="w-4 h-4" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
        <MessageSquare size={28} className="text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-[var(--fg)]">Selecciona una conversación</p>
        <p className="text-[13px] text-[var(--fg-tertiary)] mt-1">
          Elige un contacto de la lista para ver y responder mensajes.
        </p>
      </div>
    </div>
  );
}

// ─── Main Inbox Page ──────────────────────────────────────────────────────────

export default function InboxPage() {
  const qc = useQueryClient();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const instanceId = instance?.id;

  // Contacts list
  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts', instanceId, debouncedSearch],
    queryFn: async () => {
      if (!instanceId) return { items: [], pagination: { total: 0 } };
      const { data } = await contactsApi.list(instanceId, {
        limit: 50,
        search: debouncedSearch || undefined,
      });
      return (data as ApiResponse<{ items: Contact[]; pagination: { total: number } }>).data;
    },
    enabled: !!instanceId,
    refetchInterval: 5_000,
  });

  // Filtrar contactos inválidos (JID sin '@' = IDs internos de Evolution que se colaron)
  const contacts = (contactsData?.items ?? []).filter(c => c.remoteJid.includes('@'));

  // Reset selected contact when instance changes
  const handleInstanceSelect = useCallback((inst: Instance) => {
    setInstance(inst);
    setSelectedContact(null);
  }, []);

  // Sync contacts from Evolution API
  const handleSync = async () => {
    if (!instanceId || syncing) return;
    setSyncing(true);
    setSyncError('');
    try {
      await contactsApi.sync(instanceId);
      await qc.invalidateQueries({ queryKey: ['contacts', instanceId] });
    } catch (e: any) {
      const msg = e.response?.data?.error?.message ?? 'Error al sincronizar';
      setSyncError(msg);
      setTimeout(() => setSyncError(''), 5000);
    } finally { setSyncing(false); }
  };

  return (
    // Stretch to fill the dashboard main area (counteract p-6)
    <div className="-m-6 flex" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {/* New Chat Modal */}
      {newChatOpen && instanceId && (
        <NewChatModal
          instanceId={instanceId}
          onClose={() => setNewChatOpen(false)}
          onSelect={(contact) => { setSelectedContact(contact); setNewChatOpen(false); }}
        />
      )}

      {/* ── Left Panel: Contacts ───────────────────────────────── */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]">
        {/* Instance selector */}
        <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
          <InstanceSelector selected={instance} onSelect={handleInstanceSelect} />
        </div>

        {/* Search + Sync + New Chat */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contacto…"
              className="w-full h-8 pl-7 pr-3 rounded-[8px] text-[12.5px] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>
          <button
            onClick={handleSync}
            disabled={!instanceId || syncing}
            title="Sincronizar contactos"
            className="w-8 h-8 rounded-[8px] flex items-center justify-center border border-[var(--border)] text-[var(--fg-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors disabled:opacity-40"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
          </button>
          <button
            onClick={() => setNewChatOpen(true)}
            disabled={!instanceId}
            title="Nueva conversación"
            className="w-8 h-8 rounded-[8px] flex items-center justify-center border border-[var(--border)] text-[var(--fg-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors disabled:opacity-40"
          >
            <SquarePen size={13} />
          </button>
        </div>

        {/* Sync error */}
        {syncError && (
          <div className="px-3 py-1.5 bg-[var(--destructive)]/8 border-b border-[var(--destructive)]/20">
            <p className="text-[11px] text-[var(--destructive)] leading-snug">{syncError}</p>
          </div>
        )}

        {/* Contact count */}
        {instanceId && !loadingContacts && (
          <div className="px-4 py-1.5 border-b border-[var(--border)]/50">
            <p className="text-[11px] text-[var(--fg-tertiary)]">
              {contactsData?.pagination?.total ?? contacts.length} conversaciones
            </p>
          </div>
        )}

        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto">
          {!instanceId ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
              <Smartphone size={24} className="text-[var(--fg-tertiary)]" />
              <p className="text-[13px] text-[var(--fg-tertiary)]">Selecciona una instancia</p>
            </div>
          ) : loadingContacts ? (
            <div className="flex items-center justify-center h-24">
              <Spinner />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
              <Users size={24} className="text-[var(--fg-tertiary)]" />
              <p className="text-[13px] text-[var(--fg-tertiary)]">
                {debouncedSearch ? 'Sin resultados para la búsqueda' : 'Sin contactos. Sincroniza para importar.'}
              </p>
              {!debouncedSearch && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="text-[12px] text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={12} />
                  Sincronizar ahora
                </button>
              )}
            </div>
          ) : (
            contacts.map(contact => (
              <ContactItem
                key={contact.id}
                contact={contact}
                isSelected={selectedContact?.id === contact.id}
                onClick={() => setSelectedContact(contact)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Panel: Chat ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[var(--bg)] overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedContact && instanceId ? (
            <motion.div
              key={selectedContact.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col h-full overflow-hidden"
            >
              <ChatPanel instanceId={instanceId} contact={selectedContact} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1"
            >
              <EmptyChat />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
