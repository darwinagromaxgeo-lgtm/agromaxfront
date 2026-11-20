import type { Branch, User } from '../../../shared/types';

type SessionRestore =
  | { status: 'AUTHENTICATED'; user: User; branches: Branch[] }
  | { status: 'EXPIRED' | 'UNAVAILABLE' };

export async function restoreSession(loadUser: () => Promise<User | null>, loadBranches: () => Promise<Branch[]>): Promise<SessionRestore> {
  try {
    const user = await loadUser();
    if (!user) return { status: 'EXPIRED' };
    const branches = await loadBranches();
    return { status: 'AUTHENTICATED', user, branches };
  } catch (error: any) {
    return { status: error.response?.status === 401 ? 'EXPIRED' : 'UNAVAILABLE' };
  }
}
