import type { Client, Company, Product, Sale } from '../../../shared/types';
import type { BillingItem, BillingTaxType } from '../../billing/types';
import type { SaleNotePrintDocument } from '../../billing/utils/printTypes';

export function saleNoteReference(sale: Pick<Sale, 'id' | 'noteSeries' | 'noteNumber'>): string {
  return sale.noteSeries && sale.noteNumber ? `${sale.noteSeries}-${String(sale.noteNumber).padStart(8, '0')}` : `NV-${sale.id.slice(-8).toUpperCase()}`;
}

export function saleNoteDocument({ sale, companies, client, products, branchId }: {
  sale: Sale; companies: Company[]; client?: Client; products: Product[]; branchId: string;
}): SaleNotePrintDocument {
  if (sale.voucherType !== 'NONE') throw new Error('Selecciona una venta registrada como nota de venta');
  const issuers = [...new Set(sale.items.map(item => item.companyId))];
  const company = issuers.length === 1 ? companies.find(item => item.id === issuers[0]) : undefined;
  const companyById = new Map(companies.map(item => [item.id, item]));
  const productById = new Map(products.map(item => [item.id, item]));
  let legacyTaxData = false;
  const items: BillingItem[] = sale.items.map(item => {
    const product = productById.get(item.productId);
    const taxType = (item.taxType || product?.taxType || 'GRAVADO') as BillingTaxType;
    if (!item.taxType || item.taxRate == null || !item.unit) legacyTaxData = true;
    const rate = taxType === 'GRAVADO' ? item.taxRate ?? .18 : 0;
    const totalCents = Math.round(item.subtotal * 100);
    const baseCents = taxType === 'GRAVADO' ? Math.round(totalCents / (1 + rate)) : totalCents;
    const description = item.productName || product?.name || item.productId;
    return {
      productId: item.productId, description: issuers.length > 1 ? `${description} · ${companyById.get(item.companyId)?.name || item.companyId}` : description,
      unit: item.unit || product?.unit || 'UND', quantity: item.quantity, unitPrice: item.unitPrice, taxType, taxRate: rate,
      total: totalCents / 100, baseAmount: baseCents / 100, taxAmount: (totalCents - baseCents) / 100,
    };
  });
  const types = [...new Set(items.map(item => item.taxType))];
  const base = (type: BillingTaxType) => items.filter(item => item.taxType === type).reduce((sum, item) => sum + Math.round(item.baseAmount * 100), 0) / 100;
  const documentNumber = client?.documentNumber || '';
  return {
    id: sale.id, branchId, companyId: company?.id || '', saleId: sale.id, documentType: 'NOTA_VENTA',
    internalReference: saleNoteReference(sale), status: sale.isCancelled ? 'DISCARDED' : 'DRAFT',
    taxType: types.length > 1 ? 'MIXTO' : types[0] || 'GRAVADO', currency: 'PEN', paymentCondition: sale.isCredit ? 'CREDITO' : 'CONTADO',
    saleDate: sale.date, createdAt: sale.createdAt,
    issuer: { name: company?.name || (issuers.length > 1 ? 'VENTA MULTIEMPRESA' : 'AGROMAX'), documentType: 'RUC', documentNumber: company?.ruc, address: company?.address },
    receiver: { name: client?.name || 'Consumidor final', documentType: documentNumber.length === 11 ? 'RUC' : documentNumber.length === 8 ? 'DNI' : 'UNIDENTIFIED', documentNumber: documentNumber || undefined, address: client?.address },
    items, taxableAmount: base('GRAVADO'), exemptAmount: base('EXONERADO'), unaffectedAmount: base('INAFECTO'),
    taxAmount: items.reduce((sum, item) => sum + Math.round(item.taxAmount * 100), 0) / 100, total: sale.total,
    payments: sale.payments, issuerPhone: company?.phone, issuerBankAccounts: company?.bankAccounts,
    legacyTaxData, warnings: legacyTaxData ? ['Nota de una venta anterior: algunos datos tributarios se completaron con el catálogo actual.'] : [],
  };
}
