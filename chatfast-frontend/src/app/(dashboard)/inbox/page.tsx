'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Send, MessageSquare, Users, Check, CheckCheck,
  Image as ImageIcon, Mic, FileText, MapPin, ChevronDown, Loader2,
  Wifi, WifiOff, Smartphone, RefreshCcw,
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

function msgIcon(type: string): React.ReactNode {
  if (type === 'imageMessage')    return <ImageIcon size={12} className="inline-block mr-1" />;
  if (type === 'videoMessage')    return <ImageIcon size={12} className="inline-block mr-1" />;
  if (type === 'audioMessage')    return <Mic size={12} className="inline-block mr-1" />;
  if (type === 'documentMessage') return <FileText size={12} className="inline-block mr-1" />;
  if (type === 'locationMessage') return <MapPin size={12} className="inline-block mr-1" />;
  return null;
}

function StatusTick({ status }: { status: string }) {
  if (status === 'READ')      return <CheckCheck size={13} className="text-blue-400 flex-shrink-0" />;
  if (status === 'DELIVERED') return <CheckCheck size={13} className="text-[var(--fg-tertiary)] flex-shrink-0" />;
  return <Check size={13} className="text-[var(--fg-tertiary)] flex-shrink-0" />;
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

function MessageBubble({ msg, prevFromMe }: { msg: Message; prevFromMe: boolean | null }) {
  const isMe = msg.fromMe;
  const showBubbleTail = prevFromMe !== isMe;

  return (
    <div className={cn('flex', isMe ? 'justify-end' : 'justify-start', 'mb-0.5')}>
      <div
        className={cn(
          'max-w-[72%] px-3 py-2 rounded-[12px] text-[13.5px] leading-relaxed',
          isMe
            ? 'bg-[var(--accent)] text-white rounded-br-[4px]'
            : 'bg-[var(--bg-elevated)] text-[var(--fg)] border border-[var(--border)] rounded-bl-[4px]',
          showBubbleTail
            ? isMe ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
            : '',
        )}
      >
        {/* Content */}
        <div className="flex flex-col gap-0.5">
          {msgIcon(msg.type)}
          <span className="break-words whitespace-pre-wrap">
            {msg.content ?? '(sin contenido)'}
          </span>
        </div>

        {/* Meta */}
        <div className={cn('flex items-center justify-end gap-1 mt-1', isMe ? 'text-white/60' : 'text-[var(--fg-tertiary)]')}>
          <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
          {isMe && <StatusTick status={msg.status} />}
        </div>
      </div>
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
                prevFromMe={i > 0 ? messages[i - 1].fromMe : null}
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
            onChange={e => setText(e.target.value)}
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
      {/* ── Left Panel: Contacts ───────────────────────────────── */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]">
        {/* Instance selector */}
        <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
          <InstanceSelector selected={instance} onSelect={handleInstanceSelect} />
        </div>

        {/* Search + Sync */}
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
