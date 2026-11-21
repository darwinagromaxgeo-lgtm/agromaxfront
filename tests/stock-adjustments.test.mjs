import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadTs } from './helpers/loadTs.mjs';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const { adjustmentPreview, buildStockAdjustmentBatch } = loadTs(fileURLToPath(new URL('../src/modules/stock/utils/stockAdjustment.ts', import.meta.url)));
const row = overrides => ({ id: randomUUID(), productId: 'product-1', type: 'SET', quantity: '20', expectedQuantity: 50, lotNumber: '', expirationDate: '', ...overrides });

test('the final count sets 20 rather than adding 20; sum and subtract retain their meaning', () => {
  assert.deepEqual(adjustmentPreview(row()), { current: 50, final: 20, difference: -30, valid: true });
  assert.deepEqual(adjustmentPreview(row({ type: 'INCREASE' })), { current: 50, final: 70, difference: 20, valid: true });
  assert.deepEqual(adjustmentPreview(row({ type: 'DECREASE' })), { current: 50, final: 30, difference: -20, valid: true });
});
test('an empty input differs from a zero final count and subtraction cannot create negative stock', () => {
  assert.equal(adjustmentPreview(row({ quantity: '' })), null);
  assert.deepEqual(adjustmentPreview(row({ quantity: '0' })), { current: 50, final: 0, difference: -50, valid: true });
  assert.equal(adjustmentPreview(row({ type: 'INCREASE', quantity: '0' })), null);
  assert.equal(adjustmentPreview(row({ type: 'DECREASE', quantity: '51' })).valid, false);
  assert.equal(adjustmentPreview(row({ expectedQuantity: undefined })), null);
  for (const quantity of ['NaN', 'Infinity', '-1', '0.0000001']) assert.equal(adjustmentPreview(row({ quantity })), null);
});
test('fractional stock has no floating point residue in the preview', () => {
  assert.deepEqual(adjustmentPreview(row({ type: 'DECREASE', expectedQuantity: 0.3, quantity: '0.1' })), { current: 0.3, final: 0.2, difference: -0.1, valid: true });
});
test('one batch includes all chosen products, their starting quantities and the retry identifier', () => {
  const requestId = randomUUID();
  const result = buildStockAdjustmentBatch('company-1', ' Conteo físico ', [row(), row({ productId: 'product-2', type: 'INCREASE', quantity: '3' })], requestId);
  assert.equal(result.requestId, requestId); assert.equal(result.reason, 'Conteo físico'); assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(item => [item.productId, item.type, item.quantity, item.expectedQuantity]), [['product-1', 'SET', 20, 50], ['product-2', 'INCREASE', 3, 50]]);
});
test('invalid rows never produce a partial request', () => {
  for (const rows of [[], [row(), row()], [row({ productId: '' })], [row({ quantity: '' })], [row({ expectedQuantity: undefined })], [row({ type: 'DECREASE', quantity: '51' })], Array.from({ length: 1001 }, (_, index) => row({ productId: String(index) }))]) assert.throws(() => buildStockAdjustmentBatch('company-1', 'Conteo', rows, randomUUID()));
  assert.throws(() => buildStockAdjustmentBatch('', 'Conteo', [row()], randomUUID()));
  assert.throws(() => buildStockAdjustmentBatch('company-1', '   ', [row()], randomUUID()));
  assert.throws(() => buildStockAdjustmentBatch('company-1', 'Conteo', [row({ quantity: '50' })], randomUUID()), /ya coinciden/);
});
test('only increases include lot metadata, including a final quantity above current stock', () => {
  const data = { lotNumber: ' LOTE-1 ', expirationDate: '2027-12-01' };
  const increase = buildStockAdjustmentBatch('company-1', 'Conteo', [row({ ...data, quantity: '55' })], randomUUID());
  assert.equal(increase.items[0].lotNumber, 'LOTE-1'); assert.equal(increase.items[0].expirationDate, data.expirationDate);
  const decrease = buildStockAdjustmentBatch('company-1', 'Conteo', [row(data)], randomUUID());
  assert.equal(decrease.items[0].lotNumber, undefined); assert.equal(decrease.items[0].expirationDate, undefined);
});

function loadWithMocks(relative, mocks) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = specifier => Object.hasOwn(mocks, specifier) ? mocks[specifier] : originalRequire(specifier);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return loaded.exports;
}

test('adjustment snapshots include products after the first stock page', async () => {
  const calls = [];
  const { stockService } = loadWithMocks('../src/modules/stock/services/stockService.ts', {
    '../../../shared/services/api': { api: { get: async (url, options) => {
      calls.push({ url, ...options.params });
      const data = options.params.page === 1 ? [{ productId: 'p1', quantity: 1 }] : [{ productId: 'p2', quantity: 20 }];
      return { data: { data: { data, total: 2 } } };
    } } },
  });
  const result = await stockService.getAdjustmentSnapshot('company-1');
  assert.deepEqual(result.data.map(item => item.productId), ['p1', 'p2']); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === '/stock/company/company-1' && call.limit === 1000));
});

const { stockCountGroups, updateStockCount, stockCountSummary } = loadTs(fileURLToPath(new URL('../src/modules/stock/utils/stockCount.ts', import.meta.url)));

test('count rows leave blanks untouched, retain zero and freeze the baseline across edits', () => {
  let rows = updateStockCount([], 'p1', '20', 50);
  rows = updateStockCount(rows, 'p1', '21', 49);
  assert.equal(rows[0].expectedQuantity, 50);
  rows = updateStockCount(rows, 'p2', '0', 8);
  assert.equal(rows[1].quantity, '0'); assert.equal(rows[1].movementKind, 'COUNT');
  rows = updateStockCount(rows, 'p1', '', 49);
  assert.deepEqual(rows.map(row => row.productId), ['p2']);
  assert.deepEqual(stockCountSummary(rows), { counted: 1, changed: 1, valid: true });
  const payload = buildStockAdjustmentBatch('company-1', 'Conteo', rows, randomUUID(), true);
  assert.equal(payload.items.length, 1); assert.equal(payload.items[0].quantity, 0);
});

test('a matching physical count can be saved without inventing a stock movement', () => {
  const rows = updateStockCount([], 'p1', '50', 50);
  assert.deepEqual(stockCountSummary(rows), { counted: 1, changed: 0, valid: true });
  assert.equal(buildStockAdjustmentBatch('company-1', 'Conteo', rows, randomUUID(), true).items[0].quantity, 50);
});

test('count search groups the catalog by category and matches supplier and accents', () => {
  const products = [
    { id: 'p1', name: 'Abono Maíz', supplier: 'Marca Norte', categoryId: 'c1', isActive: true },
    { id: 'p2', name: 'Insecticida', supplier: 'Marca Sur', categoryId: 'c2', isActive: true },
    { id: 'p3', name: 'Archivado', categoryId: 'c1', isActive: false },
  ];
  const categories = [{ id: 'c1', name: 'Fertilizantes' }, { id: 'c2', name: 'Insecticidas' }];
  assert.deepEqual(stockCountGroups(products, categories, '').map(group => [group.name, group.products.length]), [['Fertilizantes', 1], ['Insecticidas', 1]]);
  assert.equal(stockCountGroups(products, categories, 'maiz norte')[0].products[0].id, 'p1');
  assert.equal(stockCountGroups(products, categories, 'insecticidas')[0].products[0].id, 'p2');
  assert.equal(stockCountGroups(products, categories, 'no existe').length, 0);
});

test('waste is a decrease with its own audit label, and a full catalog count exceeds 100 products', () => {
  const { stockMovementModes, stockAdjustmentLabel } = loadTs(fileURLToPath(new URL('../src/modules/stock/utils/stockAdjustment.ts', import.meta.url)));
  assert.equal(stockMovementModes.WASTE, 'DECREASE');
  assert.equal(stockAdjustmentLabel({ type: 'DECREASE', movementKind: 'WASTE' }), 'Merma');
  assert.equal(stockAdjustmentLabel({ type: 'DECREASE', mode: 'SET' }), 'Conteo físico');
  const rows = Array.from({ length: 101 }, (_, index) => row({ productId: 'p' + index }));
  assert.equal(buildStockAdjustmentBatch('company-1', 'Conteo', rows, randomUUID()).items.length, 101);
});
