const SELLER_VIEWS = ['/pos', '/sales', '/quotes', '/clients'];

export function roleHome(role?: string): string {
  return role === 'VENDEDOR' ? '/pos' : '/dashboard';
}

export function canAccessView(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  if (role !== 'VENDEDOR') return true;
  return pathname === '/' || SELLER_VIEWS.some(path => pathname === path || pathname.startsWith(path + '/'));
}
