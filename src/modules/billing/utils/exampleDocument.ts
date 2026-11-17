import type { Company } from '../../../shared/types';
import type { BillingPrintDocument, BillingPrintDocumentType } from './printTypes';

/** Client-side sample only; never stored or submitted to the billing API. */
export function billingFormatExample(company: Company | undefined, type: BillingPrintDocumentType): BillingPrintDocument {
  return {
    id: 'ejemplo-formato', branchId: '', companyId: company?.id || '', saleId: '', documentType: type,
    internalReference: 'NV-EJEMPLO',
    status: 'DRAFT', taxType: 'GRAVADO', currency: 'PEN', paymentCondition: 'CONTADO', saleDate: new Date().toISOString(),
    issuer: { name: company?.name || 'AGROMAX GEO S.A.C.', documentType: 'RUC', documentNumber: company?.ruc, address: company?.address },
    receiver: { name: 'Cliente de ejemplo', documentType: type === 'FACTURA' ? 'RUC' : 'DNI', documentNumber: type === 'FACTURA' ? '00000000000' : '00000000', address: 'Dirección del cliente de ejemplo' },
    items: [
      { productId: 'ejemplo-1', description: 'Fertilizante soluble 20-20-20', unit: 'KG', quantity: 1, unitPrice: 35, taxType: 'GRAVADO', taxRate: 0.18, baseAmount: 29.66, taxAmount: 5.34, total: 35 },
      { productId: 'ejemplo-2', description: 'Bioestimulante foliar', unit: 'UND', quantity: 2, unitPrice: 18, taxType: 'GRAVADO', taxRate: 0.18, baseAmount: 30.51, taxAmount: 5.49, total: 36 },
    ],
    taxableAmount: 60.17, exemptAmount: 0, unaffectedAmount: 0, taxAmount: 10.83, total: 71, legacyTaxData: false, warnings: [],
  };
}
