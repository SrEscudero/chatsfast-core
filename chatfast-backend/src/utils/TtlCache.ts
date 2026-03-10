// ============================================================
// TtlCache<V> — Caché en memoria con expiración automática
//
// Por qué no Redis aquí:
//   Las fotos de perfil cambian raramente (1-2 veces al año por usuario).
//   Un caché en proceso de 15 minutos elimina el 95%+ de llamadas
//   repetidas a Evolution API sin necesidad de infra adicional.
//
//   Si en el futuro ChatFast escala a múltiples instancias del proceso,
//   se puede reemplazar por un adapter de Redis sin cambiar la interfaz.
//
// Uso:
//   const cache = new TtlCache<string>(15 * 60 * 1000); // 15 min
//   cache.set('key', 'value');
//   cache.get('key'); // 'value' o undefined si expiró
// ============================================================

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;

    // Limpieza periódica para no acumular entradas expiradas en memoria
    // Se ejecuta cada 5 minutos, eliminando solo las entradas vencidas
    setInterval(() => this.purgeExpired(), 5 * 60 * 1000).unref();
    // .unref() evita que este interval mantenga vivo el proceso de Node
    // cuando el servidor intenta cerrarse (graceful shutdown)
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  get size(): number {
    return this.store.size;
  }
}