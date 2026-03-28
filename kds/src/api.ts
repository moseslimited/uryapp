export type KotApiResponse = {
  KOT: any[];
  Branch: string | null;
  kot_alert_time: number | null;
  audio_alert: number | null;
  daily_order_number: number | null;
};

function getCsrfToken(): string | null {
  // Provided by `urymosaic.html` template (same as `pos.html`)
  return (window as any).csrf_token || null;
}

async function frappeGet<T>(method: string, params: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`/api/method/${method}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}). ${text}`);
  }
  const json = await res.json();
  return (json.message ?? json) as T;
}

async function frappePost<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const csrf = getCsrfToken();
  const res = await fetch(`/api/method/${method}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(csrf ? { "X-Frappe-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}). ${text}`);
  }
  const json = await res.json();
  return (json.message ?? json) as T;
}

export async function fetchReadyKots(production: string): Promise<KotApiResponse> {
  return frappeGet<KotApiResponse>("ury.ury.api.ury_kot_display.kot_list", { production });
}

export async function fetchServedKots(production: string): Promise<KotApiResponse> {
  return frappeGet<KotApiResponse>("ury.ury.api.ury_kot_display.served_kot_list", { production });
}

export async function serveKot(name: string): Promise<void> {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour12: false }); // HH:MM:SS
  await frappePost("ury.ury.api.ury_kot_display.serve_kot", { name, time });
}

export async function confirmCancelKot(name: string, user: string): Promise<void> {
  await frappePost("ury.ury.api.ury_kot_display.confirm_cancel_kot", { name, user });
}

