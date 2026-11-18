import { CheckCircle2, Eye, FileText, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Sale } from '../../../shared/types';
import type { BillingDocument } from '../../billing/types';
import type { BillingPrintDocument } from '../../billing/utils/printTypes';

const statuses = { DRAFT: 'Pendiente de emisión', SENDING: 'En proceso', PENDING: 'Pendiente de SUNAT', ACCEPTED: 'Aceptado por SUNAT', REJECTED: 'Rechazado por SUNAT', UNKNOWN: 'Resultado por verificar', DISCARDED: 'Descartado' };
export function CheckoutBillingResult({ sale, documents, busy, error, onPreview, onRefresh, note }: {
  sale: Sale; documents: BillingDocument[]; busy: boolean; error?: string; note?: BillingPrintDocument;
  onPreview: (document: BillingPrintDocument) => void; onRefresh: () => void;
}) {
  const deposit = sale.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
  const pending = (Math.round(sale.total * 100) - Math.round(deposit * 100)) / 100;
  return <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-xl bg-primary-50 p-4"><CheckCircle2 size={22} className="shrink-0 text-primary-600" /><div><p className="font-bold text-primary-900">Venta registrada</p><p className="mt-1 text-xs text-primary-700">Referencia {sale.id.slice(-8).toUpperCase()} · S/ {sale.total.toFixed(2)}</p></div></div>
    {sale.isCredit && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-gray-800"><p>Abono inicial registrado: <strong>S/ {deposit.toFixed(2)}</strong></p><p className="mt-1">Saldo de esta venta al registrarla: <strong>S/ {pending.toFixed(2)}</strong></p><p className="mt-2">Puedes registrar los siguientes abonos en Créditos, dentro del cliente.</p>{sale.clientId && !busy && <Link to={`/credits/client/${sale.clientId}`} className="mt-3 inline-block font-bold text-orange-900 underline">Ver créditos del cliente</Link>}</div>}
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Procesando comprobante…</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}<span className="mt-2 block text-xs">La venta ya está guardada. Continuar la emisión utiliza esta misma venta.</span></p>}
    {note && <div className="rounded-xl border border-slate-200 p-4"><p className="flex items-center gap-2 font-bold text-slate-800"><FileText size={18} /> Nota de venta</p><p className="mt-1 text-xs text-slate-500">Documento interno. Sin envío a SUNAT.</p><button onClick={() => onPreview(note)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary-200 px-3 py-2 text-sm font-semibold text-primary-700"><Eye size={15} /> Ver A4 y ticket</button></div>}
    {documents.map(document => <section key={document.id} className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-slate-800">{document.documentType === 'FACTURA' ? 'Factura' : 'Boleta'} {document.series && `${document.series}-${String(document.number).padStart(8, '0')}`}</p><p className="mt-1 text-xs text-slate-500">{document.taxType} · S/ {document.total.toFixed(2)}</p></div><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${document.status === 'ACCEPTED' ? 'bg-green-50 text-green-700' : document.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{statuses[document.status]}</span></div>
      <p className="mt-3 text-sm text-slate-700">{document.receiver.name}</p>{document.sunatDescription && <p className="mt-2 text-xs text-slate-500">{document.sunatDescription}</p>}
      <button onClick={() => onPreview(document)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary-200 px-3 py-2 text-sm font-semibold text-primary-700"><Eye size={15} /> Ver A4 y ticket</button>
    </section>)}
    {sale.isCredit && documents.some(document => document.status === 'DRAFT') && <p className="text-sm text-amber-800">La venta a crédito está registrada. La emisión queda pendiente de configurar las cuotas fiscales.</p>}
    {documents.some(document => ['PENDING', 'SENDING', 'UNKNOWN'].includes(document.status)) && <button disabled={busy} onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"><RefreshCw size={15} /> Actualizar estado</button>}
  </div>;
}
