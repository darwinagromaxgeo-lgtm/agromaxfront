import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye } from 'lucide-react';
import { Modal } from '../../../shared/components/Modal';
import { billingService } from '../services/billingService';
import { BillingRecipientForm } from './BillingRecipientForm';
import { BillingPreviewModal } from './BillingPreviewModal';
import { recipientDocumentType, recipientFormError, recipientFormFromParty, recipientParty } from '../utils/recipientForm';
import type { BillingDocument, BillingDraftInput } from '../types';

const button='rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:opacity-50';
function message(error:any) {const value=error?.response?.data?.message;return Array.isArray(value)?value.join('\n'):typeof value==='string'?value:'No se pudo preparar la nueva emisión';}

export function BillingReissueModal({ originalId,branchId,onSaved,onClose }:{originalId:string;branchId:string;onSaved:(document:BillingDocument)=>void;onClose:()=>void}) {
  const original=useQuery({queryKey:['reissue-original',branchId,originalId],queryFn:()=>billingService.get(originalId),staleTime:0});
  const document=original.data;
  const [recipient,setRecipient]=useState(()=>recipientFormFromParty());
  const [initialized,setInitialized]=useState(false);
  const [paper,setPaper]=useState(false);
  useEffect(()=>{if(document){setRecipient(recipientFormFromParty(document.receiver,document.documentType));setInitialized(true);}},[document?.id]);
  const replacement=useQuery({queryKey:['reissue-replacement',branchId,document?.replacementDocumentId],queryFn:()=>billingService.get(document!.replacementDocumentId!),enabled:!!document?.replacementDocumentId,staleTime:0});
  const existing=replacement.data && replacement.data.status!=='DISCARDED' ? replacement.data : undefined;
  const recipientError=recipientFormError(recipient,document?.total || 0);
  const dto:BillingDraftInput | null=document?.cancelledByCreditNoteId && initialized && !recipientError && !existing && !original.isFetching && !replacement.isFetching && !replacement.error ? {saleId:document.saleId,companyId:document.companyId,taxType:document.taxType,documentType:recipientDocumentType(recipient.mode),receiver:recipientParty(recipient),replacesDocumentId:document.id} : null;
  const preview=useQuery({queryKey:['billing-reissue-preview',branchId,dto],queryFn:()=>billingService.preview(dto!),enabled:!!dto,retry:false});
  const create=useMutation({mutationFn:billingService.create,onSuccess:onSaved,onError:error=>toast.error(message(error))});
  return <Modal isOpen onClose={()=>!create.isPending&&onClose()} title="Volver a emitir el mismo pedido" size="xl"><div className="space-y-4">
    {original.isLoading?<p>Cargando comprobante anulado…</p>:original.error?<p role="alert" className="text-red-700">{message(original.error)}</p>:document&&<>
      <div className="rounded-lg bg-green-50 p-4 text-sm"><p className="font-semibold">Comprobante anterior: {document.series}-{String(document.number).padStart(8,'0')}</p><p className="mt-1">Se conservan el pedido, el stock y los pagos. Se reutilizan los productos e importes de este comprobante.</p><p className="mt-2 font-semibold">Importe a volver a emitir: S/ {document.total.toFixed(2)}</p></div>
      {replacement.error && <p role="alert" className="text-red-700">{message(replacement.error)}</p>}
      {existing?<div className="rounded-lg border p-4 text-sm"><p>Este comprobante ya tiene un reemplazo. Abre ese comprobante para continuar.</p><button className={`${button} mt-3`} onClick={()=>onSaved(existing)}>Abrir comprobante existente</button></div>:<>
        <BillingRecipientForm value={recipient} onChange={setRecipient} total={document.total} disabled={create.isPending} heading="Elige la boleta o factura y el receptor del nuevo comprobante" />
        {preview.error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message(preview.error)}</p>}
        {preview.data&&dto&&!preview.isFetching&&!preview.error&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><p className="text-sm">{preview.data.documentType==='FACTURA'?'Nueva factura':'Nueva boleta'} · {preview.data.receiver.name} · S/ {preview.data.total.toFixed(2)}</p><button className={button} onClick={()=>setPaper(true)}><Eye size={15} className="mr-2 inline" /> Vista previa</button></div>}
        <p className="text-xs text-gray-500">El nuevo número se asignará al confirmar el envío. Después de guardar podrás revisar y emitir el borrador.</p>
        <div className="flex justify-end gap-2"><button className={button} onClick={onClose} disabled={create.isPending}>Cerrar</button><button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!dto||!preview.data||!!preview.error||preview.isFetching||create.isPending} onClick={()=>dto&&create.mutate(dto)}>{create.isPending?'Guardando…':'Preparar nuevo comprobante'}</button></div>
      </>}
    </>}
    <BillingPreviewModal isOpen={paper} onClose={()=>setPaper(false)} document={preview.data || null} />
  </div></Modal>;
}
