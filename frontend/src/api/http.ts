import { ApiError, type Api, type Booking, type ServiceInput, type Status } from './types';

/** Talks to the FastAPI backend. */
export function createHttpApi(baseUrl: string, getToken: () => string | null): Api {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token && path.startsWith('/api/admin')) headers.set('Authorization', `Bearer ${token}`);

    let res: Response;
    try {
      res = await fetch(baseUrl + path, { ...init, headers });
    } catch {
      throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    }
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, errorMessage(body) ?? `Ошибка ${res.status}`);
    return body as T;
  }

  const qs = (params: Record<string, string | number | null | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) p.set(k, String(v));
    return `?${p}`;
  };
  const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

  return {
    mode: 'http',
    business: () => request('/api/business'),
    services: () => request('/api/services'),
    masters: (serviceId) => request(`/api/masters${qs({ service_id: serviceId })}`),
    availability: (serviceId, date, masterId) =>
      request(`/api/availability${qs({ service_id: serviceId, date, master_id: masterId })}`),
    availabilityDays: (serviceId, from, days, masterId) =>
      request(`/api/availability/days${qs({ service_id: serviceId, from, days, master_id: masterId })}`),
    book: (input) => request<Booking>('/api/bookings', json('POST', input)),
    login: (email, password) => request('/api/auth/login', json('POST', { email, password })),
    admin: {
      bookings: (from, to) => request(`/api/admin/bookings${qs({ from, to })}`),
      setStatus: (id: number, status: Status) => request(`/api/admin/bookings/${id}`, json('PATCH', { status })),
      clients: () => request('/api/admin/clients'),
      services: () => request('/api/admin/services'),
      createService: (input: ServiceInput) => request('/api/admin/services', json('POST', input)),
      updateService: (id: number, input: ServiceInput) => request(`/api/admin/services/${id}`, json('PUT', input)),
      deleteService: (id: number) => request(`/api/admin/services/${id}`, { method: 'DELETE' }),
      stats: (days: number) => request(`/api/admin/stats${qs({ days })}`),
    },
  };
}

/** FastAPI returns either {"detail": "text"} or {"detail": [{"msg": ...}]}. */
function errorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '');
  return null;
}
