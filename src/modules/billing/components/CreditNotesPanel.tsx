import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Plus, RefreshCw, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../../shared/components/Modal';
import { Pagination } from '../../../shared/components/Pagination';
import { billingService } from '../services/billingService';
import { creditNoteService } from '../services/creditNoteService';
import { BillingPreviewModal } from './BillingPreviewModal';
import type { BillingCreditNote, BillingProviderStatus, BillingStatus, CreditNoteInput } from '../types';

const button='inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50';
const primary='inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const input='w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500';
const money=(value:number)=>`S/ ${value.toFixed(2)}`;
const reference=(document:{ series?:string; number?:number })=>document.series ? `${document.series}-${String(document.number).padStart(8,'0')}` : 'Borrador sin numerar';
const states:Record<BillingStatus,string>={ DRAFT:'Borrador',SENDING:'Enviando',PENDING:'Pendiente de SUNAT',ACCEPTED:'Aceptada',REJECTED:'Rechazada',UNKNOWN:'Requiere revisión',DISCARDED:'Descartada' };
function errorMessage(error:any) { const message=error?.response?.data?.message;return Array.isArray(message) ? message.join('\n') : typeof message==='string' ? message : 'No se pudo completar la operación'; }

function CreditNoteForm({ branchId,initialOriginalId,onSaved,onClose }:{ branchId:string;initialOriginalId:string;onSaved:(note:BillingCreditNote)=>void;onClose:()=>void }) {
  const [originalId,setOriginalId]=useState(initialOriginalId);
  const [page,setPage]=useState(1);
  const [returnType,setReturnType]=useState<'TOTAL'|'PARTIAL'>('PARTIAL');
  const [reason,setReason]=useState('');
  const [quantities,setQuantities]=useState<Record<number,string>>({});
  const [requestId]=useState(()=>crypto.randomUUID());
  const [paper,setPaper]=useState(false);
  const originals=useQuery({ queryKey:['credit-note-originals',branchId,page],queryFn:()=>billingService.list({ page,limit:15,status:'ACCEPTED' }) });
  const availability=useQuery({ queryKey:['credit-note-availability',branchId,originalId],queryFn:()=>creditNoteService.availability(originalId),enabled:!!originalId,retry:false });
  const lines=availability.data?.items || [];
  const selected=lines.filter(line=>Number(quantities[line.itemIndex] || 0)>0).map(line=>({ itemIndex:line.itemIndex,quantity:Number(quantities[line.itemIndex]) }));
  const quantitiesValid=lines.every(line=>{const value=Number(quantities[line.itemIndex] || 0);return Number.isFinite(value)&&value>=0&&value<=line.availableQuantity&&Math.abs(Math.round(value*1e6)/1e6-value)<1e-10;});
  const valid=!!availability.data && !availability.isFetching && !!reason.trim() && quantitiesValid && (returnType==='TOTAL' ? lines.some(line=>line.availableQuantity>0) : selected.length>0);
  const draftInput:CreditNoteInput | null=valid ? { originalDocumentId:originalId,returnType,reason:reason.trim(),...(returnType==='PARTIAL'?{ items:selected }:{}) } : null;
  const inputKey=JSON.stringify(draftInput);
  const [previewInput,setPreviewInput]=useState<CreditNoteInput | null>(null);
  useEffect(()=>{ const timer=setTimeout(()=>setPreviewInput(draftInput),300);return()=>clearTimeout(timer); },[inputKey]);
  const preview=useQuery({ queryKey:['credit-note-preview',branchId,previewInput],queryFn:()=>creditNoteService.preview(previewInput!),enabled:!!previewInput,retry:false });
  const previewReady=!!preview.data && !preview.isFetching && !preview.error && inputKey===JSON.stringify(previewInput);
  const create=useMutation({ mutationFn:creditNoteService.create,onSuccess:onSaved,onError:error=>toast.error(errorMessage(error)) });
  const active=availability.data?.notes.find(note=>['DRAFT','SENDING','PENDING','UNKNOWN'].includes(note.status));
  return <div className="space-y-4">
    <p className="text-sm text-gray-600">Elige el comprobante y la mercadería devuelta. Los importes y el cliente se toman del documento original.</p>
    <label className="block text-sm font-medium">Comprobante original<select className={`${input} mt-1`} value={originalId} disabled={create.isPending} onChange={event=>{setOriginalId(event.target.value);setQuantities({});}}>
      <option value="">Selecciona una factura o boleta aceptada</option>
      {originalId && !originals.data?.data.some(doc=>doc.id===originalId) && <option value={originalId}>{availability.data ? reference(availability.data.original) : 'Comprobante seleccionado'}</option>}
      {originals.data?.data.map(doc=><option key={doc.id} value={doc.id}>{reference(doc)} · {doc.receiver.name} · {money(doc.total)}</option>)}
    </select></label>
    {originals.error && <p role="alert" className="text-sm text-red-700">{errorMessage(originals.error)}</p>}
    <Pagination page={page} totalPages={Math.ceil((originals.data?.total || 0)/15)} onPageChange={setPage} />
    {availability.isFetching && originalId && <p className="text-sm text-gray-500">Consultando saldo disponible…</p>}
    {availability.error && <p role="alert" className="text-sm text-red-700">{errorMessage(availability.error)}</p>}
    {active && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p>Este comprobante ya tiene una nota {states[active.status].toLowerCase()}.</p><button className={`${button} mt-2`} onClick={()=>onSaved(active)}>Abrir nota existente</button></div>}
    {availability.data && !active && <>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Devolución<select className={`${input} mt-1`} value={returnType} onChange={event=>setReturnType(event.target.value as 'TOTAL'|'PARTIAL')}><option value="PARTIAL">Parcial: elegir productos y cantidades</option><option value="TOTAL">Todo el saldo disponible</option></select></label><div className="rounded-lg bg-gray-50 p-3 text-sm"><strong>{availability.data.original.receiver.name}</strong><p>{availability.data.original.receiver.documentNumber || 'Consumidor final'}</p></div></div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-3">Producto</th><th className="p-3">Vendido</th><th className="p-3">Ya acreditado / reservado</th><th className="p-3">Disponible</th><th className="p-3">Devolver</th></tr></thead><tbody>{lines.map(line=><tr key={line.itemIndex} className="border-t"><td className="p-3">{line.description}<p className="text-xs text-gray-500">{line.unit} · {money(line.unitPrice)}</p></td><td className="p-3">{line.quantity}</td><td className="p-3">{line.creditedQuantity}</td><td className="p-3">{line.availableQuantity}</td><td className="p-3"><input aria-label={`Devolver ${line.description}`} type="number" min="0" max={line.availableQuantity} step="0.000001" className={`${input} min-w-24`} disabled={returnType==='TOTAL'||line.availableQuantity<=0} value={returnType==='TOTAL'?line.availableQuantity:quantities[line.itemIndex] || ''} onChange={event=>setQuantities(current=>({ ...current,[line.itemIndex]:event.target.value }))} /></td></tr>)}</tbody></table></div>
      {!quantitiesValid && <p role="alert" className="text-sm text-red-700">Revisa las cantidades: deben respetar el saldo disponible y tener hasta seis decimales.</p>}
      <label className="block text-sm">Motivo de la devolución<textarea maxLength={500} className={`${input} mt-1`} value={reason} onChange={event=>setReason(event.target.value)} rows={2} placeholder="Ej.: devolución de productos sin utilizar" /></label>
      {preview.error && inputKey===JSON.stringify(previewInput) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage(preview.error)}</p>}
      {previewReady && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 p-4"><div><p className="font-semibold">Total a acreditar: {money(preview.data!.total)}</p><p className="text-xs text-gray-600">Motivo {preview.data!.reasonCode}: {preview.data!.reasonCode==='06'?'Devolución total':'Devolución por ítem'} · IGV {money(preview.data!.taxAmount)}</p></div><button className={button} onClick={()=>setPaper(true)}><Eye size={16} /> Vista previa</button></div>}
      <p className="text-xs text-gray-500">Esta nota registra la devolución tributaria. La recepción física de productos y el reembolso se registran por separado.</p>
    </>}
    <div className="flex justify-end gap-2"><button className={button} onClick={onClose} disabled={create.isPending}>Cerrar</button><button className={primary} disabled={!previewReady || !!active || create.isPending} onClick={()=>draftInput && create.mutate({ ...draftInput,requestId })}>{create.isPending?'Guardando…':'Guardar borrador'}</button></div>
    <BillingPreviewModal isOpen={paper && previewReady} onClose={()=>setPaper(false)} document={preview.data || null} />
  </div>;
}

export function CreditNotesPanel({ branchId,connection,initialOriginalId,onOriginalConsumed }:{ branchId:string;connection?:BillingProviderStatus;initialOriginalId:string;onOriginalConsumed:()=>void }) {
  const client=useQueryClient();
  const activeBranch=useRef(branchId);activeBranch.current=branchId;
  const [page,setPage]=useState(1);
  const [status,setStatus]=useState<BillingStatus | ''>('');
  const [createOpen,setCreateOpen]=useState(!!initialOriginalId);
  const [createOriginal,setCreateOriginal]=useState(initialOriginalId);
  const [detailId,setDetailId]=useState('');
  const [paper,setPaper]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [discardReason,setDiscardReason]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{if(initialOriginalId){setCreateOriginal(initialOriginalId);setCreateOpen(true);onOriginalConsumed();}},[initialOriginalId]);
  const list=useQuery({ queryKey:['billing-credit-notes',branchId,page,status],queryFn:()=>creditNoteService.list({ page,limit:15,status:status || undefined }) });
  const detail=useQuery({ queryKey:['credit-note-detail',branchId,detailId],queryFn:()=>creditNoteService.get(detailId),enabled:!!detailId });
  const note=detail.data;
  useEffect(()=>{setConfirm(false);setDiscardReason('');setPaper(false);},[detailId]);
  const refresh=(result:BillingCreditNote)=>{
    client.invalidateQueries({ queryKey:['billing-credit-notes'] });client.invalidateQueries({ queryKey:['credit-note-availability'] });
    if(result.branchId!==activeBranch.current)return;
    client.setQueryData(['credit-note-detail',result.branchId,result.id],result);setDetailId(result.id);setConfirm(false);
  };
  const issue=useMutation({ mutationFn:creditNoteService.issue,onSuccess:result=>{refresh(result);toast(result.status==='ACCEPTED'?'Nota de crédito aceptada por SUNAT':'Consulta el resultado de la nota de crédito');},onError:error=>{setConfirm(false);client.invalidateQueries({ queryKey:['credit-note-detail'] });toast.error(errorMessage(error));} });
  const check=useMutation({ mutationFn:creditNoteService.check,onSuccess:refresh,onError:error=>toast.error(errorMessage(error)) });
  const discard=useMutation({ mutationFn:creditNoteService.discard,onSuccess:refresh,onError:error=>toast.error(errorMessage(error)) });
  const download=async(format:'pdf'|'xml'|'cdr')=>{if(!note)return;setBusy(true);try{await creditNoteService.download(note,format);}catch{toast.error('No se pudo descargar el archivo');}finally{setBusy(false);}};
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Undo2 size={22} /> Notas de crédito</h2><p className="mt-1 text-sm text-gray-500">Devoluciones totales o parciales sobre facturas y boletas aceptadas.</p></div><button className={primary} onClick={()=>{setCreateOriginal('');setCreateOpen(true);}}><Plus size={16} /> Nueva nota de crédito</button></div>
    {!connection?.creditNotes?.ready && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{connection?.creditNotes?.message || 'Puedes preparar el borrador. Para emitir, la conexión debe habilitar notas de crédito.'}</p>}
    <div className="flex items-center justify-between gap-3"><label className="text-sm">Estado<select className={`${input} mt-1`} value={status} onChange={event=>{setStatus(event.target.value as BillingStatus | '');setPage(1);}}><option value="">Todos</option>{Object.entries(states).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className={button} onClick={()=>list.refetch()} disabled={list.isFetching}><RefreshCw size={15} /> Actualizar</button></div>
    {list.isLoading?<p>Cargando notas de crédito…</p>:list.error?<p role="alert" className="text-sm text-red-700">{errorMessage(list.error)}</p>:<div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-3">Nota de crédito</th><th className="p-3">Comprobante original</th><th className="p-3">Cliente</th><th className="p-3">Importe</th><th className="p-3">Estado</th><th className="p-3">Detalle</th></tr></thead><tbody>{list.data?.data.map(item=><tr key={item.id} className="border-t"><td className="p-3 font-medium">{reference(item)}</td><td className="p-3">{item.originalSeries}-{String(item.originalNumber).padStart(8,'0')}</td><td className="p-3">{item.receiver.name}</td><td className="p-3">{money(item.total)}</td><td className="p-3">{states[item.status]}</td><td className="p-3"><button className={button} onClick={()=>setDetailId(item.id)}><Eye size={14} /> Abrir</button></td></tr>)}{!list.data?.total&&<tr><td colSpan={6} className="p-8 text-center text-gray-500">Todavía no hay notas de crédito.</td></tr>}</tbody></table></div>}
    <Pagination page={page} totalPages={Math.ceil((list.data?.total || 0)/15)} onPageChange={setPage} />
    <Modal isOpen={createOpen} onClose={()=>setCreateOpen(false)} title="Preparar nota de crédito" size="xl">{createOpen && <CreditNoteForm branchId={branchId} initialOriginalId={createOriginal} onClose={()=>setCreateOpen(false)} onSaved={result=>{if(result.branchId!==activeBranch.current)return;setCreateOpen(false);refresh(result);}} />}</Modal>
    <Modal isOpen={!!detailId} onClose={()=>!issue.isPending && setDetailId('')} title="Detalle de nota de crédito" size="xl">
      {detail.isLoading?<p>Cargando…</p>:detail.error?<p className="text-red-700">{errorMessage(detail.error)}</p>:note&&<div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-4"><p className="font-semibold">{reference(note)} · {states[note.status]}</p><p className="mt-1 text-sm">Comprobante afectado: {note.originalSeries}-{String(note.originalNumber).padStart(8,'0')}</p><p className="text-sm">Cliente: {note.receiver.name} · {note.receiver.documentNumber || 'Consumidor final'}</p><p className="mt-2 text-sm">Motivo {note.reasonCode}: {note.reasonDescription}</p><p className="mt-2 font-bold">Total a acreditar: {money(note.total)} · IGV: {money(note.taxAmount)}</p></div>
        <ul className="divide-y rounded-lg border">{note.items.map(item=><li key={item.originalItemIndex} className="flex justify-between gap-3 p-3 text-sm"><span>{item.description} · {item.quantity} {item.unit}</span><strong>{money(item.total)}</strong></li>)}</ul>
        {note.sunatDescription&&<p className="rounded-lg bg-blue-50 p-3 text-sm">{note.sunatDescription}</p>}
        <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setPaper(true)}><Eye size={15} /> Vista A4 y ticket</button>{(['pdf','xml','cdr'] as const).map(format=><button key={format} className={button} disabled={busy || !(format==='pdf'?note.hasPdf:format==='xml'?note.hasXml:note.hasCdr)} onClick={()=>download(format)}><Download size={15} /> {format.toUpperCase()}</button>)}{['PENDING','UNKNOWN','SENDING'].includes(note.status)&&<button className={button} disabled={check.isPending||issue.isPending} onClick={()=>check.mutate(note.id)}><RefreshCw size={15} /> Consultar estado</button>}</div>
        {note.status==='DRAFT'&&<div className="space-y-3 rounded-lg border p-4"><p className="text-sm">Se emitirá una nota de crédito por {money(note.total)} contra {note.originalSeries}-{String(note.originalNumber).padStart(8,'0')}. {connection?.environment==='production'?'Ambiente: PRODUCCIÓN.':'Ambiente de pruebas.'}</p><p className="text-xs text-gray-500">La recepción de mercadería y el reembolso se registran por separado.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirm} disabled={issue.isPending} onChange={event=>setConfirm(event.target.checked)} /><span>Revisé el comprobante original, las cantidades devueltas y el importe. Confirmo el envío a SUNAT.</span></label><button className={primary} disabled={!confirm||issue.isPending||!connection?.ready||!connection.creditNotes?.ready||connection.issuerRuc!==note.issuer.documentNumber||connection.environment!==note.environment} onClick={()=>issue.mutate(note.id)}>{issue.isPending?'Enviando…':'Confirmar y emitir nota de crédito'}</button><div className="flex flex-wrap gap-2 border-t pt-3"><input aria-label="Motivo para descartar el borrador" className={`${input} flex-1`} value={discardReason} maxLength={500} placeholder="Motivo para descartar el borrador" onChange={event=>setDiscardReason(event.target.value)} /><button className={button} disabled={discardReason.trim().length<5||discard.isPending||issue.isPending} onClick={()=>discard.mutate({ id:note.id,reason:discardReason.trim() })}>Descartar borrador</button></div></div>}
      </div>}
    </Modal>
    <BillingPreviewModal isOpen={paper} onClose={()=>setPaper(false)} document={note || null} />
  </section>;
}
