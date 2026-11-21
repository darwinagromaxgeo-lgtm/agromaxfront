import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Company } from '../../../shared/types';
import type { useStockAdjustmentSession } from '../hooks/useStockAdjustmentSession';

type Session = ReturnType<typeof useStockAdjustmentSession>;

export function StockAdjustmentCompany({ session, companies, onChange }: { session: Session; companies: Company[]; onChange: (companyId: string) => void }) {
  if (companies.length === 1) return null;
  return <label className="block text-sm font-medium text-gray-700 mb-4">
    Empresa
    <select value={session.companyId} onChange={event => onChange(event.target.value)} disabled={session.pending} required className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white">
      <option value="">Seleccionar empresa...</option>
      {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
    </select>
  </label>;
}

export function StockAdjustmentFeedback({ session, onRefresh }: { session: Session; onRefresh: () => void }) {
  return <>
    {session.loading && <p role="status" className="text-sm text-gray-500 mb-4">Cargando inventario...</p>}
    {(session.error || session.notice || session.loadFailed) && <div role={session.error || session.loadFailed ? 'alert' : 'status'} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-4">
      <div className="flex gap-2"><AlertTriangle size={18} className="shrink-0" /><span>{session.error || (session.loadFailed ? 'No se pudo cargar el inventario.' : session.notice)}</span></div>
      {(session.needsReview || session.loadFailed) && <button type="button" onClick={onRefresh} disabled={session.loading || session.pending} className="mt-2 inline-flex gap-1.5 items-center font-semibold underline"><RefreshCw size={14} />Actualizar stock y revisar</button>}
    </div>}
  </>;
}
