import type { BillingPrintDocument } from './printTypes';

export type BillingPrintFormat = 'A4' | 'TICKET';
export interface BillingPreviewOptions { example?: boolean; simulation?: boolean; }
export const billingMoney = (value: number) => `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const billingQuantity = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 6 });

export function billingPresentation(document: BillingPrintDocument, options: BillingPreviewOptions = {}) {
  const saleNote = document.documentType === 'NOTA_VENTA';
  const issued = new Date(document.submittedAt || document.saleDate);
  const validDate = !Number.isNaN(issued.getTime());
  const reference = saleNote ? document.internalReference : document.series && document.number
    ? `${document.series}-${String(document.number).padStart(8, '0')}` : 'SIN NUMERACIÓN';
  const statuses = { DRAFT: 'BORRADOR', SENDING: 'ENVIANDO', PENDING: 'PENDIENTE DE SUNAT', ACCEPTED: 'ACEPTADO', REJECTED: 'RECHAZADO', UNKNOWN: 'REQUIERE REVISIÓN', DISCARDED: 'DESCARTADO' };
  const example = options.example === true;
  const simulation = options.simulation === true;
  const nonFiscal = saleNote || example || simulation || document.status === 'DRAFT' || document.status === 'DISCARDED' || document.environment === 'beta';
  const label = example ? 'EJEMPLO DE FORMATO' : simulation ? 'SIMULACIÓN' : saleNote ? (document.status === 'DISCARDED' ? 'ANULADA · DOCUMENTO INTERNO' : 'DOCUMENTO INTERNO') : document.environment === 'beta' ? `PRUEBAS · ${statuses[document.status]}` : statuses[document.status];
  const notice = example ? 'Datos de ejemplo. Sin validez tributaria.'
    : simulation ? 'Simulación local. No enviada a SUNAT. Sin validez tributaria.'
      : saleNote ? 'Nota de venta interna. Sin validez tributaria.'
      : document.status === 'DRAFT' || document.status === 'DISCARDED' ? 'Documento interno sin validez tributaria. No emitido a SUNAT.'
        : document.environment === 'beta' ? 'Ambiente de pruebas. Sin validez tributaria.'
          : document.status === 'ACCEPTED' ? 'Representación impresa del comprobante electrónico.'
            : document.status === 'REJECTED' ? 'Comprobante rechazado. Sin validez tributaria.'
              : 'La aceptación por SUNAT aún no está confirmada. Consulta el estado del comprobante.';
  const qr = !nonFiscal && document.hash && document.series && document.number && validDate
    ? [document.issuer.documentNumber, document.documentType === 'FACTURA' ? '01' : '03', document.series, String(document.number), document.taxAmount.toFixed(2), document.total.toFixed(2), issued.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }), document.receiver.documentType === 'RUC' ? '6' : document.receiver.documentType === 'DNI' ? '1' : '-', document.receiver.documentNumber || '-', document.hash].join('|') : undefined;
  return {
    title: saleNote ? 'NOTA DE VENTA' : document.documentType === 'FACTURA' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA', reference,
    issuerIdentity: saleNote && !document.issuer.documentNumber ? 'Documento interno del sistema' : `RUC ${document.issuer.documentNumber || 'Pendiente'}`,
    issuerAddress: document.issuer.address || (saleNote ? '' : 'Dirección pendiente'),
    label, notice, nonFiscal, qr,
    date: validDate ? issued.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha',
    tax: { GRAVADO: 'Gravado', EXONERADO: 'Exonerado', INAFECTO: 'Inafecto', MIXTO: 'Mixto' }[document.taxType],
    payment: document.paymentCondition === 'CONTADO' ? 'Contado' : 'Crédito',
  };
}
