export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const API = `${BACKEND_URL}/api`;

export function formatIDR(n: number): string {
  if (isNaN(n)) return "Rp0";
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
