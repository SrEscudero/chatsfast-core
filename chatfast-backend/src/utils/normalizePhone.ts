// ============================================================
// normalizePhone — Normalización consistente de números WhatsApp
//
// Problema que resuelve:
//   Sin normalizar, "5215512345678" y "5215512345678@s.whatsapp.net"
//   son tratados como claves distintas en caché, logs, DB, etc.
//   Evolution API acepta ambos pero devuelve siempre con @s.whatsapp.net.
//
// Reglas:
//   - Grupos (@g.us) → no modificar, Evolution los maneja exactamente así
//   - Números ya con @s.whatsapp.net → devolver tal cual
//   - Números solo dígitos → agregar @s.whatsapp.net
// ============================================================

export function normalizePhone(number: string): string {
  if (number.endsWith('@g.us')) return number;
  if (number.endsWith('@s.whatsapp.net')) return number;
  return `${number}@s.whatsapp.net`;
}

// Inverso: extraer solo los dígitos (útil para logs y Evolution endpoints que aceptan solo número)
export function stripPhoneSuffix(number: string): string {
  return number.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
}