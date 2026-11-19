import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import ts from 'typescript';
import { loadTs } from './helpers/loadTs.mjs';

const { voucherExportRows, saleFiscalDocuments, billingBlocksCancellation } = loadTs(fileURLToPath(new URL('../src/modules/sales/utils/saleBilling.ts', import.meta.url)));
const sale = { id: 'sale', voucherType: 'BOLETA', date: '2026-11-17T15:00:00Z', total: 2, isCredit: false, payments: [], clientId: 'client', items: [{ productId: 'product', companyId: 'company', quantity: 2, unitPrice: 1, subtotal: 2, productName: 'Producto histórico', taxType: 'GRAVADO', taxRate: .18 }] };
const document = { id: 'cpe', saleId: 'sale', documentType: 'BOLETA', taxType: 'GRAVADO', status: 'ACCEPTED', series: 'BAG1', number: 2, total: 1, taxableAmount: .85, taxAmount: .15, exemptAmount: 0, unaffectedAmount: 0, issuer: { name: 'Emisor histórico' }, receiver: { name: 'Receptor histórico', documentNumber: '12345678' }, items: [{ description: 'Producto histórico', quantity: 1 }], sunatDescription: 'Aceptado con CDR 0' };
const context = { clients: new Map([['client', { name: 'Nombre editado después' }]]), companies: new Map([['company', { name: 'Empresa editada' }]]), products: new Map([['product', { name: 'Producto editado' }]]) };

test('sales export keeps each actual fiscal number, recipient and tax group without doubling sale totals', () => {
  const exempt = { ...document, id: 'cpe-exempt', number: 3, taxType: 'EXONERADO', taxableAmount: 0, taxAmount: 0, exemptAmount: 1 };
  const rows = voucherExportRows([sale], [document, exempt], context);
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(row => row.Correlativo), [2, 3]);
  assert.ok(rows.every(row => row.Serie === 'BAG1' && row.Cliente === 'Receptor histórico' && row.Empresa === 'Emisor histórico'));
  assert.equal(rows.reduce((sum, row) => sum + row.Total, 0), sale.total);
  assert.equal(rows[0]['Estado SUNAT'], 'Aceptado por SUNAT');
  assert.equal(rows[1]['Valor Venta'], 1); assert.equal(rows[1].IGV, 0);
  assert.ok(!JSON.stringify(rows).includes('editado'));
});

test('unissued or uncertain sales never acquire an accepted status or invented fiscal number', () => {
  const [unissued] = voucherExportRows([sale], [], context);
  assert.equal(unissued.Serie, ''); assert.equal(unissued.Correlativo, ''); assert.equal(unissued['Estado SUNAT'], 'Sin emitir');
  const [uncertain] = voucherExportRows([sale], [{ ...document, status: 'UNKNOWN' }], context);
  assert.equal(uncertain['Estado SUNAT'], 'Por verificar'); assert.equal(uncertain.Correlativo, 2);
  const [draft] = voucherExportRows([sale], [{ ...document, status: 'DRAFT', series: undefined, number: undefined }], context);
  assert.equal(draft['Estado SUNAT'], 'Borrador · sin emitir'); assert.equal(draft.Correlativo, '');
});

test('cancelled receipts remain in history and do not double the replacement amount in exports',()=>{
  const cancelled={...document,cancelledByCreditNoteId:'credit-note',cancelledAt:'2026-11-19T18:00:00Z'};
  const replacement={...document,id:'replacement',number:3,replacesDocumentId:document.id};
  const rows=voucherExportRows([sale],[cancelled,replacement],context);
  assert.equal(rows.length,2);assert.equal(rows[0]['Estado SUNAT'],'Anulado por nota de crédito');assert.equal(rows[0].Total,0);assert.equal(rows[0]['Importe anulado'],document.total);
  assert.equal(rows[1].Total,document.total);assert.equal(rows.reduce((sum,row)=>sum+row.Total,0),document.total);
  assert.equal(billingBlocksCancellation([cancelled]),true,'Fiscal cancellation must not enable operational cancellation that restores stock or money');
});

test('fiscal associations stay scoped to their sale and block operational cancellation only for submitted states', () => {
  const documents = [document, { ...document, id: 'foreign', saleId: 'other' }, { ...document, id: 'discarded', status: 'DISCARDED' }];
  assert.deepEqual(saleFiscalDocuments(documents, 'sale').map(item => item.id), ['cpe']);
  for (const status of ['SENDING', 'PENDING', 'ACCEPTED', 'UNKNOWN']) assert.equal(billingBlocksCancellation([{ ...document, status }]), true);
  assert.equal(billingBlocksCancellation([{ ...document, status: 'DRAFT' }]), false);
});

test('sales billing lookup batches IDs, paginates and reuses the existing authenticated API boundary', async () => {
  const filename = fileURLToPath(new URL('../src/modules/billing/services/billingService.ts', import.meta.url));
  const calls = [];
  const loaded = new Module(filename); loaded.filename = filename;
  loaded.require = specifier => {
    assert.equal(specifier, '../../../shared/services/api');
    return { api: { get: async (route, { params }) => {
      assert.equal(route, '/billing/documents'); calls.push(params);
      const firstBatch = params.saleIds.split(',').length === 50;
      const docs = firstBatch ? params.page === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) : [{ id: '100' }] : [{ id: '101' }];
      return { data: { data: { data: docs, total: firstBatch ? 101 : 1 } } };
    } } };
  };
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  const ids = Array.from({ length: 51 }, (_, i) => String(i + 1).padStart(24, '0'));
  const result = await loaded.exports.billingService.forSales([...ids, ids[0]]);
  assert.equal(result.length, 102); assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.page), [1, 2, 1]);
  assert.equal(calls[2].saleIds, ids[50]);
});
