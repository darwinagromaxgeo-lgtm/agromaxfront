import type { BillingDocument, BillingStatus } from '../../billing/types';
import type { Client, Company, Product, Sale } from '../../../shared/types';

export const saleBillingStates: Record<BillingStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador · sin emitir', color: 'bg-slate-100 text-slate-700' },
  SENDING: { label: 'Enviando', color: 'bg-blue-50 text-blue-700' },
  PENDING: { label: 'Pendiente de SUNAT', color: 'bg-amber-50 text-amber-800' },
  ACCEPTED: { label: 'Aceptado por SUNAT', color: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rechazado por SUNAT', color: 'bg-red-50 text-red-700' },
  UNKNOWN: { label: 'Por verificar', color: 'bg-orange-50 text-orange-800' },
  DISCARDED: { label: 'Descartado', color: 'bg-gray-100 text-gray-500' },
};
export const billingReference = (document: BillingDocument) => document.series && document.number ? `${document.series}-${String(document.number).padStart(8, '0')}` : 'Sin numeración';
export const fiscalDocumentState = (document:BillingDocument) => document.cancelledByCreditNoteId ? {label:'Anulado por nota de crédito',color:'bg-gray-100 text-gray-600'} : saleBillingStates[document.status];
export const saleFiscalDocuments = (documents: BillingDocument[], saleId: string) => documents.filter(document => document.saleId === saleId && document.status !== 'DISCARDED');
export const activeFiscalDocuments = (documents: BillingDocument[]) => documents.filter(document => document.status !== 'DISCARDED' && !document.cancelledByCreditNoteId);
export const saleUsesInternalNote = (sale: Sale, documents: BillingDocument[]) => !activeFiscalDocuments(documents).length && (sale.voucherType === 'NONE' || documents.some(document => !!document.cancelledByCreditNoteId));
export function saleVoucherLabel(sale: Sale, documents: BillingDocument[]) {
  const active = activeFiscalDocuments(documents);
  if (active.length) return [...new Set(active.map(document => document.documentType === 'FACTURA' ? 'Factura' : 'Boleta'))].join(' / ');
  if (saleUsesInternalNote(sale, documents)) return 'Nota de venta';
  return sale.voucherType === 'FACTURA' ? 'Factura' : 'Boleta';
}
export const billingBlocksCancellation = (documents: BillingDocument[]) => documents.some(document => ['SENDING', 'PENDING', 'ACCEPTED', 'UNKNOWN'].includes(document.status));

export function voucherExportRows(sales: Sale[], documents: BillingDocument[], context: { clients: Map<string, Client>; companies: Map<string, Company>; products: Map<string, Product> }) {
  return sales.filter(sale => !sale.isCancelled).flatMap<Record<string, string | number>>(sale => {
    const associated = saleFiscalDocuments(documents, sale.id);
    const client = sale.clientId ? context.clients.get(sale.clientId) : undefined;
    const companyIds = [...new Set(sale.items.map(item => item.companyId))];
    const common = { 'Fecha venta': new Date(sale.date).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }), 'Referencia venta': sale.id, 'Método de Pago': sale.isCredit ? 'Crédito' : sale.payments?.map(payment => payment.paymentMethodName).join(' + ') || 'Efectivo' };
    if (associated.length) return associated.map(document => ({
      ...common, 'Tipo': document.documentType, 'Serie': document.series || '', 'Correlativo': document.number || '', 'Estado SUNAT': fiscalDocumentState(document).label,
      'Cliente': document.receiver.name, 'Documento cliente': document.receiver.documentNumber || '', 'Empresa': document.issuer.name,
      'Productos': document.items.map(item => `${item.description} x${item.quantity}`).join(', '), 'Afectación': document.taxType,
      'Valor Venta': document.cancelledByCreditNoteId ? 0 : Math.round((document.taxableAmount + document.exemptAmount + document.unaffectedAmount) * 100) / 100,
      'IGV': document.cancelledByCreditNoteId ? 0 : document.taxAmount, 'Total': document.cancelledByCreditNoteId ? 0 : document.total, 'Importe anulado':document.cancelledByCreditNoteId ? document.total : 0, 'Respuesta SUNAT': document.sunatDescription || '',
    }));
    const base = sale.items.reduce((sum, item) => {
      const taxType = item.taxType || context.products.get(item.productId)?.taxType || 'GRAVADO';
      return sum + (taxType === 'GRAVADO' ? Math.round(item.subtotal / (1 + (item.taxRate ?? .18)) * 100) : Math.round(item.subtotal * 100));
    }, 0) / 100;
    return [{ ...common, 'Tipo': sale.voucherType || 'NONE', 'Serie': '', 'Correlativo': '', 'Estado SUNAT': 'Sin emitir', 'Cliente': client?.name || 'Consumidor final', 'Documento cliente': client?.documentNumber || '',
      'Empresa': companyIds.length === 1 ? context.companies.get(companyIds[0])?.name || companyIds[0] : 'Mixta',
      'Productos': sale.items.map(item => `${item.productName || context.products.get(item.productId)?.name || item.productId} x${item.quantity}`).join(', '),
      'Afectación': '', 'Valor Venta': base, 'IGV': Math.round((sale.total - base) * 100) / 100, 'Total': sale.total, 'Respuesta SUNAT': '',
    }];
  });
}
