/** API contract. Field names match the FastAPI schemas (backend/app/schemas.py). */

export type Status = 'new' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Business {
  name: string;
  tagline: string;
  address: string;
  phone: string;
}

export interface Service {
  id: number;
  name: string;
  category: string;
  duration: number;
  price: number;
  active: boolean;
}

export type ServiceInput = Omit<Service, 'id'>;

export interface Master {
  id: number;
  name: string;
  role: string;
  color: string;
  service_ids: number[];
  /** Working weekdays, 0 = Monday. */
  work_days: number[];
}

export interface Slot {
  time: string;
  master_ids: number[];
}

export interface DayAvailability {
  date: string;
  slots: Slot[];
}

export interface DaySummary {
  date: string;
  free: number;
}

export interface BookingInput {
  service_id: number;
  master_id: number | null;
  date: string;
  time: string;
  client_name: string;
  client_phone: string;
  comment: string;
}

export interface Booking {
  id: number;
  start: string;
  end: string;
  status: Status;
  price: number;
  comment: string;
  created_at: string | null;
  service_id: number;
  service_name: string;
  master_id: number;
  master_name: string;
  client_id: number;
  client_name: string;
  client_phone: string;
}

export interface ClientRow {
  id: number;
  name: string;
  phone: string;
  visits: number;
  spent: number;
  last_visit: string | null;
  next_visit: string | null;
}

export interface Stats {
  days: number;
  revenue: number;
  revenue_prev: number;
  bookings: number;
  bookings_prev: number;
  avg_check: number;
  new_clients: number;
  cancel_rate: number;
  by_day: { date: string; revenue: number; bookings: number }[];
  top_services: { name: string; bookings: number; revenue: number }[];
  masters: { id: number; name: string; color: string; utilization: number; revenue: number }[];
}

export interface Session {
  token: string;
  email: string;
}

export interface Api {
  readonly mode: 'demo' | 'http';
  business(): Promise<Business>;
  services(): Promise<Service[]>;
  masters(serviceId?: number): Promise<Master[]>;
  availability(serviceId: number, date: string, masterId: number | null): Promise<DayAvailability>;
  availabilityDays(serviceId: number, from: string, days: number, masterId: number | null): Promise<DaySummary[]>;
  book(input: BookingInput): Promise<Booking>;
  login(email: string, password: string): Promise<Session>;
  admin: {
    bookings(from: string, to: string): Promise<Booking[]>;
    setStatus(id: number, status: Status): Promise<Booking>;
    clients(): Promise<ClientRow[]>;
    services(): Promise<Service[]>;
    createService(input: ServiceInput): Promise<Service>;
    updateService(id: number, input: ServiceInput): Promise<Service>;
    deleteService(id: number): Promise<void>;
    stats(days: number): Promise<Stats>;
  };
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  completed: 'Пришёл',
  cancelled: 'Отменена',
  no_show: 'Не пришёл',
};
