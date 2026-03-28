import { FrappeApp } from "frappe-js-sdk";
import axios, { AxiosInstance } from "axios";
import type { FrappeCall } from "frappe-js-sdk/lib/call";

// Get base URL - use current origin since we're on the same domain
const baseURL = typeof window !== 'undefined' 
  ? window.location.origin 
  : import.meta.env.VITE_FRAPPE_BASE_URL || '';

// Get CSRF token from window (set in pos.html when server-rendered)
const getCSRFToken = (): string | undefined => {
  if (typeof window !== 'undefined') {
    const w = window as any;
    if (w.csrf_token) return w.csrf_token;
    if (w.frappe?.boot?.csrf_token) return w.frappe.boot.csrf_token;
  }
  return undefined;
};

// Fetch CSRF token from API when page was not server-rendered (e.g. static pos.html)
let csrfFetchPromise: Promise<string | undefined> | null = null;
const fetchCSRFToken = (): Promise<string | undefined> => {
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = (async () => {
    try {
      const url = `${baseURL}/api/method/ury.ury_pos.api.get_csrf_token`;
      const res = await fetch(url, { method: "GET", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      const token = data?.message ?? data?.csrf_token;
      if (token && typeof window !== "undefined") (window as any).csrf_token = token;
      return token;
    } catch {
      return undefined;
    }
  })();
  return csrfFetchPromise;
};

const getOrFetchCSRFToken = (): Promise<string | undefined> => {
  const existing = getCSRFToken();
  if (existing) return Promise.resolve(existing);
  return fetchCSRFToken();
};

// Initialize FrappeApp
const frappe = new FrappeApp(baseURL);

// Get the axios instance used by frappe-js-sdk
// The SDK uses axios internally, so we need to configure it
const callInstance = frappe.call();

const attachInterceptors = (client: AxiosInstance, label: string) => {
  if (client.defaults.headers?.common) {
    delete client.defaults.headers.common["Expect"];
    delete client.defaults.headers.common["expect"];
  }
  if (client.defaults.headers?.post) {
    delete client.defaults.headers.post["Expect"];
    delete client.defaults.headers.post["expect"];
  }
  client.interceptors.request.use(
    async (config) => {
      if (config.url && (config.url.includes("/api/method/") || config.url.includes("/api/resource/"))) {
        const csrfToken = await getOrFetchCSRFToken();
        config.headers = config.headers || {};
        if (csrfToken) {
          config.headers["X-Frappe-CSRF-Token"] = csrfToken;
        }
        if (config.headers["Expect"]) {
          delete config.headers["Expect"];
        }
        if (config.headers["expect"]) {
          delete config.headers["expect"];
        }

        config.withCredentials = true;
        if (process.env.NODE_ENV !== "production") {
          console.debug(`[POS] ${label} request`, config.url, config.headers);
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
};

// Attach to default axios (used by some utilities)
attachInterceptors(axios, "global axios");

// Attach to frappe-js-sdk axios client
const internalAxios = (callInstance as unknown as FrappeCall & { axios?: AxiosInstance }).axios;
if (internalAxios) {
  attachInterceptors(internalAxios, "sdk axios");
} else {
  const axiosProp = (callInstance as Record<string, unknown>).axios;
  if (axiosProp && typeof axiosProp === "object") {
    const candidate = axiosProp as AxiosInstance;
    if (typeof candidate.interceptors?.request?.use === "function") {
      attachInterceptors(candidate, "sdk axios (fallback)");
    }
  }
}

// Override POST requests to use fetch (avoids Expect: 100-continue issues completely)
const originalPost = callInstance.post.bind(callInstance);
callInstance.post = async (path: string, params?: Record<string, unknown>) => {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return originalPost(path, params);
  }

  const csrfToken = await getOrFetchCSRFToken();
  const url = `${baseURL}/api/method/${path}`;

  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-Frappe-CSRF-Token": csrfToken } : {}),
    },
    body: JSON.stringify(params ?? {}),
  });

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    // ignore parse errors; we'll fall back to text
  }

  if (!response.ok) {
    const message =
      (typeof payload?.message === 'string' && payload.message) ||
      payload?.exc ||
      (await response.text().catch(() => "There was an error."));
    const error = {
      ...payload,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      message,
    };
    throw error;
  }

  return payload;
};

export const call = callInstance;
export const db = frappe.db();
export const auth = frappe.auth();