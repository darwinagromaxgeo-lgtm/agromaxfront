import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Module } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import { loadTs } from './helpers/loadTs.mjs';

const summary = loadTs(fileURLToPath(new URL('../src/modules/cash-register/utils/cashSummary.ts', import.meta.url)));
const movements = loadTs(fileURLToPath(new URL('../src/modules/cash-register/utils/cashMovements.ts', import.meta.url)));
const { groupEntries } = loadTs(fileURLToPath(new URL('../src/modules/cash-register/utils/groupEntries.ts', import.meta.url)));
const entry = (id, amount, method, overrides = {}) => ({ id, amount, paymentMethodName: method, type: 'INCOME', description: 'Movimiento', category: 'SALE', voucherType: 'NONE', isDeleted: false, editHistory: [], ...overrides });

test('physical cash includes the opening and cash movements while digital receipts and outstanding debt stay separate', () => {
  const entries = [entry('1', 68, 'Efectivo'), entry('2', 50, 'Yape'), entry('3', 10, 'Yape', { category: 'CREDIT_PAYMENT' }), entry('4', 20, 'Efectivo', { type: 'EXPENSE' }), entry('5', 40, 'Transferencia', { category: 'CAPITAL_CONTRIBUTION' }), entry('6', 500, 'Efectivo', { isDeleted: true })];
  const result = summary.summarizeCash(100, entries);
  assert.equal(result.expectedCash, 148); assert.equal(result.balance, 248);
  assert.deepEqual(result.sources, { sales: 118, creditPayments: 10, otherIncome: 40 });
  assert.deepEqual(result.methods.map(m => [m.name, m.net]), [['Efectivo', 48], ['Transferencia', 40], ['Yape', 60]]);
});

test('legacy descriptions are readable, missing methods are explicit and structured methods take precedence', () => {
  const result = summary.summarizeCash(0, [entry('1', 0.1, undefined, { description: 'Antiguo [ Efectivo ]' }), entry('2', 0.2, ' EFÉCTIVO '), entry('3', 7, undefined), entry('4', 50, 'Yape', { description: 'Dato viejo [Efectivo]' })]);
  assert.equal(result.expectedCash, 0.3); assert.equal(result.income, 57.3); assert.equal(result.unclassifiedCount, 1);
  assert.equal(result.methods.find(m => m.name === 'Sin identificar').net, 7);
  assert.equal(summary.entryPaymentMethod(entry('5', 1, undefined, { description: 'Producto [muestra] descripción' })), '');
});

test('filtering exposes the source and the method without changing the complete cash summary', () => {
  const entries = [entry('1', 100, 'Yape', { referenceId: 'venta-abc', description: 'Semilla arroz' }), entry('2', 25, 'Efectivo', { isDeleted: true }), entry('3', 10, undefined, { category: 'OTHER' })];
  const filters = { search: '', type: '', category: '', method: '', showDeleted: false };
  assert.equal(movements.filterCashEntries(entries, filters).length, 2);
  assert.deepEqual(movements.filterCashEntries(entries, { ...filters, search: 'VENTA-ABC', method: 'yape' }).map(e => e.id), ['1']);
  assert.deepEqual(movements.filterCashEntries(entries, { ...filters, method: '__unknown' }).map(e => e.id), ['3']);
  assert.equal(movements.filterCashEntries(entries, { ...filters, showDeleted: true }).length, 3);
  assert.equal(summary.summarizeCash(0, entries).income, 110);
});

test('group totals use visible movements, retain chronological order and separate cancelled entries', () => {
  const entries = [entry('first', 5, 'Efectivo'), entry('a', 10, 'Yape', { paymentGroupId: 'g', paymentGroupTotal: 100 }), entry('middle', 2, 'Efectivo'), entry('b', 15, 'Yape', { paymentGroupId: 'g', paymentGroupTotal: 100 }), entry('deleted', 75, 'Yape', { paymentGroupId: 'g', isDeleted: true })];
  const groups = groupEntries(entries);
  assert.deepEqual(groups.map(g => g.entries[0].id), ['first', 'a', 'middle', 'deleted']);
  assert.equal(groups[1].total, 25); assert.equal(groups[3].total, 75);
  assert.equal(groupEntries(entries.filter(e => e.id === 'a'))[0].total, 10);
});

test('Excel exports only selected movements with numeric amounts and literal text', () => {
  const entries = [
    entry('1', 12.75, 'Yape', { description: '=HYPERLINK("unsafe")', referenceId: 'sale-1', voucherSeries: 'BAG3', voucherNumber: '00000032', createdAt: '2026-11-21T01:30:00Z' }),
    entry('2', 0, 'Efectivo', { description: 'Maíz orgánico', isDeleted: true }),
    entry('3', 50, 'Yape', { type: 'EXPENSE' }),
  ];
  const filters = { search: '', type: 'INCOME', category: '', method: '', showDeleted: true };
  const bytes = XLSX.write(movements.movementsWorkbook(movements.filterCashEntries(entries, filters)), { type: 'buffer', bookType: 'xlsx' });
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'The output must be an XLSX archive');
  const workbook = XLSX.read(bytes, { type: 'buffer', cellNF: true });
  assert.deepEqual(workbook.SheetNames, ['Movimientos']);
  const sheet = workbook.Sheets.Movimientos;
  const rows = XLSX.utils.sheet_to_json(sheet);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Monto S/'], 12.75); assert.equal(sheet.F2.t, 'n'); assert.equal(sheet.F2.z, '#,##0.00');
  assert.equal(rows[1]['Monto S/'], 0); assert.equal(rows[1].Estado, 'Anulado');
  assert.equal(rows[0]['Descripción'], '=HYPERLINK("unsafe")'); assert.equal(sheet.D2.t, 's'); assert.equal(sheet.D2.f, undefined);
  assert.equal(rows[1]['Descripción'], 'Maíz orgánico');
  assert.equal(rows[0].Comprobante, 'BAG3-00000032');
  assert.equal(rows[0]['Fecha y hora (Lima)'], new Date(entries[0].createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }));
  assert.deepEqual(sheet['!autofilter'], { ref: 'A1:I3' });
});

const componentCache = new Map();
function loadComponent(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  if (componentCache.has(filename)) return componentCache.get(filename);
  const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = specifier => specifier === '../utils/cashSummary' ? summary : specifier === './CashOverview' ? loadComponent('../src/modules/cash-register/components/CashOverview.tsx') : originalRequire(specifier);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  componentCache.set(filename, loaded.exports); return loaded.exports;
}

test('the visible overview shows physical money, its source and separately labelled digital receipts', () => {
  const { CashOverview } = loadComponent('../src/modules/cash-register/components/CashOverview.tsx');
  const html = renderToStaticMarkup(React.createElement(CashOverview, { register: { openingBalance: 100, status: 'OPEN', entries: [entry('1', 50, 'Yape'), entry('2', 20, 'Efectivo', { category: 'CREDIT_PAYMENT' })] } }));
  for (const label of ['Efectivo esperado', 'Saldo general', 'Cobros de ventas', 'Abonos de créditos', 'Yape', '120.00', '170.00']) assert.ok(html.includes(label), label);
});

test('historic closures without a physical count remain identified and a new count displays its actual difference', () => {
  const { CashCountResult } = loadComponent('../src/modules/cash-register/components/CashOverview.tsx');
  const old = renderToStaticMarkup(React.createElement(CashCountResult, { register: { status: 'CLOSED' } }));
  assert.match(old, /sin arqueo de efectivo registrado/); assert.doesNotMatch(old, /Sin diferencia/);
  const current = renderToStaticMarkup(React.createElement(CashCountResult, { register: { status: 'CLOSED', cashCount: { expectedAmount: 100, countedAmount: 90, difference: -10 } } }));
  assert.match(current, /Faltante/); assert.match(current, /90.00/); assert.match(current, /10.00/);
});

test('the close form requires a real count instead of pre-filling the expected balance', () => {
  const { CashCloseForm } = loadComponent('../src/modules/cash-register/components/CashCloseForm.tsx');
  const html = renderToStaticMarkup(React.createElement(CashCloseForm, { register: { status: 'OPEN', openingBalance: 100, entries: [] }, pending: false, onSubmit: () => { throw Error('No mutation during rendering'); } }));
  assert.match(html, /Efectivo contado/); assert.match(html, /id="cash-counted"[^>]*value=""/); assert.match(html, /disabled=""/);
  assert.match(html, /Yape, tarjetas y transferencias/);
});
