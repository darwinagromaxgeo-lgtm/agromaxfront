import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { CashRegister } from '../../../shared/types';
import { summarizeCash } from '../utils/cashSummary';
import { CashMethodBreakdown, money } from './CashOverview';

export interface CashCloseInput { countedCash: number; expectedRevision: number; notes: string }

export function CashCloseForm({ register, pending, onSubmit }: {
  register: CashRegister; pending: boolean; onSubmit: (data: CashCloseInput) => Promise<unknown>;
}) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const summary = summarizeCash(register.openingBalance, register.entries);
  const amount = Number(counted);
  const valid = counted.trim() !== '' && Number.isFinite(amount) && amount >= 0 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
  const difference = (Math.round(amount * 100) - Math.round(summary.expectedCash * 100)) / 100;
  const hasDifference = valid && difference !== 0;
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (!valid || summary.unclassifiedCount || (hasDifference && notes.trim().length < 5)) return;
    setError('');
    try { await onSubmit({ countedCash: amount, expectedRevision: register.revision || 0, notes: notes.trim() }); } catch (caught: any) {
      setError(caught.response?.status === 409 ? 'La caja cambió. Cierra este cuadro y vuelve a abrir el arqueo para revisar los movimientos actualizados.' : 'No se pudo cerrar la caja. Revisa el aviso e inténtalo de nuevo.');
    }
  }}>
    <p className="text-sm text-gray-600">Cuenta los billetes y monedas de la caja. Yape, tarjetas y transferencias se muestran por separado.</p>
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
      <p className="text-sm font-semibold text-primary-800">Efectivo esperado en caja</p>
      <p className="mt-1 text-2xl font-bold text-primary-900">{money(summary.expectedCash)}</p>
      <p className="mt-1 text-xs text-primary-800">Incluye la apertura de {money(register.openingBalance)}.</p>
    </div>
    <CashMethodBreakdown methods={summary.methods} />
    {summary.unclassifiedCount > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Identifica el método de {summary.unclassifiedCount} movimiento(s) antes de cerrar.</p>}
    <div><label htmlFor="cash-counted" className="mb-1 block text-sm font-semibold text-gray-800">Efectivo contado (S/)</label>
      <input id="cash-counted" type="number" min="0" step="0.01" required value={counted} onChange={e => setCounted(e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl font-bold text-gray-900" /></div>
    {valid && <div role="status" className={`rounded-xl p-3 text-sm font-semibold ${hasDifference ? 'bg-amber-50 text-amber-900' : 'bg-primary-50 text-primary-800'}`}>
      {difference < 0 ? `Faltante: ${money(-difference)}` : difference > 0 ? `Sobrante: ${money(difference)}` : 'El efectivo contado coincide con el esperado.'}
    </div>}
    <div><label htmlFor="cash-close-notes" className="mb-1 block text-sm font-semibold text-gray-800">{hasDifference ? 'Motivo de la diferencia (obligatorio)' : 'Observaciones (opcional)'}</label>
      <textarea id="cash-close-notes" value={notes} onChange={e => setNotes(e.target.value)} required={hasDifference} minLength={hasDifference ? 5 : undefined} rows={3} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" /></div>
    <p className="text-xs text-gray-500">El cierre guardará el conteo y bloqueará nuevos movimientos en esta caja. La diferencia queda registrada y no crea un ajuste automático.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={pending || !valid || summary.unclassifiedCount > 0 || (hasDifference && notes.trim().length < 5)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 font-semibold text-white disabled:opacity-50">
      <Lock size={16} />{pending ? 'Cerrando…' : 'Confirmar cierre con arqueo'}
    </button>
  </form>;
}
