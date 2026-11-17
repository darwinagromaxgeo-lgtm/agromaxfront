import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { BillingDocument } from '../types';
import { pdfBrandFooter } from '../../../shared/branding/pdfBrand';

(pdfMake as any).addVirtualFileSystem((pdfFonts as any).vfs || (pdfFonts as any).pdfMake?.vfs || pdfFonts);
const money = (value: number) => `S/ ${value.toFixed(2)}`;

export function buildBillingDraftDefinition(document: BillingDocument, simulation = false) {
  return {
    pageSize: 'A4', pageMargins: [35, 40, 35, 40], defaultStyle: { fontSize: 9 },
    watermark: { text: simulation ? 'SIMULACIÓN' : 'BORRADOR', color: 'gray', opacity: 0.08, bold: true },
    footer: (currentPage: number, pageCount: number) => pdfBrandFooter(currentPage, pageCount, 35),
    content: [
      { text: `${document.documentType} · ${document.taxType}`, fontSize: 17, bold: true, color: '#183d2b' },
      { text: `${simulation ? 'SIMULACIÓN LOCAL' : 'BORRADOR INTERNO'} · SIN VALIDEZ TRIBUTARIA`, bold: true, color: '#b45309', margin: [0, 6, 0, 16] },
      { text: `${document.issuer.name}\nRUC: ${document.issuer.documentNumber || '—'}\n${document.issuer.address || ''}` },
      { text: `Cliente: ${document.receiver.name}\n${document.receiver.documentType}: ${document.receiver.documentNumber || 'Sin documento'}\nVenta de origen: ${document.saleId}`, margin: [0, 12, 0, 14] },
      { table: { headerRows: 1, widths: ['*', 38, 45, 55, 55], body: [
        ['Producto', 'Cant.', 'Unidad', 'IGV', 'Total'],
        ...document.items.map(item => [item.description, String(item.quantity), item.unit, money(item.taxAmount), money(item.total)]),
      ] }, layout: 'lightHorizontalLines' },
      { text: `Gravado: ${money(document.taxableAmount)}\nExonerado: ${money(document.exemptAmount)}\nInafecto: ${money(document.unaffectedAmount)}\nIGV: ${money(document.taxAmount)}\nTOTAL: ${money(document.total)}`, alignment: 'right', margin: [0, 16, 0, 12], bold: true },
      ...document.warnings.map(text => ({ text, color: '#92400e', margin: [0, 6, 0, 0] })),
      { text: 'Este archivo no ha sido enviado a SUNAT ni acredita la emisión de un comprobante electrónico.', margin: [0, 18, 0, 0], italics: true },
    ],
  };
}

export function downloadBillingDraft(document: BillingDocument, simulation = false): Promise<void> {
  return (pdfMake as any).createPdf(buildBillingDraftDefinition(document, simulation))
    .download(`${simulation ? 'simulacion' : 'borrador'}-${document.id.slice(-8)}.pdf`);
}
