'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Circle, Trash2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { SSE_URLS } from '@/lib/api';

interface LogEntry {
  id: number;
  level: string;
  message: string;
  timestamp: string;
}

const LEVEL_STYLES: Record<string, string> = {
  error: 'text-[var(--destructive)]',
  warn:  'text-[var(--warning)]',
  info:  'text-[var(--fg)]',
  debug: 'text-[var(--fg-tertiary)]',
  http:  'text-[var(--accent)]',
};

const LEVEL_BG: Record<string, string> = {
  error: 'bg-[var(--destructive)]',
  warn:  'bg-[var(--warning)]',
  info:  'bg-[var(--success)]',
  debug: 'bg-[var(--fg-tertiary)]',
  http:  'bg-[var(--accent)]',
};

let logCounter = 0;

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (reconnectRef.current) clearTimeout(reconnectRef.current);

    const ac = new AbortController();
    abortRef.current = ac;

    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    fetch(SSE_URLS.liveLogs, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ac.signal,
    }).then(async (res) => {
      if (!res.ok) {
        setConnected(false);
        if (!ac.signal.aborted) reconnectRef.current = setTimeout(connect, 5000);
        return;
      }

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
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5));
              if (eventName === 'connected') {
                setConnected(true);
              } else if (eventName === 'log') {
                setLogs(prev => [
                  ...prev.slice(-499),
                  {
                    id: ++logCounter,
                    level: data.level ?? 'info',
                    message: data.message,
                    timestamp: data.timestamp,
                  },
                ]);
              }
            } catch { /* ignore */ }
            eventName = '';
          }
        }
      }

      // Stream ended — reconnect
      if (!ac.signal.aborted) {
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      }
    }).catch(() => {
      setConnected(false);
      if (!ac.signal.aborted) {
        reconnectRef.current = setTimeout(connect, 5000);
      }
    });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      abortRef.current?.abort();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  // Auto scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const downloadLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `chatfast-logs-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const visibleLogs = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="max-w-6xl space-y-4 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Circle
            size={8}
            className={cn(
              'fill-current',
              connected ? 'text-[var(--success)] animate-pulse' : 'text-[var(--destructive)]',
            )}
          />
          <span className="text-[12px] text-[var(--fg-secondary)]">
            {connected ? 'Conectado' : 'Conectando...'}
          </span>
        </div>

        {/* Level filter */}
        <div className="flex gap-1">
          {['all', 'error', 'warn', 'info', 'debug', 'http'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-[6px] transition-colors',
                filter === lvl
                  ? 'bg-[var(--fg)] text-[var(--bg-elevated)]'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--border)]/40',
              )}
            >
              {lvl === 'all' ? 'Todos' : lvl.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-[11px] text-[var(--fg-tertiary)]">{logs.length} entradas</span>
        <Button variant="ghost" size="sm" onClick={() => setLogs([])} title="Limpiar">
          <Trash2 size={13} />
        </Button>
        <Button variant="secondary" size="sm" onClick={downloadLogs}>
          <Download size={13} />
          Exportar
        </Button>
      </div>

      {/* Log terminal */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--radius)] overflow-hidden relative"
        style={{ minHeight: '65vh' }}
      >
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto p-4 font-mono text-[12px] leading-6 space-y-0.5"
          style={{ maxHeight: '70vh' }}
        >
          {visibleLogs.length === 0 ? (
            <p className="text-[var(--fg-tertiary)] text-center py-12">
              {connected ? 'Esperando logs...' : 'Conectando al stream...'}
            </p>
          ) : (
            visibleLogs.map((log) => (
              <div key={log.id} className="flex gap-3 items-baseline group">
                <span className="text-[var(--fg-tertiary)] flex-shrink-0 text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString('es', { hour12: false })}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center px-1 py-0 rounded text-[9px] font-bold flex-shrink-0 uppercase',
                    LEVEL_BG[log.level] ?? 'bg-[var(--border)]',
                    'text-white',
                  )}
                >
                  {log.level}
                </span>
                <span className={cn('flex-1 break-all', LEVEL_STYLES[log.level] ?? 'text-[var(--fg)]')}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Auto-scroll indicator */}
        {!autoScroll && (
          <div className="absolute bottom-4 right-4">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAutoScroll(true);
                containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
              }}
            >
              ↓ Final
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
