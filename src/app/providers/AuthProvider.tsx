import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../../shared/services/api';
import type { Branch, User } from '../../shared/types';
import { restoreSession } from '../../modules/auth/services/restoreSession';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  branches: Branch[];
  selectedBranch: Branch | null;
  selectBranch: (branchId: string) => void;
  refreshBranches: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);

  const refreshBranches = useCallback(async () => {
    const response = await api.get('/branches/accessible');
    const available: Branch[] = response.data.data || [];
    const selectedId = localStorage.getItem('selectedBranchId');
    const active = available.find(branch => branch.id === selectedId) || available[0] || null;
    setBranches(available);
    setSelectedBranch(active);
    if (active) localStorage.setItem('selectedBranchId', active.id);
    else localStorage.removeItem('selectedBranchId');
  }, []);

  const fetchUser = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await restoreSession(
      () => api.get('/auth/me').then(response => response.data.data),
      () => api.get('/branches/accessible').then(response => response.data.data || []),
    );
    // Ignore a request from an earlier login once another account is active.
    const currentToken = localStorage.getItem('token');
    if (currentToken && currentToken !== token) return;
    if (!currentToken && result.status !== 'EXPIRED') { setIsLoading(false); return; }
    if (result.status === 'AUTHENTICATED') {
      setUser(result.user);
      const availableBranches = result.branches;
      setBranches(availableBranches);
      const savedId = localStorage.getItem('selectedBranchId');
      const activeBranch = availableBranches.find((branch) => branch.id === savedId) || availableBranches[0] || null;
      if (activeBranch) {
        localStorage.setItem('selectedBranchId', activeBranch.id);
        setSelectedBranch(activeBranch);
      }
      setSessionUnavailable(false);
    } else if (result.status === 'EXPIRED') {
      localStorage.removeItem('token');
      localStorage.removeItem('selectedBranchId');
      setToken(null);
      setUser(null);
      setBranches([]);
      setSelectedBranch(null);
      setSessionUnavailable(false);
    } else setSessionUnavailable(true);
    setIsLoading(false);
  }, [token]);

  useEffect(() => { fetchUser(); }, [fetchUser]);
  useEffect(() => {
    if (!sessionUnavailable || !token) return;
    const retry = () => { void fetchUser(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [sessionUnavailable, token, fetchUser]);

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    const res = data.data;
    localStorage.setItem('token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    setSessionUnavailable(false);
    const branchResponse = await api.get('/branches/accessible');
    const availableBranches: Branch[] = branchResponse.data.data || [];
    setBranches(availableBranches);
    const savedId = localStorage.getItem('selectedBranchId');
    const activeBranch = availableBranches.find((branch) => branch.id === savedId) || availableBranches[0] || null;
    if (activeBranch) {
      localStorage.setItem('selectedBranchId', activeBranch.id);
      setSelectedBranch(activeBranch);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setBranches([]);
    setSelectedBranch(null);
    setSessionUnavailable(false);
    localStorage.removeItem('selectedBranchId');
  };

  const selectBranch = (branchId: string) => {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return;
    localStorage.setItem('selectedBranchId', branch.id);
    setSelectedBranch(branch);
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, branches, selectedBranch, selectBranch, refreshBranches }}>
      {sessionUnavailable && token ? <div role="alert" className="grid min-h-screen place-items-center bg-gray-50 p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">No pudimos conectar con Agromax</h1>
          <p className="text-sm leading-6 text-gray-600">Tu sesión se conserva. Vuelve a intentar cuando se restablezca la conexión.</p>
          <button onClick={() => void fetchUser()} disabled={isLoading} className="w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{isLoading ? 'Conectando…' : 'Volver a intentar'}</button>
          <button onClick={logout} className="w-full py-2 text-sm font-semibold text-gray-600">Cerrar sesión</button>
        </div>
      </div> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
