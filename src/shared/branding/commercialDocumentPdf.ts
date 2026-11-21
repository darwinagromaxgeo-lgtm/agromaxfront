import logo from './logoData';
import { pdfBrandFooter } from './pdfBrand';
import { numberToWords } from '../../modules/quotes/utils/numberToWords';
import type { Company, CompanyBankAccount } from '../types';

export interface CommercialItem {
  description: string; quantity: number; unit: string; unitPrice: number; subtotal: number; taxType?: string; taxRate?: number;
}
export interface CommercialDocumentParams {
  kind: 'QUOTE' | 'SALE_NOTE'; reference: string; issuedAt?: string | Date; validUntil?: string | Date;
  company?: Pick<Company, 'name' | 'ruc' | 'address' | 'phone'> & { bankAccounts?: CompanyBankAccount[] };
  client?: { name?: string; documentNumber?: string; address?: string; phone?: string; email?: string };
  vendor?: { name?: string; phone?: string; email?: string };
  items: CommercialItem[]; total: number; currency?: 'PEN' | 'USD'; notes?: string;
  paymentCondition?: string; payments?: { paymentMethodName: string; amount: number }[]; cancelled?: boolean;
}
const GREEN = '#08883d', LIGHT_GREEN = '#dcfce7', BORDER = '#94a3b8';
const date = (value?: string | Date) => {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
};
const lines = { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => .6, vLineWidth: () => .6, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4 };
const label = (name: string) => ({ text: name, bold: true });
const pair = (name: string, value?: string): any[] => [label(name), { text: ':', alignment: 'center' }, { text: value || '—' }];
export function commercialTaxTotals(items: CommercialItem[]) {
  const cents = { taxable: 0, exempt: 0, unaffected: 0, pending: 0, tax: 0 };
  for (const item of items) {
    const total = Math.round(item.subtotal * 100), type = item.taxType || 'GRAVADO';
    if (type === 'GRAVADO') { const base = Math.round(total / (1 + (item.taxRate ?? .18))); cents.taxable += base; cents.tax += total - base; }
    else if (type === 'EXONERADO') cents.exempt += total;
    else if (type === 'INAFECTO') cents.unaffected += total;
    else cents.pending += total;
  }
  return Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, value / 100])) as Record<keyof typeof cents, number>;
}

/** These amounts describe payments recorded with the original sale, not later credit collections. */
export function commercialPaymentTotals(total: number, payments: { amount: number }[] = []) {
  const paid = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  return { paid: paid / 100, pending: Math.max(0, Math.round(total * 100) - paid) / 100 };
}

export function buildCommercialDocument(params: CommercialDocumentParams): any {
  const { company, client, vendor, items, total, kind } = params;
  const quotation = kind === 'QUOTE', currency = params.currency || 'PEN', symbol = currency === 'USD' ? 'US$' : 'S/';
  const title = quotation ? 'COTIZACIÓN' : 'NOTA DE VENTA';
  const totals = commercialTaxTotals(items);
  const accounts = (company?.bankAccounts || []).filter(account => account.isActive);
  const initialPayments = commercialPaymentTotals(total, params.payments);
  const itemRows: any[][] = items.map((item, index) => [
    { text: String(index + 1), alignment: 'center' }, { text: item.description },
    { text: item.quantity.toLocaleString('es-PE', { maximumFractionDigits: 6 }), alignment: 'right' }, { text: item.unit || 'UND', alignment: 'center' },
    { text: item.unitPrice.toFixed(2), alignment: 'right' }, { text: item.subtotal.toFixed(2), alignment: 'right' },
  ]);
  while (itemRows.length < 6) itemRows.push(Array.from({ length: 6 }, () => ({ text: ' ' })));
  const totalRow = (name: string, amount: number, final = false) => [
    { text: name, fillColor: LIGHT_GREEN, bold: true, alignment: 'right', fontSize: final ? 10 : 9, margin: [2, final ? 5 : 2, 2, final ? 5 : 2] },
    { text: symbol, alignment: 'center', bold: final, margin: [0, final ? 5 : 2, 0, 0] },
    { text: amount.toFixed(2), alignment: 'right', bold: final, fontSize: final ? 11 : 9, margin: [0, final ? 5 : 2, 0, 0] },
  ];
  return {
    info: { title: `${title} ${params.reference}`, author: company?.name || 'Agromax', subject: quotation ? 'Propuesta comercial' : 'Documento interno de venta' },
    pageSize: 'A4', pageMargins: [25, 25, 25, 42], defaultStyle: { fontSize: 8.5, color: '#111827', lineHeight: 1.08 },
    footer: (page: number, pages: number) => { const footer = pdfBrandFooter(page, pages, 25); return { ...footer, columns: [footer.columns[0], { text: params.reference, fontSize: 7, color: '#64748b', margin: [8, 6, 0, 0] }, footer.columns[2]] }; },
    ...(params.cancelled ? { watermark: { text: 'ANULADA', color: '#dc2626', opacity: .12, bold: true } } : {}),
    content: [
      { columns: [
        { width: 132, image: logo, fit: [132, 70], margin: [0, 12, 0, 0] },
        { width: '*', stack: [
          { text: company?.name || 'AGROMAX', fontSize: 15, bold: true, margin: [0, 5, 0, 6] },
          ...(company?.address ? [{ text: `Dirección : ${company.address}`, margin: [0, 0, 0, 4] }] : []),
          ...(company?.phone ? [{ text: `Teléfonos : ${company.phone}` }] : []),
        ] },
        { width: 176, table: { widths: ['*'], body: [
          [{ text: `R.U.C. ${company?.ruc || '—'}`, alignment: 'center', bold: true, fontSize: 10, margin: [0, 5, 0, 5] }],
          [{ text: title, fillColor: quotation ? LIGHT_GREEN : GREEN, color: quotation ? '#111827' : '#ffffff', alignment: 'center', bold: true, fontSize: 13, margin: [0, 5, 0, 5] }],
          [{ text: params.reference, alignment: 'center', bold: true, fontSize: 10.5, margin: [0, 5, 0, 5] }],
        ] }, layout: { ...lines, hLineColor: () => GREEN, vLineColor: () => GREEN } },
      ], columnGap: 10, margin: [0, 0, 0, 20] },
      ...(params.cancelled ? [{ text: 'VENTA ANULADA', alignment: 'center', bold: true, color: '#b91c1c', margin: [0, 0, 0, 8] }] : []),
      { text: 'DATOS DEL CLIENTE', bold: true, fontSize: 9, margin: [2, 0, 0, 5] },
      { table: { widths: [72, 5, '*', 78, 5, 108], body: [
        [...pair('Cliente', client?.name), {}, {}, {}].map((cell, index) => index === 2 ? { ...cell, colSpan: 4 } : cell),
        [...pair('R.U.C. / D.N.I.', client?.documentNumber), {}, {}, {}].map((cell, index) => index === 2 ? { ...cell, colSpan: 4 } : cell),
        [...pair('Dirección', client?.address), ...pair(quotation ? 'Vendedor' : 'Moneda', quotation ? vendor?.name || 'Área de Ventas' : currency === 'USD' ? 'USD — Dólares' : 'PEN — Soles')],
        ...(quotation ? [
          [...pair('Contacto', undefined), ...pair('Teléfono', vendor?.phone || company?.phone)],
          [...pair('Teléfono', client?.phone), ...pair('E-mail', vendor?.email)],
          [...pair('E-mail', client?.email), ...pair('Moneda', currency === 'USD' ? 'USD — Dólares' : 'PEN — Soles')],
        ] : []),
        [...pair('Fecha Emisión', date(params.issuedAt)), ...pair(quotation ? 'Venc. cotización' : 'Condición de venta', quotation ? date(params.validUntil) : params.paymentCondition || 'CONTADO')],
      ] }, layout: { ...lines, paddingTop: () => 2, paddingBottom: () => 2 } },
      ...(quotation ? [
        { text: 'Estimado(s) Sr(s):', margin: [2, 8, 0, 3] },
        { text: 'Reciba nuestro más cordial saludo, a la vez, aprovechamos en hacer llegar la cotización solicitada.', fontSize: 8, margin: [2, 0, 0, 7] },
      ] : [{ text: 'DETALLE DE LA VENTA', bold: true, margin: [2, 12, 0, 6] }]),
      { table: { headerRows: 1, dontBreakRows: true, widths: [26, '*', 42, 42, 56, 60], body: [
        ['ÍTEM', 'DESCRIPCIÓN', 'CANT.', 'U.M.', 'P. UNIT.', 'IMPORTE'].map(text => ({ text, fillColor: quotation ? LIGHT_GREEN : GREEN, color: quotation ? '#111827' : '#ffffff', bold: true, alignment: 'center', fontSize: 8.5 })), ...itemRows,
      ] }, layout: { ...lines, hLineWidth: (index: number, node: any) => index === 0 || index === 1 || index === node.table.body.length ? .6 : 0, paddingTop: () => 4, paddingBottom: () => 4 } },
      { text: [{ text: 'SON: ', bold: true }, { text: numberToWords(total, currency) }], fontSize: 8, margin: [2, 13, 0, 17] },
      { columns: [
        { width: '*', stack: [
          { text: quotation ? 'CONDICIONES COMERCIALES' : 'CONDICIÓN Y PAGOS REGISTRADOS', bold: true, fontSize: 9, margin: [2, 0, 0, 6] },
          { table: { widths: [106, 5, '*'], body: [
            pair('Condición de Venta', params.paymentCondition || 'CONTADO'),
            ...(quotation ? [pair('Tiempo de Entrega', 'INMEDIATO'), pair('Lugar de Entrega', client?.address)] : []),
            ...(params.notes ? [pair('Observaciones', params.notes)] : []),
            ...(!quotation && params.payments?.length ? params.payments.map(payment => pair(payment.paymentMethodName, `${symbol} ${payment.amount.toFixed(2)}`)) : []),
            ...(!quotation && params.paymentCondition === 'CREDITO' ? [pair('Abono inicial', `${symbol} ${initialPayments.paid.toFixed(2)}`), pair('Saldo inicial', `${symbol} ${initialPayments.pending.toFixed(2)}`)] : []),
          ] }, layout: lines },
          ...(!quotation && params.paymentCondition === 'CREDITO' ? [{ text: 'Los abonos posteriores y el saldo actual se consultan en Créditos.', fontSize: 7, margin: [2, 5, 0, 0], color: '#475569' }] : []),
        ] },
        { width: 200, table: { widths: ['*', 27, 62], body: [
          totalRow('OP. GRAVADAS', totals.taxable), totalRow('OP. EXONERADAS', totals.exempt),
          ...(totals.unaffected > 0 ? [totalRow('OP. INAFECTAS', totals.unaffected)] : []),
          ...(totals.pending > 0 ? [totalRow('OP. POR REVISAR', totals.pending)] : []),
          totalRow('I.G.V.', totals.tax), totalRow('IMPORTE TOTAL', total, true),
        ] }, layout: lines },
      ], columnGap: 12, margin: [0, 0, 0, 17] },
      ...(accounts.length ? [
        { text: 'FORMAS DE PAGO', alignment: 'center', fontSize: 9, bold: true, margin: [0, 5, 0, 5] },
        { table: { headerRows: 1, dontBreakRows: true, widths: [88, 113, 124, '*'], body: [
          ['', 'Cuenta:', 'CCI:', 'Titular:'].map(text => ({ text, bold: true, alignment: 'center', fillColor: LIGHT_GREEN })),
          ...accounts.map(account => [{ text: `${account.bank} (${account.currency})`, bold: true }, { text: account.accountNumber }, { text: account.cci || '—' }, { text: account.holder }].map(cell => ({ ...cell, alignment: 'center', fontSize: 8 }))),
        ] }, layout: { ...lines, hLineColor: () => GREEN, vLineColor: () => GREEN } },
      ] : []),
      ...(quotation ? [
        { text: 'Sin otro particular me despido pendiente de su requerimiento.', alignment: 'center', fontSize: 8, margin: [0, 14, 0, 5] },
        { text: `Atte: ${vendor?.name ? vendor.name + ' — ' : ''}Área de Ventas${vendor?.email ? ', email: ' + vendor.email : ''}`, alignment: 'center', fontSize: 8 },
      ] : []),
      { text: quotation ? 'Cotización comercial. No constituye un comprobante de pago.' : 'Nota de venta interna. Sin validez tributaria. No sustituye el comprobante electrónico.', alignment: 'center', fontSize: 7, color: '#64748b', margin: [0, 12, 0, 0] },
    ],
  };
}
