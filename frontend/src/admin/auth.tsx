import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, SESSION_KEY } from '../api/client';

interface AuthValue {
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const EMAIL_KEY = 'slotly-email';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => (read(SESSION_KEY) ? read(EMAIL_KEY) : null));

  const login = useCallback(async (e: string, password: string) => {
    const session = await api.login(e, password);
    localStorage.setItem(SESSION_KEY, session.token);
    localStorage.setItem(EMAIL_KEY, session.email);
    setEmail(session.email);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setEmail(null);
  }, []);

  const value = useMemo(() => ({ email, login, logout }), [email, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { email } = useAuth();
  const location = useLocation();
  if (!email) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Logs out when the API reports an expired session. */
export function useAuthGuard() {
  const { logout } = useAuth();
  return useCallback(
    (err: unknown) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) logout();
    },
    [logout],
  );
}
