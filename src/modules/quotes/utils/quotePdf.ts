import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Quote, Product, Company, Client } from '../../../shared/types';
import { buildCommercialDocument } from '../../../shared/branding/commercialDocumentPdf';

(pdfMake as any).addVirtualFileSystem((pdfFonts as any).vfs || (pdfFonts as any).pdfMake?.vfs || pdfFonts);
interface GenerateParams {
  quote: Quote; products: Product[]; company?: Company; client?: Client;
  vendor?: { name?: string; phone?: string; email?: string }; currency?: 'PEN' | 'USD';
}
export function buildDocDefinition({ quote, products, company, client, vendor, currency = 'PEN' }: GenerateParams) {
  return buildCommercialDocument({ kind: 'QUOTE', reference: quote.quoteNumber || `${quote.series || 'P001'}-${String(quote.number || 0).padStart(8, '0')}`, issuedAt: quote.issueDate, validUntil: quote.validUntil,
    company, client: quote.clientDetails || client || { name: quote.clientName }, vendor, currency, total: quote.total, notes: quote.notes,
    items: quote.items.map(item => { const product = products.find(product => product.id === item.productId); return {
      description: item.productName || product?.name || item.productId, quantity: item.quantity, unit: item.unit || product?.unit || 'UND',
      unitPrice: item.unitPrice, subtotal: item.subtotal, taxType: item.taxType || product?.taxType, taxRate: item.taxRate,
    }; }),
  });
}
export function downloadQuotePdf(params: GenerateParams) { return pdfMake.createPdf(buildDocDefinition(params)).download(`${params.quote.quoteNumber}.pdf`); }
export async function printQuotePdf(params: GenerateParams, target?: Window) {
  const pdf = pdfMake.createPdf(buildDocDefinition(params));
  if (!target) return pdf.open();
  const url = URL.createObjectURL(await pdf.getBlob());
  target.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
