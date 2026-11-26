const SELLER_VIEWS = ['/pos', '/sales', '/quotes', '/clients'];
const ACCOUNTING_VIEWS = [
  /^\/(dashboard|sales|stock|clients|billing|invoices|accounts-payable)\/?$/,
  /^\/purchases(?:\/[a-f\d]{24})?\/?$/i,
  /^\/cash-register(?:\/history)?\/?$/,
  /^\/credits(?:\/client\/[a-f\d]{24})?\/?$/i,
  /^\/kardex(?:\/product\/[a-f\d]{24})?\/?$/i,
  /^\/agreements\/[a-f\d]{24}\/?$/i,
];

type AccessAccount = { role: string; canTransferStock?: boolean; branchAssignments?: { branchId: string; role: string }[] } | null;
export function canTransferBetweenBranches(user: AccessAccount): boolean {
  return user?.role === 'ADMIN' || (user?.role === 'VENDEDOR' && user.canTransferStock === true);
}
export function isAccountingReadOnly(user: AccessAccount, branchId?: string): boolean {
  return user?.role === 'CONTABILIDAD' || !!user?.branchAssignments?.some(item => item.branchId === branchId && item.role === 'CONTABILIDAD');
}

export function accessRole(user: AccessAccount, branchId?: string): string | undefined {
  return isAccountingReadOnly(user, branchId) ? 'CONTABILIDAD' : user?.role;
}

export function roleHome(role?: string): string {
  return role === 'VENDEDOR' ? '/pos' : '/dashboard';
}

export function canAccessView(role: string | undefined, pathname: string, user: AccessAccount = null): boolean {
  if (!role) return false;
  if (role === 'CONTABILIDAD') return pathname === '/' || ACCOUNTING_VIEWS.some(pattern => pattern.test(pathname));
  if (role !== 'VENDEDOR') return true;
  if (canTransferBetweenBranches(user) && /^\/stock-requests\/?$/.test(pathname)) return true;
  return pathname === '/' || /^\/cash-register(?:\/history)?\/?$/.test(pathname) || /^\/credits(?:\/client\/[a-f\d]{24})?\/?$/i.test(pathname) || SELLER_VIEWS.some(path => pathname === path || pathname.startsWith(path + '/'));
}
