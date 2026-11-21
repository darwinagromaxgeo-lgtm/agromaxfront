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
  for (const rows of [[], [row(), row()], [row({ productId: '' })], [row({ quantity: '' })], [row({ expectedQuantity: undefined })], [row({ type: 'DECREASE', quantity: '51' })], Array.from({ length: 101 }, (_, index) => row({ productId: String(index) }))]) assert.throws(() => buildStockAdjustmentBatch('company-1', 'Conteo', rows, randomUUID()));
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

test('the modal exposes final count, sum, subtract and adding another product in the same form', () => {
  const never = () => { throw Error('Rendering must not write stock'); };
  const { StockAdjustmentModal } = loadWithMocks('../src/modules/stock/components/StockAdjustmentModal.tsx', {
    '@tanstack/react-query': { useQuery: ({ queryKey }) => ({ isSuccess: true, isFetching: false, isError: false, data: queryKey[0] === 'stock' ? { data: [{ productId: 'p1', quantity: 50 }] } : [], refetch: never }) },
    '../../../shared/components/Modal': { Modal: ({ title, children }) => React.createElement('section', null, React.createElement('h2', null, title), children) },
    '../../../shared/components/SearchableSelect': { SearchableSelect: () => React.createElement('input', { 'aria-label': 'Producto', readOnly: true }) },
    '../services/stockService': { stockService: {} }, '../services/productLotService': { productLotService: {} },
    '../hooks/useStockAdjustments': { useCreateStockAdjustmentBatch: () => ({ isPending: false, mutateAsync: never }) },
    '../utils/stockAdjustment': loadTs(fileURLToPath(new URL('../src/modules/stock/utils/stockAdjustment.ts', import.meta.url))),
  });
  const html = renderToStaticMarkup(React.createElement(StockAdjustmentModal, { companies: [{ id: 'c1', name: 'Agromax' }], products: [{ id: 'p1', name: 'Producto', unit: 'UND', isActive: true }], companyId: 'c1', productId: 'p1', branchName: 'Sausal', onClose: never }));
  for (const label of ['Establecer cantidad', 'Sumar unidades', 'Restar unidades', 'Cantidad final que tienes', 'Agregar otro producto', 'Motivo del ajuste', 'Sausal', 'Actualizar stock y revisar']) assert.ok(html.includes(label), label);
  assert.match(html, /value="SET" selected=""/); assert.match(html, /min="0"/);
  assert.match(html, /disabled=""[^>]*>Guardar 0 ajustes/);
});

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
