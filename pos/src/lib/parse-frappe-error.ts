/**
 * Extract a short, user-friendly message from Frappe API error payloads.
 * Avoids showing full Python tracebacks in the UI.
 */
const MAX_FRIENDLY_LENGTH = 280;
const TRACEBACK_MARKERS = ['Traceback (most recent call last)', 'File "', '  at ', '  File '];

function looksLikeTraceback(s: string): boolean {
  return TRACEBACK_MARKERS.some((m) => s.includes(m)) || (s.includes('\n') && s.length > 200);
}

function extractFromTraceback(exc: string): string {
  // frappe.throw(_("User message here"))
  const throwMatch = exc.match(/frappe\.throw\s*\(\s*_\s*\(\s*["']([^"']+)["']\s*\)\s*\)/);
  if (throwMatch) {
    const msg = throwMatch[1].trim();
    if (msg.length > 0 && msg.length <= MAX_FRIENDLY_LENGTH) return msg;
  }
  // ValidationError: message
  const validationMatch = exc.match(/(?:ValidationError|Error):\s*(.+?)(?:\n|$)/i);
  if (validationMatch) {
    const msg = validationMatch[1].trim();
    if (msg.length < MAX_FRIENDLY_LENGTH) return msg;
  }
  // Last non-empty line that doesn't look like code (no "File ", no "  at ")
  const lines = exc.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.length > 0 && line.length < MAX_FRIENDLY_LENGTH && !line.startsWith('File ') && !line.startsWith('at ')) {
      const cleaned = line.replace(/^.*frappe\.throw\([^)]*\)\s*$/, '').trim();
      if (cleaned.length > 0) return cleaned;
      return line;
    }
  }
  return 'Something went wrong. Please try again.';
}

export interface FrappeErrorPayload {
  message?: string;
  exc?: string;
  _server_messages?: string;
  exception?: string;
}

/**
 * Returns a short, user-facing error message from a Frappe error payload or Error.
 */
export function parseFrappeErrorMessage(
  payload: FrappeErrorPayload | Error | string | null | undefined,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (payload == null) return fallback;

  if (typeof payload === 'string') {
    if (!looksLikeTraceback(payload) && payload.length <= MAX_FRIENDLY_LENGTH) return payload;
    return extractFromTraceback(payload);
  }

  if (payload instanceof Error) {
    const msg = payload.message || '';
    if (!looksLikeTraceback(msg) && msg.length <= MAX_FRIENDLY_LENGTH) return msg;
    return extractFromTraceback(msg);
  }

  const o = payload as FrappeErrorPayload;

  // _server_messages is often JSON array of { message: "..." }
  if (typeof o._server_messages === 'string') {
    try {
      const arr = JSON.parse(o._server_messages) as Array<{ message?: string }>;
      if (Array.isArray(arr) && arr[0]?.message && typeof arr[0].message === 'string') {
        const m = arr[0].message.trim();
        if (m.length > 0 && m.length <= MAX_FRIENDLY_LENGTH) return m;
        if (m.length > 0) return m.slice(0, MAX_FRIENDLY_LENGTH) + (m.length > MAX_FRIENDLY_LENGTH ? '…' : '');
      }
    } catch {
      // ignore parse errors
    }
  }

  if (typeof o.exception === 'string') {
    const cleaned = o.exception.replace(/^.*ValidationError:\s*/i, '').trim();
    if (cleaned.length > 0 && cleaned.length <= MAX_FRIENDLY_LENGTH) return cleaned;
    if (cleaned.length > 0) return extractFromTraceback(o.exception);
  }

  if (typeof o.message === 'string' && o.message.length > 0) {
    if (!looksLikeTraceback(o.message) && o.message.length <= MAX_FRIENDLY_LENGTH) return o.message;
    return extractFromTraceback(o.message);
  }

  if (typeof o.exc === 'string' && o.exc.length > 0) {
    return extractFromTraceback(o.exc);
  }

  return fallback;
}
