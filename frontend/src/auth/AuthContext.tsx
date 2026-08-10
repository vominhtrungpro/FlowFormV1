import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setAuthToken, installUnauthorizedHandler } from '../api/client';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  tag: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'flowform.token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
  }

  async function login(email: string, password: string) {
    const { data } = await api.post('/api/auth/login', { email, password });
    localStorage.setItem(STORAGE_KEY, data.accessToken);
    setAuthToken(data.accessToken);
    setUser(data.user);
  }

  useEffect(() => {
    installUnauthorizedHandler(logout);

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    setAuthToken(stored);
    api
      .get('/api/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => logout())
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
