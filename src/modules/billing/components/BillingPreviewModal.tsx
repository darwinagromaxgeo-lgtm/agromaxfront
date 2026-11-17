import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, FileText, Loader2, Printer, ReceiptText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { BrandLogo } from '../../../shared/components/BrandLogo';
import type { BillingPrintDocument, BillingPrintDocumentType } from '../utils/printTypes';
import { billingMoney, billingPresentation, type BillingPreviewOptions, type BillingPrintFormat } from '../utils/documentPresentation';
import { BillingDocumentPaper } from './BillingDocumentPaper';

function PaperPreview({ document, format, options }: { document: BillingPrintDocument; format: BillingPrintFormat; options: BillingPreviewOptions }) {
  const container = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const width = format === 'A4' ? 794 : 302;
  const [size, setSize] = useState({ scale: format === 'A4' ? 0.5 : 1, height: format === 'A4' ? 562 : 650 });
  useEffect(() => {
    const measure = () => {
      if (!container.current || !paper.current) return;
      const scale = Math.min(container.current.clientWidth / width, 1);
      setSize({ scale, height: paper.current.offsetHeight * scale });
    };
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    if (paper.current) observer.observe(paper.current);
    measure();
    return () => observer.disconnect();
  }, [width]);
  return <div className="max-h-[53vh] overflow-y-auto overflow-x-hidden bg-slate-100/80 p-4 sm:p-5">
    <div ref={container} className="relative w-full" style={{ height: size.height }}>
      <div ref={paper} className="absolute top-0 shadow-md" style={{ width, left: '50%', marginLeft: -width / 2, transform: `scale(${size.scale})`, transformOrigin: 'top center' }}>
        <BillingDocumentPaper document={document} format={format} options={options} />
      </div>
    </div>
  </div>;
}

export function BillingPreviewModal({ isOpen, onClose, document: invoice, example = false, simulation = false, onExampleTypeChange }: {
  isOpen: boolean; onClose: () => void; document: BillingPrintDocument | null;
  example?: boolean; simulation?: boolean; onExampleTypeChange?: (type: BillingPrintDocumentType) => void;
}) {
  const [format, setFormat] = useState<BillingPrintFormat>('A4');
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const titleId = useId();
  const hasDocument = !!invoice;
  useEffect(() => {
    if (!isOpen || !hasDocument) return;
    setFormat('A4');
    const previous = window.document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const buttons = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [href], [tabindex="0"]');
      const visible = Array.from(buttons || []).filter(element => element.getClientRects().length);
      const first = visible[0]; const last = visible[visible.length - 1];
      if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    window.document.addEventListener('keydown', onKeyDown, true);
    return () => { window.document.body.style.overflow = previousOverflow; window.document.removeEventListener('keydown', onKeyDown, true); if (previous?.isConnected) previous.focus(); };
  }, [isOpen, hasDocument]);
  if (!isOpen || !invoice) return null;
  const options = { example, simulation };
  const view = billingPresentation(invoice, options);
  const exportPdf = async (printing: boolean) => {
    const target = printing ? window.open('', '_blank') : null;
    if (printing && !target) { toast.error('Permite abrir la ventana de impresión o descarga el PDF.'); return; }
    if (target) { target.opener = null; target.document.title = 'Preparando comprobante'; target.document.body.textContent = 'Preparando el PDF para imprimir…'; }
    setBusy(true);
    try {
      const pdf = await import('../utils/documentPdf');
      if (target) await pdf.printBillingDocument(invoice, format, options, target);
      else await pdf.downloadBillingPrint(invoice, format, options);
    } catch { target?.close(); toast.error('No se pudo preparar el PDF. Intenta nuevamente.'); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-5">
    <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} />
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4"><BrandLogo className="hidden w-32 border-r border-slate-200 pr-4 sm:block" /><div><h2 id={titleId} className="text-base font-bold text-slate-900 sm:text-lg">Vista previa del comprobante</h2><p className="mt-0.5 text-xs text-slate-500">{example ? 'Ejemplo de formatos' : view.reference} · {billingMoney(invoice.total)}</p></div></div>
        <button onClick={onClose} aria-label="Cerrar vista previa" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-primary-600"><X size={20} /></button>
      </header>
      <div className="overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Formato para descargar o imprimir">
            {(['A4', 'TICKET'] as const).map((value, index) => <button key={value} data-initial-focus={index === 0 ? '' : undefined} aria-pressed={format === value} onClick={() => setFormat(value)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${format === value ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{value === 'A4' ? <FileText size={16} /> : <ReceiptText size={16} />}{value === 'A4' ? 'Hoja A4' : 'Ticket 80 mm'}</button>)}
          </div>
          {example && onExampleTypeChange ? <label className="flex items-center gap-2 text-xs text-slate-500">Comprobante<select aria-label="Tipo de comprobante de ejemplo" value={invoice.documentType} onChange={event => onExampleTypeChange(event.target.value as BillingPrintDocumentType)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><option value="BOLETA">Boleta</option><option value="FACTURA">Factura</option><option value="NOTA_VENTA">Nota de venta</option></select></label> : <span className="text-xs text-slate-500">{view.tax} · {view.payment}</span>}
        </div>
        <div className="grid gap-4 px-4 pb-4 sm:px-6 lg:grid-cols-[1.45fr_1fr]">
          {(['A4', 'TICKET'] as const).map(value => <section key={value} aria-label={value === 'A4' ? 'Visualización A4' : 'Visualización ticket'} className={`min-w-0 overflow-hidden rounded-xl border-2 transition ${value === format ? 'border-primary-500' : 'hidden border-slate-200 lg:block'}`}>
            <button onClick={() => setFormat(value)} className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">{value === 'A4' ? <FileText size={17} /> : <ReceiptText size={17} />}{value === 'A4' ? 'Formato A4' : 'Formato ticket'}<span className="text-xs font-normal text-slate-400">{value === 'A4' ? '210 × 297 mm' : '80 mm'}</span></span>
              {value === format && <span className="flex items-center gap-1 text-xs font-semibold text-primary-700"><Check size={14} /> Elegido</span>}
            </button>
            <PaperPreview document={invoice} format={value} options={options} />
          </section>)}
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
        <p className="max-w-md text-xs text-slate-500">{view.notice}</p>
        <div className="flex w-full gap-2 sm:w-auto"><button disabled={busy} onClick={() => exportPdf(false)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} PDF {format === 'A4' ? 'A4' : 'ticket'}</button><button disabled={busy} onClick={() => exportPdf(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"><Printer size={16} /> Imprimir</button></div>
      </footer>
    </div>
  </div>, window.document.body);
}
