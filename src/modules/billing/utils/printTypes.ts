import type { BillingCreditNote, BillingDocument, BillingDocumentType, BillingTaxType } from '../types';

// Printing types only. The fiscal API continues to accept FACTURA and BOLETA.
export type BillingPrintDocumentType = BillingDocumentType | 'NOTA_VENTA';
export type SaleNotePrintDocument = Omit<BillingDocument, 'documentType' | 'taxType'> & {
  documentType: 'NOTA_VENTA';
  taxType: BillingTaxType | 'MIXTO';
  internalReference: string;
  payments?: { paymentMethodName: string; amount: number }[];
  issuerPhone?: string;
};
export type BillingPrintDocument = BillingDocument | SaleNotePrintDocument | BillingCreditNote;
