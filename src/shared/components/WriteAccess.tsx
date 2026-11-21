import type { ReactNode } from 'react';
import { useAuth } from '../../app/providers/AuthProvider';
import { isAccountingReadOnly } from '../utils/accessPolicy';

export function useAccountingReadOnly(): boolean {
  const { user, selectedBranch } = useAuth();
  return isAccountingReadOnly(user, selectedBranch?.id);
}

/** Business actions are also protected independently by the API. */
export function WriteAccess({ children, fallback = null, excludeRoles = [] }: { children: ReactNode; fallback?: ReactNode; excludeRoles?: string[] }) {
  const { user, selectedBranch } = useAuth();
  const blocked = isAccountingReadOnly(user, selectedBranch?.id) || excludeRoles.includes(user?.role || '');
  return <>{blocked ? fallback : children}</>;
}
