import { useState } from 'react';
import { Download, Eye, FileCheck2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingService } from '../../billing/services/billingService';
import type { BillingDocument } from '../../billing/types';
import type { Sale } from '../../../shared/types';
import { billingBlocksCancellation, billingReference, fiscalDocumentState } from '../utils/saleBilling';

export function SaleBillingBadge({ sale, documents, loading, error }: { sale: Sale; documents: BillingDocument[]; loading: boolean; error: boolean }) {
  if (loading) return <span className="text-xs text-gray-400">Consultando comprobante…</span>;
  if (error) return <span className="text-xs text-amber-700">Estado no disponible</span>;
  if (!documents.length) return <span className="text-xs text-gray-500">{sale.voucherType === 'NONE' ? 'Nota de venta' : `${sale.voucherType === 'FACTURA' ? 'Factura' : 'Boleta'} · sin emitir`}</span>;
  return <div className="space-y-1.5">{documents.map(document => <div key={document.id} className="flex flex-wrap items-center gap-1.5">
    <span className="font-mono text-xs font-semibold text-slate-800">{billingReference(document)}</span>
    <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${fiscalDocumentState(document).color}`}>{fiscalDocumentState(document).label}</span>
    {document.environment === 'beta' && <span className="text-[10px] text-slate-500">Pruebas</span>}
  </div>)}</div>;
}

export function SaleBillingDocuments({ documents, onPreview }: { documents: BillingDocument[]; onPreview: (document: BillingDocument) => void }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const download = async (document: BillingDocument, format: 'pdf' | 'xml' | 'cdr') => {
    setDownloading(`${document.id}:${format}`);
    try { await billingService.download(document, format); }
    catch { toast.error('No se pudo descargar el archivo del comprobante'); }
    finally { setDownloading(null); }
  };
  return <section className="space-y-3" aria-label="Comprobantes de esta venta">
    <h3 className="flex items-center gap-2 font-semibold text-gray-800"><FileCheck2 size={17} /> Comprobantes de esta venta</h3>
    {documents.map(document => <article key={document.id} className="space-y-3 rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-800">{document.documentType === 'FACTURA' ? 'Factura' : 'Boleta'} {billingReference(document)}</p><p className="mt-1 text-xs text-gray-500">{document.taxType} · S/ {document.total.toFixed(2)}{document.environment === 'beta' ? ' · PRUEBAS' : ''}</p></div><span className={`rounded-md px-2 py-1 text-xs font-semibold ${fiscalDocumentState(document).color}`}>{fiscalDocumentState(document).label}</span></div>
      <div className="text-sm text-slate-700"><p className="font-medium">{document.issuer.name} · RUC {document.issuer.documentNumber}</p><p className="mt-1">Cliente: {document.receiver.name}</p><p className="text-xs text-slate-500">{document.receiver.documentType === 'UNIDENTIFIED' ? 'Consumidor final · sin identificación' : `${document.receiver.documentType} ${document.receiver.documentNumber}`}</p></div>
      {document.sunatDescription && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{document.sunatCode !== undefined ? `Código ${document.sunatCode} · ` : ''}{document.sunatDescription}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onPreview(document)} className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700"><Eye size={15} /> Ver A4 y ticket</button>
        <a href={`/billing?documentId=${document.id}`} className="inline-flex items-center rounded-lg border px-3 py-2 text-xs font-medium text-gray-700">Abrir en Facturación</a>
        {(['pdf', 'xml', 'cdr'] as const).filter(format => document[format === 'pdf' ? 'hasPdf' : format === 'xml' ? 'hasXml' : 'hasCdr']).map(format => <button key={format} type="button" disabled={!!downloading} onClick={() => void download(document, format)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50">{downloading === `${document.id}:${format}` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}{format === 'pdf' ? 'PDF emitido' : format.toUpperCase()}</button>)}
      </div>
    </article>)}
    {billingBlocksCancellation(documents) && <p className="text-xs text-slate-500">El tipo de comprobante se conserva. Esta venta tiene una emisión enviada o pendiente de verificar; la anulación operativa no está disponible.</p>}
  </section>;
}
