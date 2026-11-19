import { api } from '../../../shared/services/api';
import type { BillingCreditNote, BillingStatus, CreditNoteAvailability, CreditNoteInput } from '../types';

export const creditNoteService = {
  list:(params:{ page:number; limit:number; status?:BillingStatus; originalDocumentId?:string }):Promise<{ data:BillingCreditNote[]; total:number }> => api.get('/billing/credit-notes',{ params }).then(response=>response.data.data),
  availability:(id:string):Promise<CreditNoteAvailability> => api.get(`/billing/credit-notes/original/${id}`).then(response=>response.data.data),
  preview:(input:CreditNoteInput):Promise<BillingCreditNote> => api.post('/billing/credit-notes/preview',input).then(response=>response.data.data),
  create:(input:CreditNoteInput & { requestId:string }):Promise<BillingCreditNote> => api.post('/billing/credit-notes',input).then(response=>response.data.data),
  get:(id:string):Promise<BillingCreditNote> => api.get(`/billing/credit-notes/${id}`).then(response=>response.data.data),
  issue:(id:string):Promise<BillingCreditNote> => api.post(`/billing/credit-notes/${id}/issue`,{ confirm:true },{ timeout:110_000 }).then(response=>response.data.data),
  discard:({ id,reason }:{ id:string; reason:string }):Promise<BillingCreditNote> => api.post(`/billing/credit-notes/${id}/discard`,{ reason }).then(response=>response.data.data),
  check:(id:string):Promise<BillingCreditNote> => api.post(`/billing/credit-notes/${id}/check-status`,{},{ timeout:45_000 }).then(response=>response.data.data),
  download:async (note:BillingCreditNote,format:'pdf'|'xml'|'cdr') => {
    const response=await api.get(`/billing/credit-notes/${note.id}/files/${format}`,{ responseType:'blob' });
    const url=URL.createObjectURL(response.data);
    const link=document.createElement('a');link.href=url;link.download=`${note.series}-${String(note.number).padStart(8,'0')}.${format==='cdr'?'zip':format}`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
};
