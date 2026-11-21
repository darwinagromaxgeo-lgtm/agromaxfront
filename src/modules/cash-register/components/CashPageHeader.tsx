import { Building2, History, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

export function CashPageHeader({ history = false, branchName, actions }: { history?: boolean; branchName?: string; actions?: ReactNode }) {
  const Icon = history ? History : Wallet;
  return <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary-100 bg-primary-50 text-primary-700"><Icon size={24} /></div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-950">{history ? 'Historial de Cajas' : 'Caja del Día'}</h1>
        <p className="mt-1 text-sm text-gray-600">{history ? 'Consulta los movimientos y el cuadre de cada día.' : 'Ingresos, egresos y efectivo para tu cuadre.'}</p>
        {branchName && <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary-800"><Building2 size={12} />{branchName}</p>}
      </div>
    </div>
    {actions}
  </header>;
}
