import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Module, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { MemoryRouter } = require('react-router-dom');
const base = fileURLToPath(new URL('../', import.meta.url));
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');

async function harness(t, overrides = {}, role = 'ADMIN') {
  const entry = { id: 'entry', type: 'INCOME', category: 'SALE', amount: 118, description: 'Venta de prueba', referenceId: 'sale', referenceType: 'Sale', voucherType: 'BOLETA', voucherSeries: 'BAG3', voucherNumber: '00000001', paymentMethodId: 'cash', paymentMethodName: 'Efectivo', isDeleted: false, editHistory: [], ...overrides };
  const register = { id: 'register', status: 'OPEN', date: '2026-11-23', openingBalance: 0, entries: [entry] };
  const writes = [], reads = [];
  const wrap = data => ({ data: { data } });
  const api = {
    get: async url => {
      reads.push(url);
      if (url === '/cash-registers/today') return wrap(register);
      if (url === '/payment-methods') return wrap([{ id: 'cash', name: 'Efectivo', isActive: true }]);
      if (url === '/lookup/ruc/20600000001') return wrap({ razonSocial: 'EMPRESA DE PRUEBA', direccion: 'Dirección de prueba' });
      throw Error('Unexpected read: ' + url);
    },
    patch: async (url, data) => { writes.push({ url, data }); return wrap(register); },
    post: async (url, data) => { assert.equal(url, '/cash-registers/register/entries'); writes.push({ url, data }); return wrap(register); },
  };
  const cache = new Map();
  const load = filename => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, loaded);
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = specifier => {
      if (specifier === 'react-hot-toast') return { success() {}, error() {} };
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), specifier);
        if (target === path.join(base, 'src/shared/services/api')) return { api };
        if (target === path.join(base, 'src/app/providers/AuthProvider')) return { useAuth: () => ({ user: { role }, selectedBranch: { id: 'branch', name: 'Sausal' } }) };
        if (target === path.join(base, 'src/shared/components/Modal')) return { Modal: ({ isOpen, children }) => isOpen ? React.createElement('section', {}, children) : null };
        const dependency = [target + '.ts', target + '.tsx'].find(existsSync);
        if (dependency) return load(dependency);
      }
      return originalRequire(specifier);
    };
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return loaded.exports;
  };
  const { CashRegisterPage } = load(path.join(base, 'src/modules/cash-register/pages/CashRegisterPage.tsx'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  let tree;
  const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => new Promise(resolve => setTimeout(resolve, 5))); };
  await act(async () => { tree = TestRenderer.create(React.createElement(MemoryRouter, {}, React.createElement(QueryClientProvider, { client }, React.createElement(CashRegisterPage)))); });
  await settle();
  t.after(() => { act(() => tree.unmount()); client.clear(); });
  const openEdit = async () => { await act(async () => tree.root.findAllByProps({ title: 'Editar' })[0].props.onClick()); };
  return { tree, writes, reads, settle, openEdit };
}

test('a linked sale with an identified payment has no edit action on either desktop or mobile', async t => {
  const h = await harness(t);
  assert.equal(h.tree.root.findAllByProps({ title: 'Editar' }).length, 0);
  assert.ok(text(h.tree.root).includes('BAG3-00000001'));
  assert.equal(h.writes.length, 0);
});

test('legacy linked payments can identify their method while the voucher is read-only and excluded from the request', async t => {
  const h = await harness(t, { paymentMethodId: undefined, paymentMethodName: undefined, category: 'CREDIT_PAYMENT', referenceType: 'CreditAccount' });
  await h.openEdit();
  assert.ok(text(h.tree.root.findByProps({ 'aria-label': 'Comprobante de origen' })).includes('Boleta · BAG3-00000001'));
  assert.equal(h.tree.root.findAllByType('button').filter(button => ['Ninguno', 'Boleta', 'Factura'].includes(text(button).trim())).length, 0);
  assert.ok(h.tree.root.findAllByType('input').some(input => input.props.type === 'number' && input.props.disabled));
  await act(async () => h.tree.root.findByProps({ 'aria-label': 'Método de pago del movimiento' }).props.onChange({ target: { value: 'cash' } }));
  await act(async () => h.tree.root.findByType('textarea').props.onChange({ target: { value: 'Método identificado en el archivo' } }));
  await act(async () => h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.amount, 118);
  assert.equal(h.writes[0].data.paymentMethodId, 'cash');
  for (const field of ['voucherType', 'voucherSeries', 'voucherNumber']) assert.equal(Object.hasOwn(h.writes[0].data, field), false);
});

test('legacy sales without a reference id still cannot edit their receipt', async t => {
  const h = await harness(t, { referenceId: undefined, referenceType: undefined });
  assert.equal(h.tree.root.findAllByProps({ title: 'Editar' }).length, 0);
});

test('manual expenses retain their supporting receipt editor', async t => {
  const h = await harness(t, { type: 'EXPENSE', category: 'OPERATING_EXPENSE', referenceId: undefined, referenceType: undefined, voucherType: 'NONE', voucherSeries: undefined, voucherNumber: undefined });
  await h.openEdit();
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Comprobante de origen' }).length, 0);
  assert.equal(h.tree.root.findAllByType('button').filter(button => ['Ninguno', 'Boleta', 'Factura'].includes(text(button).trim())).length, 3);
  await act(async () => h.tree.root.findAllByType('button').find(button => text(button).trim() === 'Factura').props.onClick());
  await act(async () => h.tree.root.findByProps({ placeholder: 'B001' }).props.onChange({ target: { value: 'F001' } }));
  await act(async () => h.tree.root.findByProps({ placeholder: '00000001' }).props.onChange({ target: { value: '12' } }));
  await act(async () => h.tree.root.findByType('textarea').props.onChange({ target: { value: 'Sustento del gasto verificado' } }));
  await act(async () => h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.voucherType, 'FACTURA');
  assert.equal(h.writes[0].data.voucherSeries, 'F001');
  assert.equal(h.writes[0].data.voucherNumber, '12');
});

test('sellers register income, operating expenses and withdrawals without gaining adjustment or editing actions', async t => {
  const h = await harness(t, {}, 'VENDEDOR');
  for (const action of [
    { button: 'Ingreso', type: 'INCOME', category: 'OTHER', amount: 20 },
    { button: 'Egreso', type: 'EXPENSE', category: 'OPERATING_EXPENSE', amount: 5 },
    { button: 'Egreso', type: 'EXPENSE', category: 'WITHDRAWAL', amount: 10 },
  ]) {
    await act(async () => h.tree.root.findAllByType('button').find(button => text(button).trim() === action.button).props.onClick());
    const category = h.tree.root.findByProps({ 'aria-label': 'Motivo del movimiento' });
    assert.ok(!category.findAllByType('option').some(option => ['SALE', 'CREDIT_PAYMENT', 'ADJUSTMENT', 'PURCHASE'].includes(option.props.value)));
    await act(async () => category.props.onChange({ target: { value: action.category } }));
    await act(async () => h.tree.root.findByProps({ id: 'cash-entry-description' }).props.onChange({ target: { value: 'Movimiento autorizado del vendedor' } }));
    await act(async () => h.tree.root.findByProps({ id: 'cash-entry-amount' }).props.onChange({ target: { value: String(action.amount) } }));
    const form = h.tree.root.findByType('form');
    const cash = form.findAllByType('button').find(button => text(button).trim() === 'Efectivo');
    if (cash) await act(async () => cash.props.onClick());
    await act(async () => form.props.onSubmit({ preventDefault() {} }));
    await h.settle();
    const saved = h.writes.at(-1).data;
    assert.equal(saved.type, action.type); assert.equal(saved.category, action.category); assert.equal(saved.amount, action.amount); assert.equal(saved.paymentMethodId, 'cash');
  }
  assert.equal(h.writes.length, 3);
  assert.equal(h.tree.root.findAllByProps({ title: 'Editar' }).length, 0);
  assert.ok(!h.tree.root.findAllByType('button').some(button => text(button).trim() === 'Ajuste'));
});

test('a seller can look up an expense RUC without accessing or creating suppliers', async t => {
  const h = await harness(t, {}, 'VENDEDOR');
  await act(async () => h.tree.root.findAllByType('button').find(button => text(button).trim() === 'Egreso').props.onClick());
  await act(async () => h.tree.root.findByProps({ placeholder: 'RUC (11 dígitos)' }).props.onChange({ target: { value: '20600000001' } }));
  await act(async () => h.tree.root.findByType('form').findAllByType('button').find(button => text(button).trim() === 'Buscar').props.onClick());
  await h.settle();
  assert.equal(h.tree.root.findByProps({ id: 'cash-entry-description' }).props.value, 'EMPRESA DE PRUEBA');
  assert.ok(h.reads.includes('/lookup/ruc/20600000001'));
  assert.ok(!h.reads.some(url => url.startsWith('/suppliers')));
  assert.equal(h.writes.length, 0);
});
