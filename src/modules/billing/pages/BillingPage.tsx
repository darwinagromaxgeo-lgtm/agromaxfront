import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Download, Eye, FileCheck2, FileText, FlaskConical, Loader2, Plus, RefreshCw, Search, Send, Trash2, Undo2 } from 'lucide-react';
import { useAuth } from '../../../app/providers/AuthProvider';
import { Modal } from '../../../shared/components/Modal';
import { Pagination } from '../../../shared/components/Pagination';
import { companyService } from '../../companies/services/companyService';
import { saleService } from '../../sales/services/saleService';
import { lookupService } from '../../../shared/services/lookupService';
import type { Company, Sale } from '../../../shared/types';
import { billingService } from '../services/billingService';
import { downloadBillingDraft } from '../utils/draftPdf';
import { BillingPreviewModal } from '../components/BillingPreviewModal';
import { BillingRecipientForm } from '../components/BillingRecipientForm';
import { CreditNotesPanel } from '../components/CreditNotesPanel';
import { BillingReissueModal } from '../components/BillingReissueModal';
import { recipientDocumentType, recipientFormError, recipientFormFromParty, recipientParty, type RecipientFormState } from '../utils/recipientForm';
import { billingFormatExample } from '../utils/exampleDocument';
import type { BillingPrintDocumentType } from '../utils/printTypes';
import type { BillingDocument, BillingDocumentType, BillingDraftInput, BillingStatus } from '../types';

const states: Record<BillingStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: 'bg-gray-100 text-gray-700' },
  SENDING: { label: 'Enviando', color: 'bg-blue-100 text-blue-700' },
  PENDING: { label: 'Pendiente de SUNAT', color: 'bg-amber-100 text-amber-800' },
  ACCEPTED: { label: 'Aceptado', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  UNKNOWN: { label: 'Requiere revisión', color: 'bg-orange-100 text-orange-800' },
  DISCARDED: { label: 'Descartado', color: 'bg-gray-100 text-gray-500' },
};
const documentState=(document:BillingDocument)=>document.cancelledByCreditNoteId ? {label:'Anulado por nota de crédito',color:'bg-gray-100 text-gray-600'} : states[document.status];
const taxes = { GRAVADO: 'Gravado', EXONERADO: 'Exonerado', INAFECTO: 'Inafecto' };
const money = (value: number) => `S/ ${value.toFixed(2)}`;
const date = (value?: string) => value ? new Date(value).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—';
const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50';
const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50';
function apiError(error: any): string { const message = error?.response?.data?.message; return Array.isArray(message) ? message.join('\n') : typeof message === 'string' ? message : 'No se pudo completar la operación'; }
function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); }

function IdentityCheck({ document }: { document: BillingDocument }) {
  const lookup = useMutation({
    mutationFn: async () => {
      if (document.receiver.documentType === 'RUC') {
        const data = await lookupService.searchByRuc(document.receiver.documentNumber!);
        return { name: data.razonSocial, address: data.direccion, status: [data.estado, data.condicion].filter(Boolean).join(' · ') };
      }
      const data = await lookupService.searchByDni(document.receiver.documentNumber!);
      return { name: data.nombreCompleto, address: '', status: '' };
    },
    onError: error => toast.error(apiError(error)),
  });
  if (document.receiver.documentType === 'UNIDENTIFIED') return null;
  return <div className="rounded-lg border border-gray-200 p-3 space-y-2 text-sm">
    <button className={buttonClass} disabled={lookup.isPending} onClick={() => lookup.mutate()}><Search size={15} /> {lookup.isPending ? 'Consultando…' : 'Consultar cliente en Decolecta'}</button>
    <p className="text-xs text-gray-500">Consulta de identidad de DNI/RUC. No emite comprobantes ni modifica los datos guardados.</p>
    {lookup.data && <div className="rounded-lg bg-gray-50 p-3"><p className="font-semibold">{lookup.data.name}</p>{lookup.data.address && <p>{lookup.data.address}</p>}{lookup.data.status && <p>{lookup.data.status}</p>}<p className="text-xs text-gray-500 mt-2">Si hay diferencias, corrige la ficha del cliente y prepara un nuevo borrador.</p></div>}
  </div>;
}

function DocumentSummary({ document }: { document: BillingDocument }) {
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2 items-center">
      <span className="font-semibold">{document.documentType === 'FACTURA' ? 'Factura' : 'Boleta'} · {taxes[document.taxType]}</span>
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${documentState(document).color}`}>{documentState(document).label}</span>
      {document.series && <span className="font-mono text-sm">{document.series}-{String(document.number).padStart(8, '0')}</span>}
    </div>
    <div className="grid sm:grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4 text-sm">
      <div><p className="text-xs text-gray-500 mb-1">Empresa emisora</p><p className="font-semibold">{document.issuer.name}</p><p>RUC {document.issuer.documentNumber}</p></div>
      <div><p className="text-xs text-gray-500 mb-1">Cliente</p><p className="font-semibold">{document.receiver.name}</p><p>{document.receiver.documentType === 'UNIDENTIFIED' ? 'Sin identificación' : `${document.receiver.documentType} ${document.receiver.documentNumber}`}</p></div>
      <p className="text-xs text-gray-500">Venta: {date(document.saleDate)} · {document.paymentCondition === 'CONTADO' ? 'Contado' : 'Crédito'}</p>
      <p className="text-xs text-gray-500 break-all">Referencia de venta: {document.saleId}</p>
    </div>
    <div className="overflow-x-auto border border-gray-200 rounded-lg"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3 text-left">Producto</th><th className="p-3 text-right">Cant.</th><th className="p-3 text-left">Unidad</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">IGV</th><th className="p-3 text-right">Total</th></tr></thead><tbody>
      {document.items.map((item, index) => <tr key={`${item.productId}-${index}`} className="border-t border-gray-100"><td className="p-3 min-w-40">{item.description}</td><td className="p-3 text-right">{item.quantity}</td><td className="p-3">{item.unit}</td><td className="p-3 text-right whitespace-nowrap">{money(item.baseAmount)}</td><td className="p-3 text-right whitespace-nowrap">{money(item.taxAmount)}</td><td className="p-3 text-right whitespace-nowrap font-semibold">{money(item.total)}</td></tr>)}
    </tbody></table></div>
    <div className="ml-auto max-w-xs text-sm space-y-1">
      <p className="flex justify-between"><span>Gravado</span><span>{money(document.taxableAmount)}</span></p>
      <p className="flex justify-between"><span>Exonerado</span><span>{money(document.exemptAmount)}</span></p>
      <p className="flex justify-between"><span>Inafecto</span><span>{money(document.unaffectedAmount)}</span></p>
      <p className="flex justify-between"><span>IGV</span><span>{money(document.taxAmount)}</span></p>
      <p className="flex justify-between border-t pt-2 font-bold text-lg"><span>Total</span><span>{money(document.total)}</span></p>
    </div>
    {document.warnings.map((warning, i) => <p key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
    {document.sunatDescription && <div className="rounded-lg bg-gray-50 p-3 text-sm"><strong>Respuesta del servicio{document.sunatCode ? ` · ${document.sunatCode}` : ''}</strong><p className="mt-1 whitespace-pre-wrap">{document.sunatDescription}</p>{document.ticket && <p className="mt-2 text-xs break-all">Ticket: {document.ticket}</p>}</div>}
    {document.status === 'UNKNOWN' && <p className="rounded-lg bg-orange-50 text-orange-900 p-3 text-sm">El resultado requiere revisión. No se habilita un nuevo envío para evitar duplicar un comprobante que pudo haber sido recibido.</p>}
    {document.discardReason && <p className="text-sm text-gray-500">Motivo de descarte: {document.discardReason}</p>}
    {document.cancelledByCreditNoteId && <p className="rounded-lg bg-gray-100 p-3 text-sm">Comprobante anulado mediante nota de crédito aceptada. El pedido y sus pagos se conservan. {document.cancellationReason}</p>}
  </div>;
}

export function BillingPage() {
  const { user, selectedBranch } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const branchId = selectedBranch?.id;
  const branchRef = useRef(branchId);
  branchRef.current = branchId;
  const role = user?.role === 'ADMIN' ? 'ADMIN' : user?.branchAssignments?.find(assignment => assignment.branchId === branchId)?.role || user?.role;
  const allowed = !!branchId && (role === 'ADMIN' || role === 'VENDEDOR');
  const [page, setPage] = useState(1);
  const [notesView,setNotesView]=useState(false);
  const [creditOriginalId,setCreditOriginalId]=useState('');
  const [reissueId,setReissueId]=useState('');
  const [startDate, setStartDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [companyId, setCompanyId] = useState('');
  const [type, setType] = useState<BillingDocumentType | ''>('');
  const [status, setStatus] = useState<BillingStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [salePage, setSalePage] = useState(1);
  const [saleId, setSaleId] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [recipient, setRecipient] = useState<RecipientFormState>(() => recipientFormFromParty());
  const [recipientTouched, setRecipientTouched] = useState(false);
  const documentType = recipientDocumentType(recipient.mode);
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueConfirmed, setIssueConfirmed] = useState(false);
  const [issueStep, setIssueStep] = useState<'receiver' | 'review'>('receiver');
  const [issueRecipient, setIssueRecipient] = useState<RecipientFormState>(() => recipientFormFromParty());
  const [downloading, setDownloading] = useState(false);
  const [formatPreview, setFormatPreview] = useState<{ document: BillingDocument; simulation?: boolean } | null>(null);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [exampleType, setExampleType] = useState<BillingPrintDocumentType>('BOLETA');

  useEffect(() => {
    setNotesView(false);setCreditOriginalId('');
    setReissueId('');
    setPage(1); setCreateOpen(false); setDetailId(null); setSaleId(''); setGroupKey(''); setIssueOpen(false); setDiscardOpen(false); setFormatPreview(null); setExampleOpen(false);
  }, [branchId]);
  useEffect(() => { setPage(1); }, [startDate, endDate, companyId, type, status]);
  const linkedDocument = searchParams.get('documentId');
  const linkedSale = searchParams.get('saleId');
  useEffect(() => {
    if (!allowed) return;
    if (linkedDocument && /^[a-f\d]{24}$/i.test(linkedDocument)) setDetailId(linkedDocument);
    else if (linkedSale && /^[a-f\d]{24}$/i.test(linkedSale)) { setSaleId(linkedSale); setCreateOpen(true); }
  }, [allowed, branchId, linkedDocument, linkedSale]);
  useEffect(() => { setLegacyConfirmed(false); }, [saleId, groupKey, documentType]);

  const connection = useQuery({ queryKey: ['billing-connection', branchId], queryFn: billingService.status, enabled: allowed, retry: false, staleTime: 30_000 });
  const companies = useQuery({ queryKey: ['companies'], queryFn: companyService.getAll, enabled: allowed });
  const exampleCompany = (companies.data as Company[] || []).find(company => company.id === selectedBranch?.defaultCompanyId)
    || (companies.data as Company[] || []).find(company => selectedBranch?.companyIds.includes(company.id));
  const exampleDocument = useMemo(() => billingFormatExample(exampleCompany, exampleType), [exampleCompany, exampleType]);
  const filters = { page, limit: 15, startDate: startDate || undefined, endDate: endDate || undefined, companyId: companyId || undefined, documentType: type || undefined, status: status || undefined };
  const documents = useQuery({ queryKey: ['billing', branchId, filters], queryFn: () => billingService.list(filters), enabled: allowed });
  const sales = useQuery<{ data: Sale[]; total: number }>({ queryKey: ['billing-sales', branchId, salePage, startDate, endDate], queryFn: () => saleService.getAll({ page: salePage, limit: 20, startDate: startDate || undefined, endDate: endDate || undefined }), enabled: allowed && createOpen });
  const groups = useQuery({ queryKey: ['billing-groups', branchId, saleId], queryFn: () => billingService.groups(saleId), enabled: allowed && createOpen && !!saleId, retry: false });
  const group = groups.data?.find(item => `${item.companyId}:${item.taxType}` === groupKey);
  useEffect(() => { if (!groupKey && groups.data?.length) setGroupKey(`${groups.data[0].companyId}:${groups.data[0].taxType}`); }, [groupKey, groups.data]);
  const saleReceiver = useQuery({ queryKey: ['billing-sale-receiver', branchId, saleId], queryFn: () => billingService.saleReceiver(saleId), enabled: allowed && createOpen && !!saleId });
  useEffect(() => {
    if (!saleReceiver.data || recipientTouched) return;
    const selected = sales.data?.data.find(sale => sale.id === saleId);
    setRecipient(recipientFormFromParty(saleReceiver.data, selected?.voucherType === 'FACTURA' ? 'FACTURA' : 'BOLETA'));
  }, [saleReceiver.data, saleId, recipientTouched, sales.data]);
  const recipientError = recipientFormError(recipient, group?.total || 0);
  const draftInput: BillingDraftInput | null = group && !recipientError ? { saleId, companyId: group.companyId, taxType: group.taxType, documentType, receiver: recipientParty(recipient) } : null;
  const preview = useQuery({ queryKey: ['billing-preview', branchId, draftInput], queryFn: () => billingService.preview(draftInput!), enabled: allowed && createOpen && !!draftInput, retry: false });
  const detail = useQuery({ queryKey: ['billing-detail', branchId, detailId], queryFn: () => billingService.get(detailId!), enabled: allowed && !!detailId });
  const document = detail.data;
  useEffect(() => { setIssueConfirmed(false); }, [document?.id, document?.receiverRevision, connection.data?.environment]);
  const refresh = (result: BillingDocument) => {
    queryClient.invalidateQueries({ queryKey: ['billing'] });
    queryClient.invalidateQueries({ queryKey: ['sales-billing'] });
    if (result.branchId !== branchRef.current) return;
    queryClient.setQueryData(['billing-detail', result.branchId, result.id], result);
    setDetailId(result.id);
  };
  const create = useMutation({ mutationFn: billingService.create, onSuccess: result => { refresh(result); setCreateOpen(false); toast.success('Borrador guardado'); }, onError: error => toast.error(apiError(error)) });
  const discard = useMutation({ mutationFn: billingService.discard, onSuccess: result => { refresh(result); setDiscardOpen(false); toast.success('Borrador descartado'); }, onError: error => toast.error(apiError(error)) });
  const saveReceiver = useMutation({ mutationFn: billingService.updateReceiver, onSuccess: result => { refresh(result); setIssueStep('review'); setIssueConfirmed(false); }, onError: error => { queryClient.invalidateQueries({ queryKey: ['billing-detail'] }); setIssueOpen(false); toast.error(apiError(error)); } });
  const issue = useMutation({ mutationFn: billingService.issue, onSuccess: result => { refresh(result); setIssueOpen(false); setIssueConfirmed(false); toast(result.status === 'ACCEPTED' ? 'Comprobante aceptado' : result.status === 'PENDING' ? 'Boleta pendiente de respuesta del resumen' : 'Revisa el resultado del comprobante'); }, onError: error => { setIssueConfirmed(false); queryClient.invalidateQueries({ queryKey: ['billing-detail'] }); toast.error(apiError(error)); } });
  const check = useMutation({ mutationFn: billingService.checkStatus, onSuccess: result => { refresh(result); toast(result.status === 'PENDING' ? 'La respuesta sigue pendiente' : 'Estado actualizado'); }, onError: error => toast.error(apiError(error)) });
  const simulation = useMutation({ mutationFn: billingService.simulate, onError: error => toast.error(apiError(error)) });
  const simulationResult = simulation.data?.document.id === document?.id && simulation.data?.document.branchId === branchId ? simulation.data : undefined;
  useEffect(() => { simulation.reset(); }, [detailId, branchId]);
  const download = async (format: 'pdf' | 'xml' | 'cdr') => {
    if (!document) return;
    setDownloading(true);
    try { await billingService.download(document, format); } catch { toast.error('No se pudo descargar el archivo'); } finally { setDownloading(false); }
  };
  const downloadDraft = async (draft: BillingDocument, simulated = false) => {
    setDownloading(true);
    try { await downloadBillingDraft(draft, simulated); } catch { toast.error('No se pudo generar el PDF'); } finally { setDownloading(false); }
  };
  if (!allowed) return <div className="rounded-xl bg-white border p-6 text-gray-600">Selecciona una sucursal con acceso de administrador o vendedor para abrir Facturación.</div>;
  if (notesView) return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800">Facturación</h1><div className="flex gap-2"><button className={buttonClass} onClick={()=>setNotesView(false)}>Ver comprobantes</button><button className={buttonClass} onClick={()=>connection.refetch()} disabled={connection.isFetching}><RefreshCw size={14} /> Verificar conexión</button></div></div><CreditNotesPanel key={branchId} branchId={branchId!} connection={connection.data} initialOriginalId={creditOriginalId} onOriginalConsumed={()=>setCreditOriginalId('')} onReissue={id=>{setNotesView(false);setReissueId(id);}} /></div>;

  return <div className="space-y-5">
    {reissueId && <BillingReissueModal key={`${branchId}:${reissueId}`} originalId={reissueId} branchId={branchId!} onClose={()=>setReissueId('')} onSaved={result=>{if(result.branchId!==branchRef.current)return;setReissueId('');refresh(result);}} />}
    <div><button className={buttonClass} onClick={()=>setNotesView(true)}><Undo2 size={16} /> Notas de crédito</button></div>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><FileCheck2 size={25} /> Facturación</h1><p className="text-sm text-gray-500 mt-1">Comprobantes de venta separados por empresa y afectación tributaria.</p></div><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => { setFormatPreview(null); setExampleOpen(true); }}><Eye size={17} /> Ver formatos</button><button className={primaryClass} onClick={() => { setSaleId(''); setGroupKey(''); setSalePage(1); setRecipient(recipientFormFromParty()); setRecipientTouched(false); setCreateOpen(true); }}><Plus size={17} /> Preparar comprobante</button></div></div>
    <div className={`rounded-xl border p-4 ${connection.data?.ready ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold text-sm">{connection.isFetching ? 'Comprobando conexión…' : connection.data?.simulationReady ? 'Microservicio de simulación disponible' : connection.data?.ready ? 'Servicio de facturación disponible' : 'Preparación de comprobantes disponible'}</p><p className="text-sm mt-1">{connection.error ? 'No se pudo consultar el servicio. Revisa la conexión con el backend.' : connection.data?.message}</p>{connection.data?.issuerRuc && <p className="text-xs mt-2">Emisor: {connection.data.issuerName || connection.data.issuerRuc} · RUC {connection.data.issuerRuc} · {connection.data.environment === 'simulation' ? 'Simulación' : connection.data.environment === 'production' ? 'Producción' : 'Pruebas'}</p>}</div><button className={buttonClass} onClick={() => connection.refetch()} disabled={connection.isFetching}><RefreshCw size={14} /> Verificar conexión</button></div>
    </div>
    <div className="rounded-xl bg-white border border-gray-200 p-4 grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
      <label className="text-xs text-gray-500">Desde<input type="date" className={`${inputClass} mt-1`} value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} /></label>
      <label className="text-xs text-gray-500">Hasta<input type="date" className={`${inputClass} mt-1`} value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} /></label>
      <label className="text-xs text-gray-500">Empresa<select className={`${inputClass} mt-1`} value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">Todas</option>{(companies.data as Company[] || []).filter(company => company.isActive && selectedBranch?.companyIds.includes(company.id)).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label className="text-xs text-gray-500">Tipo<select className={`${inputClass} mt-1`} value={type} onChange={event => setType(event.target.value as BillingDocumentType | '')}><option value="">Todos</option><option value="FACTURA">Factura</option><option value="BOLETA">Boleta</option></select></label>
      <label className="text-xs text-gray-500">Estado<select className={`${inputClass} mt-1`} value={status} onChange={event => setStatus(event.target.value as BillingStatus | '')}><option value="">Todos</option>{Object.entries(states).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
    </div>
    <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
      {documents.isLoading ? <p className="p-8 text-center text-gray-500">Cargando comprobantes…</p> : documents.error ? <div className="p-6 text-red-700"><p>{apiError(documents.error)}</p><button className={`${buttonClass} mt-3`} onClick={() => documents.refetch()}>Volver a intentar</button></div> : !documents.data?.data.length ? <div className="p-10 text-center text-gray-500"><FileText size={32} className="mx-auto mb-3 text-gray-300" /><p>No hay comprobantes con estos filtros.</p><p className="text-xs mt-1">Prepara un borrador a partir de una venta registrada.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Comprobante</th><th className="p-3 text-left">Emisor / Cliente</th><th className="p-3 text-left">Afectación</th><th className="p-3 text-left">Estado</th><th className="p-3 text-right">Total</th><th className="p-3" /></tr></thead><tbody>{documents.data.data.map(item => <tr key={item.id} className="border-t border-gray-100"><td className="p-3 whitespace-nowrap">{date(item.createdAt)}</td><td className="p-3"><p className="font-semibold">{item.documentType === 'FACTURA' ? 'Factura' : 'Boleta'}</p><p className="text-xs text-gray-500 font-mono">{item.series ? `${item.series}-${String(item.number).padStart(8, '0')}` : `Borrador ${item.id.slice(-8)}`}</p></td><td className="p-3 min-w-44"><p className="font-medium">{item.issuer.name}</p><p className="text-xs text-gray-500">{item.receiver.name}</p></td><td className="p-3">{taxes[item.taxType]}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs whitespace-nowrap ${documentState(item).color}`}>{documentState(item).label}</span></td><td className="p-3 text-right font-semibold whitespace-nowrap">{money(item.total)}</td><td className="p-3"><button className={buttonClass} onClick={() => setDetailId(item.id)} aria-label="Ver comprobante"><Eye size={16} /></button></td></tr>)}</tbody></table></div>}
    </div>
    <Pagination page={page} totalPages={Math.ceil((documents.data?.total || 0) / 15)} onPageChange={setPage} />

    <Modal isOpen={createOpen} onClose={() => !create.isPending && setCreateOpen(false)} title="Preparar comprobante de venta" size="xl">
      <div className="space-y-4"><p className="text-sm text-gray-500">Elige una venta del rango de fechas consultado. Cada empresa y grupo tributario tendrá su propio comprobante.</p>
        <label className="block text-sm font-medium">Venta de origen<select className={`${inputClass} mt-1`} value={saleId} onChange={event => { const selected = sales.data?.data.find(sale => sale.id === event.target.value); setSaleId(event.target.value); setGroupKey(''); setRecipientTouched(false); setRecipient(recipientFormFromParty(undefined, selected?.voucherType === 'FACTURA' ? 'FACTURA' : 'BOLETA')); }}><option value="">Selecciona una venta</option>{sales.data?.data.filter(sale => !sale.isCancelled).map(sale => <option key={sale.id} value={sale.id}>{date(sale.date)} · {sale.id.slice(-8).toUpperCase()} · {money(sale.total)}{sale.isCredit ? ' · Crédito' : ''}</option>)}</select></label>
        {sales.error && <p className="text-sm text-red-700">{apiError(sales.error)}</p>}
        <Pagination page={salePage} totalPages={Math.ceil((sales.data?.total || 0) / 20)} onPageChange={value => { setSalePage(value); setSaleId(''); setGroupKey(''); }} />
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-medium">Empresa y afectación<select className={`${inputClass} mt-1`} value={groupKey} disabled={!saleId || groups.isLoading} onChange={event => setGroupKey(event.target.value)}><option value="">Selecciona un grupo</option>{groups.data?.map(item => <option key={`${item.companyId}:${item.taxType}`} value={`${item.companyId}:${item.taxType}`}>{item.companyName} · {taxes[item.taxType]} · {money(item.total)}</option>)}</select></label></div>
        {groups.error && <p className="text-sm text-red-700">{apiError(groups.error)}</p>}
        {saleId && <BillingRecipientForm key={`${branchId}:${saleId}`} value={recipient} onChange={next => { setRecipientTouched(true); setRecipient(next); }} total={group?.total || 0} disabled={saleReceiver.isFetching && !recipientTouched} />}
        {preview.isFetching && draftInput && <p className="text-sm text-gray-500 flex gap-2 items-center"><Loader2 className="animate-spin" size={15} /> Preparando detalle…</p>}
        {preview.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError(preview.error)}</p>}
        {preview.data && draftInput && !preview.isFetching && !preview.error && <><button className={buttonClass} onClick={() => setFormatPreview({ document: preview.data! })}><Eye size={16} /> Ver A4 y ticket</button><DocumentSummary document={preview.data} />{preview.data.legacyTaxData && <label className="flex gap-2 items-start text-sm rounded-lg border border-amber-200 p-3"><input type="checkbox" checked={legacyConfirmed} onChange={event => setLegacyConfirmed(event.target.checked)} className="mt-1" /><span>Revisé los datos tributarios, las unidades y los importes de esta venta anterior.</span></label>}</>}
        <p className="text-xs text-gray-500">Guardar el borrador no emite un comprobante ni vuelve a descontar inventario o registrar cobros.</p>
        <div className="flex justify-end gap-2"><button className={buttonClass} onClick={() => setCreateOpen(false)} disabled={create.isPending}>Cerrar</button><button className={primaryClass} disabled={!draftInput || !preview.data || !!preview.error || preview.isFetching || (saleReceiver.isFetching && !recipientTouched) || create.isPending || (preview.data.legacyTaxData && !legacyConfirmed)} onClick={() => draftInput && create.mutate({ ...draftInput, legacyTaxConfirmed: legacyConfirmed })}>{create.isPending ? 'Guardando…' : 'Guardar borrador'}</button></div>
      </div>
    </Modal>

    <Modal isOpen={!!detailId} onClose={() => !issue.isPending && setDetailId(null)} title="Detalle del comprobante" size="xl">
      {detail.isLoading ? <p>Cargando…</p> : detail.error ? <p className="text-red-700">{apiError(detail.error)}</p> : document && <div className="space-y-5"><button className={buttonClass} onClick={() => setFormatPreview({ document })}><Eye size={16} /> Vista A4 y ticket</button><DocumentSummary document={document} /><IdentityCheck key={`${branchId}:${document.id}`} document={document} />
      {simulationResult && document.status === 'DRAFT' && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3"><p className="font-bold text-blue-900">SIMULACIÓN · SIN VALIDEZ TRIBUTARIA</p><button className={buttonClass} onClick={() => setFormatPreview({ document: simulationResult.document, simulation: true })}><Eye size={16} /> Ver simulación en A4 y ticket</button><p className="text-sm">{simulationResult.message}</p>{simulationResult.service && <p className="text-sm font-medium">{simulationResult.service.message}</p>}<ul className="space-y-2 text-sm">{simulationResult.checks.map(check => <li key={check.label}><span className="font-semibold">{check.passed ? '✓' : 'Pendiente:'} {check.label}.</span> {check.detail}</li>)}</ul><button className={buttonClass} disabled={downloading} onClick={() => simulationResult.service?.verified ? billingService.downloadSimulation(simulationResult, 'pdf') : downloadDraft(simulationResult.document, true)}><Download size={15} /> Descargar PDF de simulación</button>{simulationResult.service?.verified && <button className={`${buttonClass} ml-2`} onClick={() => billingService.downloadSimulation(simulationResult, 'xml')}><Download size={15} /> XML de simulación</button>}</div>}
      <div className="flex flex-wrap gap-2">
        {document.status==='ACCEPTED' && !document.cancelledByCreditNoteId && <button className={buttonClass} onClick={()=>{setCreditOriginalId(document.id);setDetailId(null);setNotesView(true);}}><Undo2 size={15} /> Anular comprobante con nota de crédito</button>}
        {document.cancelledByCreditNoteId && <button className={primaryClass} onClick={()=>{setReissueId(document.id);setDetailId(null);}}>Volver a emitir pedido</button>}
        {document.replacementDocumentId && <button className={buttonClass} onClick={()=>setDetailId(document.replacementDocumentId!)}>Ver comprobante nuevo</button>}
        {document.replacesDocumentId && <button className={buttonClass} onClick={()=>setDetailId(document.replacesDocumentId!)}>Ver comprobante anterior</button>}
        {document.status === 'DRAFT' && <button className={primaryClass} disabled={simulation.isPending} onClick={() => simulation.mutate(document.id)}><FlaskConical size={15} /> {simulation.isPending ? 'Simulando…' : 'Simular sin enviar'}</button>}
        {document.status === 'DRAFT' && <><button className={buttonClass} disabled={downloading} onClick={() => downloadDraft(document)}><Download size={15} /> PDF de borrador</button><button className={`${buttonClass} text-red-600`} onClick={() => { setDiscardReason(''); setDiscardOpen(true); }}><Trash2 size={15} /> Descartar borrador</button><button className={primaryClass} disabled={issue.isPending || saveReceiver.isPending} onClick={() => { setIssueRecipient(recipientFormFromParty(document.receiver, document.documentType)); setIssueStep('receiver'); setIssueConfirmed(false); setIssueOpen(true); }}><Send size={15} /> Preparar envío</button></>}
        {document.status === 'PENDING' && <button className={primaryClass} disabled={check.isPending} onClick={() => check.mutate(document.id)}><RefreshCw size={15} /> {check.isPending ? 'Consultando…' : 'Consultar estado SUNAT'}</button>}
        {document.hasPdf && <button className={buttonClass} disabled={downloading} onClick={() => download('pdf')}><Download size={15} /> PDF</button>}
        {document.hasXml && <button className={buttonClass} disabled={downloading} onClick={() => download('xml')}><Download size={15} /> XML</button>}
        {document.hasCdr && <button className={buttonClass} disabled={downloading} onClick={() => download('cdr')}><Download size={15} /> CDR</button>}
      </div></div>}
    </Modal>
    <BillingPreviewModal isOpen={exampleOpen || !!formatPreview} onClose={() => { setFormatPreview(null); setExampleOpen(false); }} document={formatPreview?.document || (exampleOpen ? exampleDocument : null)} example={exampleOpen} simulation={formatPreview?.simulation} onExampleTypeChange={setExampleType} />
    <Modal isOpen={discardOpen && !!document} onClose={() => !discard.isPending && setDiscardOpen(false)} title="Descartar borrador"><div className="space-y-4"><p className="text-sm text-gray-600">El borrador quedará en el historial como descartado. La venta y sus movimientos se mantienen.</p><label className="block text-sm">Motivo<textarea className={`${inputClass} mt-1`} value={discardReason} onChange={event => setDiscardReason(event.target.value)} rows={3} maxLength={500} /></label><button className={`${buttonClass} text-red-600`} disabled={discardReason.trim().length < 5 || discard.isPending} onClick={() => document && discard.mutate({ id: document.id, reason: discardReason.trim() })}>{discard.isPending ? 'Descartando…' : 'Descartar borrador'}</button></div></Modal>
    <Modal isOpen={issueOpen && !!document} onClose={() => !issue.isPending && !saveReceiver.isPending && setIssueOpen(false)} title={issueStep === 'receiver' ? '1. Receptor del comprobante' : connection.data?.environment === 'production' ? '2. Confirmar emisión real' : '2. Confirmar envío a pruebas'} size="lg">
      {document && <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><strong>{document.documentType === 'FACTURA' ? 'Factura' : 'Boleta'} · {taxes[document.taxType]}</strong><strong>{money(document.total)}</strong></div>
        {issueStep === 'receiver' ? <>
          <BillingRecipientForm key={`${document.id}:issue`} value={issueRecipient} onChange={setIssueRecipient} total={document.total} documentType={document.documentType} disabled={saveReceiver.isPending} />
          <div className="flex justify-end gap-2"><button className={buttonClass} disabled={saveReceiver.isPending} onClick={() => setIssueOpen(false)}>Cerrar</button><button className={primaryClass} disabled={!!recipientFormError(issueRecipient, document.total) || saveReceiver.isPending} onClick={() => saveReceiver.mutate({ id: document.id, receiver: recipientParty(issueRecipient), expectedRevision: document.receiverRevision || 0 })}>{saveReceiver.isPending ? 'Guardando receptor…' : 'Revisar envío'}</button></div>
        </> : <>
          <div className="rounded-xl border p-4 text-sm"><p className="text-xs text-slate-500">Receptor</p><p className="mt-1 font-bold text-slate-800">{document.receiver.name}</p><p className="mt-1">{document.receiver.documentType === 'UNIDENTIFIED' ? 'Boleta simple · Consumidor final' : `${document.receiver.documentType} ${document.receiver.documentNumber}`}</p>{document.receiver.address && <p className="mt-1 text-slate-500">{document.receiver.address}</p>}</div>
          <p className="text-sm text-slate-500">Emisor: {connection.data?.issuerName || document.issuer.name} · RUC {document.issuer.documentNumber}. Serie: {connection.data?.series?.[document.documentType] || 'Pendiente de configuración'}.</p>
          <button className={buttonClass} onClick={() => setFormatPreview({ document })}><Eye size={16} /> Revisar A4 y ticket</button>
          {(!connection.data?.ready || !connection.data.supportedDocumentTypes.includes(document.documentType) || connection.data.issuerRuc !== document.issuer.documentNumber) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{connection.data?.message || 'Completa la conexión del servicio de facturación antes de enviar.'}</p>}
          {document.paymentCondition === 'CREDITO' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Falta configurar el cronograma fiscal para emitir esta venta a crédito.</p>}
          {connection.data?.environment === 'production' && <p className="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0" /> Este envío genera un comprobante real. Revisa receptor, afectación e importe.</p>}
          <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={issueConfirmed} disabled={issue.isPending} onChange={event => setIssueConfirmed(event.target.checked)} /><span>Confirmo los datos del receptor y autorizo el envío de {money(document.total)}.</span></label>
          <div className="flex flex-wrap justify-end gap-2"><button className={buttonClass} disabled={issue.isPending} onClick={() => { setIssueStep('receiver'); setIssueConfirmed(false); }}>Editar receptor</button><button className={primaryClass} disabled={!issueConfirmed || issue.isPending || !connection.data?.ready || !connection.data.supportedDocumentTypes.includes(document.documentType) || connection.data.issuerRuc !== document.issuer.documentNumber || document.paymentCondition === 'CREDITO'} onClick={() => issue.mutate({ id: document.id, receiverRevision: document.receiverRevision || 0 })}>{issue.isPending ? 'Procesando envío…' : 'Confirmar y enviar'}</button></div>
        </>}
      </div>}
    </Modal>
  </div>;
}
