const SELLER_VIEWS = ['/pos', '/sales', '/quotes', '/clients'];
const ACCOUNTING_VIEWS = [
  /^\/(dashboard|sales|stock|clients|billing|invoices|accounts-payable)\/?$/,
  /^\/purchases(?:\/[a-f\d]{24})?\/?$/i,
  /^\/cash-register(?:\/history)?\/?$/,
  /^\/credits(?:\/client\/[a-f\d]{24})?\/?$/i,
  /^\/kardex(?:\/product\/[a-f\d]{24})?\/?$/i,
  /^\/agreements\/[a-f\d]{24}\/?$/i,
];

type AccessAccount = { role: string; branchAssignments?: { branchId: string; role: string }[] } | null;
export function isAccountingReadOnly(user: AccessAccount, branchId?: string): boolean {
  return user?.role === 'CONTABILIDAD' || !!user?.branchAssignments?.some(item => item.branchId === branchId && item.role === 'CONTABILIDAD');
}

export function accessRole(user: AccessAccount, branchId?: string): string | undefined {
  return isAccountingReadOnly(user, branchId) ? 'CONTABILIDAD' : user?.role;
}

export function roleHome(role?: string): string {
  return role === 'VENDEDOR' ? '/pos' : '/dashboard';
}

export function canAccessView(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  if (role === 'CONTABILIDAD') return pathname === '/' || ACCOUNTING_VIEWS.some(pattern => pattern.test(pathname));
  if (role !== 'VENDEDOR') return true;
  return pathname === '/' || SELLER_VIEWS.some(path => pathname === path || pathname.startsWith(path + '/'));
}
