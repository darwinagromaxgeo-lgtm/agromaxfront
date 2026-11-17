import { api } from '../../../shared/services/api';
import type { BillingDocument, BillingDraftInput, BillingFilters, BillingGroup, BillingParty, BillingProviderStatus, BillingSimulation } from '../types';

export const billingService = {
  status: (): Promise<BillingProviderStatus> => api.get('/billing/status').then(response => response.data.data),
  list: (params: BillingFilters): Promise<{ data: BillingDocument[]; total: number }> => api.get('/billing/documents', { params: { ...params, saleIds: params.saleIds?.join(',') } }).then(response => response.data.data),
  forSales: async (saleIds: string[]): Promise<BillingDocument[]> => {
    const ids = [...new Set(saleIds)];
    const documents = new Map<string, BillingDocument>();
    for (let start = 0; start < ids.length; start += 50) {
      let page = 1;
      let total = 0;
      do {
        const result = await billingService.list({ saleIds: ids.slice(start, start + 50), page, limit: 100 });
        result.data.forEach(document => documents.set(document.id, document));
        total = result.total;
        if (!result.data.length) break;
        page++;
      } while ((page - 1) * 100 < total);
    }
    return [...documents.values()];
  },
  get: (id: string): Promise<BillingDocument> => api.get(`/billing/documents/${id}`).then(response => response.data.data),
  groups: (saleId: string): Promise<BillingGroup[]> => api.get(`/billing/sales/${saleId}/groups`).then(response => response.data.data),
  saleReceiver: (saleId: string): Promise<BillingParty> => api.get(`/billing/sales/${saleId}/receiver`).then(response => response.data.data),
  updateReceiver: ({ id, receiver, expectedRevision }: { id: string; receiver: BillingParty; expectedRevision: number }): Promise<BillingDocument> => api.post(`/billing/documents/${id}/receiver`, { receiver, expectedRevision }).then(response => response.data.data),
  preview: (data: BillingDraftInput): Promise<BillingDocument> => api.post('/billing/preview', data).then(response => response.data.data),
  create: (data: BillingDraftInput): Promise<BillingDocument> => api.post('/billing/documents', data).then(response => response.data.data),
  simulate: (id: string): Promise<BillingSimulation> => api.post(`/billing/documents/${id}/simulate`).then(response => response.data.data),
  discard: ({ id, reason }: { id: string; reason: string }): Promise<BillingDocument> => api.post(`/billing/documents/${id}/discard`, { reason }).then(response => response.data.data),
  issue: ({ id, receiverRevision }: { id: string; receiverRevision: number }): Promise<BillingDocument> => api.post(`/billing/documents/${id}/issue`, { confirm: true, receiverRevision }, { timeout: 120_000 }).then(response => response.data.data),
  checkStatus: (id: string): Promise<BillingDocument> => api.post(`/billing/documents/${id}/check-status`).then(response => response.data.data),
  downloadSimulation: (result: BillingSimulation, format: 'pdf' | 'xml') => {
    const base64 = format === 'pdf' ? result.service?.pdfBase64 : result.service?.xmlBase64;
    if (!result.service?.verified || !base64) throw new Error('Archivo de simulación no disponible');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: format === 'pdf' ? 'application/pdf' : 'application/xml' }));
    const link = window.document.createElement('a');
    link.href = url; link.download = `simulacion-${result.document.id.slice(-8)}.${format}`;
    window.document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  download: async (document: BillingDocument, format: 'pdf' | 'xml' | 'cdr') => {
    const response = await api.get(`/billing/documents/${document.id}/files/${format}`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.series || 'borrador'}-${String(document.number || 0).padStart(8, '0')}.${format === 'cdr' ? 'zip' : format}`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
