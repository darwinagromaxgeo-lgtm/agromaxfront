import { buildCommercialDocument, commercialPaymentTotals } from '../../../shared/branding/commercialDocumentPdf';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import logo from '../../../shared/branding/logoData';
import { pdfBrandFooter } from '../../../shared/branding/pdfBrand';
import type { BillingPrintDocument } from './printTypes';
import { billingMoney, billingPresentation, billingQuantity, type BillingPreviewOptions, type BillingPrintFormat } from './documentPresentation';

(pdfMake as any).addVirtualFileSystem((pdfFonts as any).vfs || (pdfFonts as any).pdfMake?.vfs || pdfFonts);

export function buildBillingPrintDefinition(document: BillingPrintDocument, format: BillingPrintFormat, options: BillingPreviewOptions = {}): any {
  const ticket = format === 'TICKET';
  if (document.documentType === 'NOTA_VENTA' && !ticket && !options.example && !options.simulation) return buildCommercialDocument({
    kind: 'SALE_NOTE', reference: document.internalReference, issuedAt: document.saleDate, total: document.total,
    company: { name: document.issuer.name, ruc: document.issuer.documentNumber || '', address: document.issuer.address, phone: document.issuerPhone, bankAccounts: document.issuerBankAccounts },
    client: document.receiver, paymentCondition: document.paymentCondition, payments: document.payments,
    cancelled: document.status === 'DISCARDED', items: document.items.map(item => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, subtotal: item.total, taxType: item.taxType, taxRate: item.taxRate })),
  });
  const view = billingPresentation(document, options);
  const totalRows = [
    ...(!ticket || document.taxableAmount > 0 ? [['Op. gravadas', billingMoney(document.taxableAmount)]] : []),
    ...(!ticket || document.exemptAmount > 0 ? [['Op. exoneradas', billingMoney(document.exemptAmount)]] : []),
    ...(!ticket || document.unaffectedAmount > 0 ? [['Op. inafectas', billingMoney(document.unaffectedAmount)]] : []),
    ['IGV', billingMoney(document.taxAmount)],
  ];
  const receiver = [
    { text: 'CLIENTE', fontSize: 7, color: '#64748b', bold: true },
    { text: document.receiver.name, bold: true, margin: [0, 4, 0, 3] },
    { text: `${document.receiver.documentType === 'UNIDENTIFIED' ? 'Documento' : document.receiver.documentType}: ${document.receiver.documentNumber || 'Sin identificación'}` },
    ...(document.receiver.address ? [{ text: document.receiver.address, margin: [0, 3, 0, 0] }] : []),
  ];
  const definition: any = {
    info: { title: `${view.title} · ${view.reference}`, author: 'Agromax', subject: view.notice },
    pageSize: ticket ? { width: 80 * 72 / 25.4, height: 'auto' } : 'A4',
    pageMargins: ticket ? [10.5, 6, 10.5, 10] : [36, 32, 36, 42],
    defaultStyle: { font: 'Roboto', fontSize: ticket ? 10.5 : 9, color: ticket ? '#000000' : '#1f2937', lineHeight: 1.2, ...(ticket ? { bold: true } : {}) },
    ...(!ticket ? { footer: (page: number, pages: number) => pdfBrandFooter(page, pages, 36) } : {}),
    content: [
      { columns: [{ width: '*', stack: [
        { image: logo, width: ticket ? 135 : 175, alignment: ticket ? 'center' : 'left', margin: [0, 0, 0, ticket ? 4 : 13] },
        { text: document.issuer.name, bold: true, fontSize: ticket ? 12 : 14, alignment: ticket ? 'center' : 'left' },
        { text: view.issuerIdentity, alignment: ticket ? 'center' : 'left', margin: ticket ? [0, 2, 0, 2] : [0, 4, 0, 4] },
        { text: view.issuerAddress, fontSize: ticket ? 9 : 8, alignment: ticket ? 'center' : 'left' },
      ] }, ...(!ticket ? [{ width: 190, margin: [10, 0, 0, 0], table: { widths: ['*'], body: [[{ stack: [
        { text: view.title, fontSize: 10, bold: true, color: '#16783d' },
        { text: view.reference, fontSize: 17, bold: true, margin: [0, 9, 0, 9] },
        { text: view.label, fontSize: 8, bold: true, color: view.nonFiscal ? '#92400e' : '#16783d' },
      ], alignment: 'center', fillColor: '#f0fdf4', margin: [9, 14, 9, 14], borderColor: ['#c8e2d1', '#c8e2d1', '#c8e2d1', '#c8e2d1'] }]] } }] : [])], margin: [0, 0, 0, ticket ? 6 : 18] },
      ...(ticket ? [
        { text: view.title, fontSize: 10, bold: true, color: '#16783d', alignment: 'center', margin: [0, 0, 0, 4] },
        { text: view.reference, bold: true, fontSize: 15, alignment: 'center', margin: [0, 0, 0, 5] },
        { text: view.label, fontSize: 9, bold: true, color: view.nonFiscal ? '#92400e' : '#16783d', alignment: 'center', margin: [0, 0, 0, 8] },
      ] : []),
      ...(ticket ? receiver : [{ columns: [{ width: '*', stack: receiver }, { width: 160, stack: [{ text: `Fecha: ${view.date}` }, { text: `Pago: ${view.payment}`, margin: [0, 5, 0, 0] }, { text: `Afectación: ${view.tax}`, margin: [0, 5, 0, 0] }] }] }]),
      ...(ticket ? [{ text: `Fecha: ${view.date}\nPago: ${view.payment} · ${view.tax}`, margin: [0, 10, 0, 0] }] : []),
      ...(document.documentType==='NOTA_CREDITO' ? [{ text:`Comprobante afectado: ${document.originalSeries}-${String(document.originalNumber).padStart(8,'0')}\nMotivo ${document.reasonCode}: ${document.reasonDescription}`,margin:[0,10,0,0] }] : []),
      { margin: ticket ? [0, 10, 0, 9] : [0, 15, 0, 12], table: { headerRows: 1, widths: ticket ? ['*', 58] : ['*', 35, 33, 59, 59], body: [
        (ticket ? ['DETALLE', 'IMPORTE'] : ['DESCRIPCIÓN', 'CANT.', 'UND.', 'P. UNIT.', 'IMPORTE']).map((text, index) => ({ text, bold: true, fontSize: ticket ? 9 : 8, color: '#16783d', fillColor: ticket ? '#ffffff' : '#f0fdf4', margin: [0, 5, 0, 5], ...(ticket && index === 1 ? { alignment: 'right' } : {}) })),
        ...document.items.map(item => ticket ? [
          { stack: [{ text: item.description, bold: true, margin: [0, 5, 0, 3] }, { text: `${billingQuantity(item.quantity)} ${item.unit} × ${billingMoney(item.unitPrice)}`, fontSize: 7, color: '#64748b', margin: [0, 0, 0, 5] }] },
          { text: billingMoney(item.total), alignment: 'right', margin: [0, 5, 0, 0] },
        ] : [{ text: item.description, margin: [0, 6, 0, 6] }, { text: billingQuantity(item.quantity), alignment: 'right', margin: [0, 6, 0, 6] }, { text: item.unit, margin: [0, 6, 0, 6] }, { text: billingMoney(item.unitPrice), alignment: 'right', margin: [0, 6, 0, 6] }, { text: billingMoney(item.total), alignment: 'right', bold: true, margin: [0, 6, 0, 6] }]),
      ] }, layout: ticket ? {
        hLineWidth: (index: number) => index <= 1 ? 0.7 : 0.35,
        hLineColor: () => '#000000', vLineWidth: () => 0,
        paddingLeft: () => 0, paddingRight: (index: number) => index === 0 ? 6 : 0,
        paddingTop: () => 3, paddingBottom: () => 3,
      } : 'lightHorizontalLines' },
      { columns: [...(!ticket ? [{ width: '*', text: '' }] : []), { width: ticket ? '*' : 230, table: { widths: ['*', 'auto'], body: [
        ...totalRows.map(([text, value]) => [{ text, color: '#64748b' }, { text: value, alignment: 'right' }]),
        [{ text: document.cancelledByCreditNoteId?'IMPORTE ANULADO':document.documentType==='NOTA_CREDITO'?'TOTAL A ACREDITAR':document.documentType==='NOTA_VENTA'?'IMPORTE TOTAL':'TOTAL A PAGAR', bold: true, fontSize: ticket ? 10 : 12, color: '#16783d', margin: [0, 7, 0, 7] }, { text: billingMoney(document.total), bold: true, fontSize: ticket ? 16.5 : 16, alignment: 'right', color: '#16783d', margin: [0, 7, 0, 7] }],
      ] }, layout: 'noBorders' }] },
      ...(document.documentType === 'NOTA_VENTA' && document.payments?.length ? [{ text: 'PAGOS REGISTRADOS EN LA VENTA', bold: true, fontSize: 9, margin: [0, 10, 0, 4] }, ...document.payments.map(payment => ({ columns: [{ text: payment.paymentMethodName }, { text: billingMoney(payment.amount), alignment: 'right' }], margin: [0, 2, 0, 2] }))] : []),
      ...(document.documentType === 'NOTA_VENTA' && document.paymentCondition === 'CREDITO' ? [{ columns: [{ text: 'Abono inicial' }, { text: billingMoney(commercialPaymentTotals(document.total, document.payments).paid), alignment: 'right' }], margin: [0, 6, 0, 2] }, { columns: [{ text: 'Saldo inicial', bold: true }, { text: billingMoney(commercialPaymentTotals(document.total, document.payments).pending), alignment: 'right', bold: true }] }, { text: 'Los abonos posteriores y el saldo actual se consultan en Créditos.', fontSize: 9, margin: [0, 5, 0, 0] }] : []),
      ...(view.qr ? [{ qr: view.qr, fit: ticket ? 90 : 95, alignment: ticket ? 'center' : 'left', margin: [0, 16, 0, 6] }] : []),
      ...(!view.nonFiscal && document.hash ? [{ text: `Hash: ${document.hash}`, fontSize: 6, margin: [0, 8, 0, 0] }] : []),
      { text: view.notice, alignment: ticket ? 'center' : 'left', fontSize: 8, bold: view.nonFiscal, color: view.nonFiscal ? '#92400e' : '#64748b', margin: [0, 18, 0, 0] },
      ...(ticket ? [{ text: 'Gracias por tu compra\nAgromax · Innovando la agricultura', alignment: 'center', color: '#64748b', fontSize: 7, margin: [0, 14, 0, 0] }] : []),
    ],
  };
  if (ticket) {
    // Keep every text node legible on thermal paper, including nested table cells.
    const thermalText = (value: any) => {
      if (Array.isArray(value)) { value.forEach(thermalText); return; }
      if (!value || typeof value !== 'object') return;
      if (value.text !== undefined) {
        value.color = '#000000'; value.bold = true;
        if (typeof value.fontSize === 'number') value.fontSize = Math.max(value.fontSize, 9);
      }
      Object.values(value).forEach(thermalText);
    };
    thermalText(definition.content);
  }
  return definition;
}

export function downloadBillingPrint(document: BillingPrintDocument, format: BillingPrintFormat, options: BillingPreviewOptions = {}) {
  const view = billingPresentation(document, options);
  const name = document.documentType === 'NOTA_VENTA' || (document.series && document.number) ? view.reference : document.id?.slice(-8) || 'sin-numero';
  return (pdfMake as any).createPdf(buildBillingPrintDefinition(document, format, options))
    .download(`${options.example ? 'ejemplo' : options.simulation ? 'simulacion' : document.documentType === 'NOTA_VENTA' ? 'nota-venta' : document.status === 'DRAFT' ? 'borrador' : 'comprobante'}-${name}-${format.toLowerCase()}.pdf`);
}

export function printBillingDocument(document: BillingPrintDocument, format: BillingPrintFormat, options: BillingPreviewOptions, target: Window) {
  return (pdfMake as any).createPdf(buildBillingPrintDefinition(document, format, options)).print(target);
}
