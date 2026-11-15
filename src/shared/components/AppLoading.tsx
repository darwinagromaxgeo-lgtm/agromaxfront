import { BrandLogo } from './BrandLogo';

export function AppLoading() {
  return <div role="status" aria-live="polite" className="flex min-h-64 flex-col items-center justify-center gap-3 py-10">
    <BrandLogo variant="icon" decorative className="h-16 w-16 rounded-2xl" />
    <span className="text-sm font-semibold text-primary-900">Agromax</span>
    <div aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 motion-reduce:animate-none" />
    <span className="text-xs text-gray-500">Cargando…</span>
  </div>;
}
