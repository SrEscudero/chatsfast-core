'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search, BookUser, Phone, MessageSquare, Users, ChevronLeft, ChevronRight, Wifi, Check, ChevronDown, RefreshCw } from 'lucide-react';
import { instancesApi, contactsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Instance, Contact } from '@/types/api.types';
import { cn } from '@/lib/utils';
import { Spinner, PageSpinner } from '@/components/ui/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null, phone: string | null) {
  if (name) return name.slice(0, 2).toUpperCase();
  if (phone) return phone.slice(-2);
  return '??';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoy ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return d.toLocaleDateString('es', { weekday: 'short' });
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

function stripJid(jid: string) {
  return jid.replace(/@.*/, '');
}

// ─── Instance selector (reusable) ─────────────────────────────────────────────

function InstanceSelector({
  instances,
  selected,
  onSelect,
}: {
  instances: Instance[];
  selected: Instance | null;
  onSelect: (i: Instance) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--border)]/20 transition-colors text-left"
      >
        <div className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          selected?.status === 'CONNECTED' ? 'bg-[var(--success)]' : 'bg-[var(--fg-tertiary)]',
        )} />
        <span className="text-[13px] font-medium text-[var(--fg)] whitespace-nowrap">
          {selected ? selected.name : 'Seleccionar instancia'}
        </span>
        <ChevronDown size={13} className={cn('text-[var(--fg-tertiary)] transition-transform ml-1', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 min-w-[220px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[10px] shadow-lg overflow-hidden">
            {instances.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-[var(--fg-tertiary)]">No hay instancias</p>
            ) : (
              instances.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => { onSelect(inst); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--border)]/30 transition-colors',
                    selected?.id === inst.id && 'bg-[var(--accent)]/8',
                  )}
                >
                  <div className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    inst.status === 'CONNECTED' ? 'bg-[var(--success)]' : 'bg-[var(--fg-tertiary)]',
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--fg)] truncate">{inst.name}</p>
                    {inst.phoneNumber && (
                      <p className="text-[11px] text-[var(--fg-tertiary)]">{inst.phoneNumber}</p>
                    )}
                  </div>
                  {selected?.id === inst.id && <Check size={13} className="text-[var(--accent)] flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[12px] p-4 flex items-start gap-3 hover:border-[var(--accent)]/30 transition-colors group"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {contact.profilePic ? (
          <img src={contact.profilePic} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--border)] to-[var(--bg)] flex items-center justify-center border border-[var(--border)]">
            <span className="text-[12px] font-semibold text-[var(--fg-secondary)]">
              {getInitials(contact.name, contact.phone)}
            </span>
          </div>
        )}
        {contact.isGroup && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-elevated)] flex items-center justify-center">
            <Users size={8} className="text-white" />
          </div>
        )}
        {contact.unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] border border-[var(--bg-elevated)] flex items-center justify-center">
            <span className="text-[9px] font-bold text-white">{contact.unreadCount > 99 ? '99+' : contact.unreadCount}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13.5px] font-semibold text-[var(--fg)] truncate">
            {contact.name || contact.phone || stripJid(contact.remoteJid)}
          </p>
          <span className="text-[11px] text-[var(--fg-tertiary)] flex-shrink-0">
            {fmtDate(contact.lastMessageAt)}
          </span>
        </div>

        {contact.phone && (
          <p className="text-[12px] text-[var(--fg-tertiary)] flex items-center gap-1 mt-0.5">
            <Phone size={10} />
            {contact.phone}
          </p>
        )}

        {contact.lastMessage && (
          <p className="text-[12px] text-[var(--fg-tertiary)] mt-1.5 truncate flex items-center gap-1">
            <MessageSquare size={10} className="flex-shrink-0" />
            {contact.lastMessage}
          </p>
        )}

        {contact.isGroup && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
            <Users size={9} />
            Grupo
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function ContactsPage() {
  const qc = useQueryClient();
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const syncMut = useMutation({
    mutationFn: () => contactsApi.sync(selectedInstance!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts-page', selectedInstance?.id] }),
  });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Instances
  const { data: instData } = useQuery({
    queryKey: ['instances-mine'],
    queryFn: async () => {
      const res = await instancesApi.listMine({ limit: 100 });
      return res.data.data as { items: Instance[] };
    },
  });
  const instances = instData?.items ?? [];

  // Auto-select first instance
  useEffect(() => {
    if (!selectedInstance && instances.length > 0) {
      setSelectedInstance(instances[0]);
    }
  }, [instances, selectedInstance]);

  // Contacts
  const { data: contactsData, isLoading } = useQuery({
    queryKey: ['contacts-page', selectedInstance?.id, debouncedSearch, page],
    queryFn: async () => {
      if (!selectedInstance) return { items: [] as Contact[], pagination: null };
      const res = await contactsApi.list(selectedInstance.id, {
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
      });
      return res.data.data as { items: Contact[]; pagination: { page: number; totalPages: number; total: number } };
    },
    enabled: !!selectedInstance,
  });

  const contacts     = contactsData?.items ?? [];
  const pagination   = contactsData?.pagination ?? null;
  const totalPages   = pagination?.totalPages ?? 1;
  const totalContacts = pagination?.total ?? 0;

  // Stats
  const groups    = contacts.filter(c => c.isGroup).length;
  const withUnread = contacts.filter(c => c.unreadCount > 0).length;

  return (
    <div className="p-6 space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <InstanceSelector
            instances={instances}
            selected={selectedInstance}
            onSelect={inst => { setSelectedInstance(inst); setPage(1); }}
          />

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nombre, teléfono..."
              className="w-56 pl-8 pr-3 h-9 text-[13px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[8px] text-[var(--fg)] placeholder:text-[var(--fg-tertiary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
            />
          </div>

          {selectedInstance?.status === 'CONNECTED' && (
            <button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              title="Importar contactos desde WhatsApp"
              className="flex items-center gap-1.5 h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] text-[13px] text-[var(--fg-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={syncMut.isPending ? 'animate-spin' : ''} />
              {syncMut.isPending ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          )}
        </div>

        {/* Stats chips */}
        {selectedInstance && totalContacts > 0 && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="px-2.5 py-1 rounded-full bg-[var(--border)]/60 text-[var(--fg-secondary)]">
              {totalContacts} contactos
            </span>
            {groups > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                {groups} grupos
              </span>
            )}
            {withUnread > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-[var(--warning)]/10 text-[var(--warning)]">
                {withUnread} no leídos
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {!selectedInstance ? (
        <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--border)]/50 flex items-center justify-center">
            <Wifi size={22} className="text-[var(--fg-tertiary)]" />
          </div>
          <p className="text-[14px] font-semibold text-[var(--fg)]">Selecciona una instancia</p>
          <p className="text-[13px] text-[var(--fg-tertiary)]">Elige una instancia para ver sus contactos</p>
        </div>
      ) : isLoading ? (
        <PageSpinner />
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--border)]/50 flex items-center justify-center">
            <BookUser size={22} className="text-[var(--fg-tertiary)]" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--fg)]">
              {debouncedSearch ? 'Sin resultados' : 'No hay contactos'}
            </p>
            <p className="text-[13px] text-[var(--fg-tertiary)] mt-1">
              {debouncedSearch
                ? `No se encontró "${debouncedSearch}"`
                : 'Los contactos aparecen cuando recibes mensajes o al sincronizar'}
            </p>
          </div>
          {!debouncedSearch && selectedInstance?.status === 'CONNECTED' && (
            <button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncMut.isPending ? 'animate-spin' : ''} />
              {syncMut.isPending ? 'Sincronizando...' : 'Importar contactos desde WhatsApp'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {contacts.map(contact => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 rounded-[8px] border border-[var(--border)] flex items-center justify-center text-[var(--fg-secondary)] hover:bg-[var(--border)]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pg: number;
                  if (totalPages <= 7) pg = i + 1;
                  else if (page <= 4) pg = i + 1;
                  else if (page >= totalPages - 3) pg = totalPages - 6 + i;
                  else pg = page - 3 + i;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={cn(
                        'w-8 h-8 rounded-[8px] text-[12.5px] font-medium transition-colors',
                        page === pg
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--fg-secondary)] hover:bg-[var(--border)]/40',
                      )}
                    >
                      {pg}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 rounded-[8px] border border-[var(--border)] flex items-center justify-center text-[var(--fg-secondary)] hover:bg-[var(--border)]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
