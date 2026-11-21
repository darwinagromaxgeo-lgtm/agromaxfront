import type { ReactNode } from 'react';
import { useAuth } from '../../app/providers/AuthProvider';
import { isAccountingReadOnly } from '../utils/accessPolicy';

export function useAccountingReadOnly(): boolean {
  const { user, selectedBranch } = useAuth();
  return isAccountingReadOnly(user, selectedBranch?.id);
}

/** Business actions are also protected independently by the API. */
export function WriteAccess({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useAccountingReadOnly() ? fallback : children}</>;
}
