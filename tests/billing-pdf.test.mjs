import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadTs } from './helpers/loadTs.mjs';

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('../src/modules/billing/utils/draftPdf.ts', import.meta.url));
const { buildBillingDraftDefinition } = loadTs(filename);
const pdfMake = require('pdfmake/build/pdfmake');

const document = {
  id: '000000000000000000000001', saleId: '000000000000000000000002', documentType: 'FACTURA', taxType: 'EXONERADO',
  issuer: { name: 'Agromax de prueba', documentNumber: '20100070970', address: 'Dirección de prueba' },
  receiver: { name: 'Cliente de simulación', documentType: 'RUC', documentNumber: '20600000001' },
  items: [{ description: 'Semilla exonerada – Ñandú', quantity: 2, unit: 'KG', taxAmount: 0, total: 1250.50 }],
  taxableAmount: 0, exemptAmount: 1250.50, unaffectedAmount: 0, taxAmount: 0, total: 1250.50, warnings: [],
};

test('simulation and draft PDFs render with real fonts and clearly state that they have no tax validity', async () => {
  for (const simulation of [false, true]) {
    const definition = buildBillingDraftDefinition(document, simulation);
    assert.equal(definition.watermark.text, simulation ? 'SIMULACIÓN' : 'BORRADOR');
    assert.match(definition.content[1].text, /SIN VALIDEZ TRIBUTARIA/);
    assert.match(definition.content.at(-1).text, /no ha sido enviado a SUNAT/);
    assert.ok(!JSON.stringify(definition).includes('ACEPTADO'));
    assert.ok(definition.footer(1, 1).columns[0].image.startsWith('data:image/png;base64,'));
    const bytes = await pdfMake.createPdf(definition).getBuffer();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 5000);
  }
});

test('sales, quotes and credit reports render the embedded logo without changing issuer data', async () => {
  const load = module => loadTs(fileURLToPath(new URL(`../src/modules/${module}`, import.meta.url)));
  const sale = { id: '000000000000000000000001', date: new Date().toISOString(), createdAt: new Date().toISOString(), voucherType: 'NONE', isCredit: false, total: 118, payments: [], items: [{ productId: 'product', companyId: 'issuer', productName: 'Producto de prueba', quantity: 1, unitPrice: 118, subtotal: 118, taxType: 'GRAVADO', taxRate: .18 }] };
  const company = { id: 'issuer', name: 'Empresa emisora de prueba', ruc: '20100070970' };
  const definitions = [
    load('sales/utils/salePdf.ts').buildDocDefinition({ sale, companies: [company], products: [] }),
    load('quotes/utils/quotePdf.ts').buildDocDefinition({ quote: { id: 'quote', number: 1, quoteNumber: 'COT-1', date: sale.date, total: 118, items: sale.items }, products: [], company }),
    load('credits/utils/creditsPdf.ts').buildSummaryByDate({ credits: [], clients: [] }),
    load('credits/utils/creditsPdf.ts').buildDetailed({ credits: [], clients: [] }),
  ];
  for (const definition of definitions) {
    assert.ok(definition.footer(1, 2).columns[0].image.startsWith('data:image/png;base64,'));
    const bytes = await pdfMake.createPdf(definition).getBuffer();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  }
  for (const definition of definitions.slice(0, 2)) {
    assert.ok(JSON.stringify(definition.content).includes(company.name));
    assert.ok(JSON.stringify(definition.content).includes(company.ruc));
  }
});


const { buildBillingPrintDefinition } = loadTs(fileURLToPath(new URL('../src/modules/billing/utils/documentPdf.ts', import.meta.url)));
const { billingPresentation } = loadTs(fileURLToPath(new URL('../src/modules/billing/utils/documentPresentation.ts', import.meta.url)));
const printable = {
  ...document, status: 'DRAFT', currency: 'PEN', paymentCondition: 'CONTADO', saleDate: '2026-11-16T18:00:00Z',
  items: [{ productId: 'P1', description: 'Fertilizante – producto de ejemplo', quantity: 1, unit: 'UND', unitPrice: 1, baseAmount: .85, taxAmount: .15, total: 1, taxType: 'GRAVADO', taxRate: .18 }],
  taxType: 'GRAVADO', taxableAmount: .85, exemptAmount: 0, taxAmount: .15, total: 1,
};

test('A4 and 80 mm ticket PDFs preserve the logo, one-sol totals and explicit example labels', async () => {
  for (const format of ['A4', 'TICKET']) {
    const definition = buildBillingPrintDefinition(printable, format, { example: true });
    const images = [];
    JSON.stringify(definition.content, (key, value) => { if (key === 'image') images.push(value); return value; });
    assert.ok(images.some(image => image.startsWith('data:image/png;base64,')));
    assert.ok(JSON.stringify(definition.content).includes('EJEMPLO DE FORMATO'));
    assert.ok(JSON.stringify(definition.content).includes('Sin validez tributaria'));
    assert.ok(JSON.stringify(definition.content).includes('S/ 1.00'));
    assert.ok(JSON.stringify(definition.content).includes('S/ 0.15'));
    const bytes = await pdfMake.createPdf(definition).getBuffer();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const mediaBox = bytes.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(mediaBox, 'PDF must declare physical paper size');
    assert.ok(Math.abs(Number(mediaBox[1]) - (format === 'A4' ? 595.28 : 80 * 72 / 25.4)) < .01);
    assert.ok(Number(mediaBox[2]) > 100);
  }
});

test('long receipts grow vertically and A4 can paginate without changing its width', async () => {
  const long = { ...printable, items: Array.from({ length: 36 }, (_, i) => ({ ...printable.items[0], productId: String(i), description: `Producto agrícola ${i + 1} con descripción extensa y presentación para campo` })), total: 36, taxableAmount: 30.60, taxAmount: 5.40 };
  for (const format of ['A4', 'TICKET']) {
    const bytes = await pdfMake.createPdf(buildBillingPrintDefinition(long, format)).getBuffer();
    const boxes = [...bytes.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    assert.ok(boxes.length);
    if (format === 'TICKET') { assert.equal(boxes.length, 1); assert.ok(Number(boxes[0][2]) > 1000); }
    else assert.ok(boxes.length > 1);
  }
});

test('issued previews use the emission date and preserve QR fields while examples and beta remain nonfiscal', () => {
  const issued = { ...printable, status: 'ACCEPTED', environment: 'production', series: 'FAG1', number: 1, submittedAt: '2026-11-17T04:30:00Z', hash: 'offline-digest' };
  const view = billingPresentation(issued);
  assert.equal(view.nonFiscal, false);
  assert.ok(view.qr.includes('|2026-11-16|'), 'QR date must use Lima emission time, not sale date');
  assert.ok(view.qr.endsWith('|offline-digest'));
  assert.equal(billingPresentation(issued, { example: true }).qr, undefined);
  assert.equal(billingPresentation({ ...issued, environment: 'beta' }).nonFiscal, true);
  assert.equal(billingPresentation({ ...issued, status: 'UNKNOWN' }).label, 'REQUIERE REVISIÓN');
});


const { saleNoteDocument } = loadTs(fileURLToPath(new URL('../src/modules/sales/utils/saleNoteDocument.ts', import.meta.url)));
const { recipientFormError, recipientFormFromParty, recipientParty } = loadTs(fileURLToPath(new URL('../src/modules/billing/utils/recipientForm.ts', import.meta.url)));
test('sale notes retain mixed historical taxes and remain internal in A4 and ticket', async () => {
  const sale = { id: '000000000000000000000009', date: '2026-11-17T10:00:00Z', createdAt: '2026-11-17T10:00:00Z', voucherType: 'NONE', isCredit: false, total: 3, payments: [], items: [
    { productId: 'p1', productName: 'Gravado', companyId: 'c1', quantity: 1, unitPrice: 1, subtotal: 1, unit: 'KG', taxType: 'GRAVADO', taxRate: .18 },
    { productId: 'p2', productName: 'Exonerado', companyId: 'c2', quantity: 1, unitPrice: 2, subtotal: 2, unit: 'UND', taxType: 'EXONERADO', taxRate: 0 },
  ] };
  const original = structuredClone(sale);
  const note = saleNoteDocument({ sale, companies: [{ id: 'c1', name: 'Emisor 1', ruc: '20100070970' }, { id: 'c2', name: 'Emisor 2', ruc: '20600000001' }], products: [], branchId: 'branch' });
  assert.equal(note.taxType, 'MIXTO'); assert.equal(note.taxAmount, .15); assert.equal(note.taxableAmount, .85); assert.equal(note.exemptAmount, 2); assert.equal(note.total, 3);
  assert.equal(note.issuer.documentNumber, undefined, 'Do not assign all companies to one fiscal issuer');
  assert.equal(billingPresentation(note).title, 'NOTA DE VENTA');
  assert.equal(billingPresentation({ ...note, status: 'ACCEPTED', environment: 'production', hash: 'not-fiscal', series: 'F001', number: 1 }).qr, undefined);
  for (const format of ['A4', 'TICKET']) {
    const definition = buildBillingPrintDefinition(note, format);
    assert.ok(JSON.stringify(definition).includes('Nota de venta interna'));
    const bytes = await pdfMake.createPdf(definition).getBuffer(); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  }
  assert.deepEqual(sale, original);
});
test('recipient modes allow requested DNI/RUC variants and block an oversized simple boleta', () => {
  const simple = recipientFormFromParty();
  assert.equal(recipientFormError(simple, 700), undefined);
  assert.match(recipientFormError(simple, 700.01), /700/);
  assert.equal(recipientParty(simple).documentType, 'UNIDENTIFIED');
  for (const [mode, number] of [['BOLETA_DNI', '12345678'], ['BOLETA_RUC', '10000000009'], ['FACTURA_RUC10', '10000000009'], ['FACTURA_RUC20', '20100070970']]) {
    assert.equal(recipientFormError({ mode, number, name: 'Cliente de prueba', address: '', email: '' }, 1), undefined);
  }
  assert.match(recipientFormError({ mode: 'FACTURA_RUC20', number: '10000000009', name: 'Cliente', address: '', email: '' }, 1), /20/);
});
