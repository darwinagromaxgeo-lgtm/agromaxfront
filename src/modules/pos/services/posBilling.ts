import { billingService } from '../../billing/services/billingService';
import type { BillingDocument, BillingDocumentType, BillingParty } from '../../billing/types';

export async function checkoutDocuments(saleId: string) {
  const result = await billingService.list({ saleId, page: 1, limit: 100 });
  return result.data.filter(document => document.status !== 'DISCARDED');
}

export async function emitCheckoutDocuments(saleId: string, documentType: BillingDocumentType, receiver: BillingParty, onProgress: (documents: BillingDocument[]) => void, submit = true, expectedTotal?: number) {
  const groups = await billingService.groups(saleId);
  if (!groups.length || (expectedTotal !== undefined && groups.reduce((sum, group) => sum + Math.round(group.total * 100), 0) !== Math.round(expectedTotal * 100))) throw new Error('Los grupos del comprobante no coinciden con el total de la venta. Revisa su detalle.');
  let documents = await checkoutDocuments(saleId);
  onProgress(documents);
  const blocked = groups.filter(group => group.billingEnabled === false && !documents.some(document => document.companyId === group.companyId && document.taxType === group.taxType && document.status !== 'DRAFT'));
  if (blocked.length) throw new Error(`Hay productos no habilitados para boletas ni facturas: ${blocked.flatMap(group => group.blockedProducts || []).join(', ')}. Se permite nota de venta.`);
  for (const group of groups) {
    let document = documents.find(item => item.companyId === group.companyId && item.taxType === group.taxType);
    if (!document) {
      document = await billingService.create({ saleId, companyId: group.companyId, taxType: group.taxType, documentType, receiver });
      documents = [...documents, document];
      onProgress(documents);
    }
    if (document.documentType !== documentType) throw new Error('La venta ya tiene un comprobante de otro tipo. Revisa su resultado.');
    if (submit && document.status === 'DRAFT') {
      if (!(['name', 'documentType', 'documentNumber', 'address', 'email'] as const).every(key => (document!.receiver[key] || '') === (receiver[key] || ''))) throw new Error('El receptor del borrador cambió. Revisa los datos antes del envío.');
      document = await billingService.issue({ id: document.id, receiverRevision: document.receiverRevision || 0 });
    }
    if (submit && document.status === 'PENDING') document = await billingService.checkStatus(document.id);
    documents = documents.map(item => item.id === document!.id ? document! : item);
    onProgress(documents);
  }
  return documents;
}
