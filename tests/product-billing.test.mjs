import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';
import { loadTs } from './helpers/loadTs.mjs';
const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { MemoryRouter } = require('react-router-dom');
const base = fileURLToPath(new URL('../', import.meta.url));
const { parseBillingEnabled, restrictedBillingProducts } = loadTs(path.join(base, 'src/shared/utils/productBilling.ts'));
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');

test('spreadsheet eligibility accepts explicit yes/no and rejects ambiguous values', () => {
  for (const value of [undefined, '', 'SI', 'Sí', true, 'true', 1]) assert.equal(parseBillingEnabled(value), true);
  for (const value of ['NO', false, 'false', 0]) assert.equal(parseBillingEnabled(value), false);
  for (const value of ['quizás', 'habilitado', 2]) assert.throws(() => parseBillingEnabled(value), /SI o NO/);
});
test('checkout uses the latest product flag and preserves restrictions for products outside the catalog page', () => {
  const item = { productId: 'p', name: 'Producto', billingEnabled: false };
  assert.deepEqual(restrictedBillingProducts([item], []), [item]);
  assert.deepEqual(restrictedBillingProducts([item], [{ id: 'p', billingEnabled: true }]), []);
  assert.equal(restrictedBillingProducts([{ ...item, billingEnabled: true }], [{ id: 'p', billingEnabled: false }]).length, 1);
});

async function mount(t, page, restricted = false) {
  const product = { id: 'product', name: 'Producto de prueba', categoryId: 'category', unit: 'UND', taxType: 'GRAVADO', billingEnabled: !restricted, prices: [{ priceTierId: 'tier', price: 118 }], isActive: true };
  const company = { id: 'company', name: 'Empresa de prueba', ruc: '20600000001', isActive: true };
  const writes = [], errors = [];
  const wrap = data => ({ data: { data } });
  const api = { get: async route => {
    if (route === '/products') return wrap({ data: [product], total: 1 });
    if (route === '/companies') return wrap([company]);
    if (route === '/categories') return wrap([{ id: 'category', name: 'Categoría', isActive: true }]);
    if (route === '/units') return wrap([{ id: 'unit', name: 'UND', isActive: true }]);
    if (route === '/price-tiers') return wrap([{ id: 'tier', name: 'Minorista', priority: 1, isActive: true }]);
    if (route.startsWith('/stock/company/')) return wrap({ data: [{ productId: product.id, quantity: 100 }], total: 1 });
    if (route === '/payment-methods') return wrap([{ id: 'cash', name: 'Efectivo', isActive: true }]);
    if (route === '/billing/status') return wrap({ ready: true, issuerRuc: company.ruc, supportedDocumentTypes: ['BOLETA', 'FACTURA'] });
    return wrap({ data: [], total: 0 });
  } };
  for (const method of ['post', 'put', 'patch', 'delete']) api[method] = async (route, data) => { writes.push({ method, route, data }); if (route === '/products/product') Object.assign(product, data); return wrap({ ...product, ...data }); };
  const cache = new Map();
  const load = filename => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, loaded); const original = loaded.require.bind(loaded);
    loaded.require = specifier => {
      if (specifier === 'react-hot-toast') return { success() {}, error: message => errors.push(message) };
      if (specifier.endsWith('/BillingPreviewModal')) return { BillingPreviewModal: () => null };
      if (specifier === '../../sales/utils/saleNoteDocument') return { saleNoteDocument: () => ({}) };
      if (specifier.endsWith('/productBilling')) return { parseBillingEnabled, restrictedBillingProducts };
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), specifier);
        if (target === path.join(base, 'src/shared/services/api')) return { api };
        if (target === path.join(base, 'src/app/providers/AuthProvider')) return { useAuth: () => ({ user: { role: 'ADMIN' }, selectedBranch: { id: 'branch', name: 'Sausal', companyIds: ['company'], defaultCompanyId: 'company' } }) };
        if (target === path.join(base, 'src/shared/components/Modal')) return { Modal: ({ isOpen, children }) => isOpen ? React.createElement('section', {}, children) : null };
        const dependency = [target + '.ts', target + '.tsx'].find(existsSync); if (dependency) return load(dependency);
      }
      return original(specifier);
    };
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return loaded.exports;
  };
  const Component = load(path.join(base, `src/modules/${page === 'ProductsPage' ? 'products' : 'pos'}/pages/${page}.tsx`))[page];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  let tree;
  const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => new Promise(resolve => setTimeout(resolve, 5))); };
  await act(async () => { tree = TestRenderer.create(React.createElement(MemoryRouter, {}, React.createElement(QueryClientProvider, { client }, React.createElement(Component)))); });
  await settle();
  t.after(() => { act(() => tree.unmount()); client.clear(); globalThis.window = oldWindow; });
  const click = async label => { const button = tree.root.findAllByType('button').find(button => text(button).trim() === label); assert.ok(button, label); await act(async () => button.props.onClick()); await settle(); };
  return { tree, writes, errors, product, click, settle };
}

test('administrator can save a restricted product and reopen the persisted checkbox', async t => {
  const h = await mount(t, 'ProductsPage');
  await act(async () => h.tree.root.findAllByProps({ title: 'Editar' })[0].props.onClick());
  const checkbox = () => h.tree.root.findAllByType('label').find(node => text(node).includes('Habilitado para boletas y facturas')).findByType('input');
  assert.equal(checkbox().props.checked, true);
  await act(async () => checkbox().props.onChange({ target: { checked: false } }));
  await act(async () => h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} })); await h.settle();
  assert.equal(h.writes[0].data.billingEnabled, false);
  await act(async () => h.tree.root.findAllByProps({ title: 'Editar' })[0].props.onClick());
  assert.equal(checkbox().props.checked, false);
  assert.ok(text(h.tree.root).includes('Solo nota de venta'));
});

test('POS keeps restricted products selectable and disables fiscal voucher choices', async t => {
  const h = await mount(t, 'POSPage', true);
  const product = h.tree.root.findAllByType('button').find(button => text(button).includes('Producto de prueba') && text(button).includes('Stock:'));
  assert.ok(product, 'Restricted product stays available in the POS');
  await act(async () => product.props.onClick()); await h.settle();
  await h.click('Cobrar');
  const buttons = () => h.tree.root.findAllByType('button');
  assert.equal(buttons().find(button => text(button).trim() === 'Boleta').props.disabled, true);
  assert.equal(buttons().find(button => text(button).trim() === 'Factura').props.disabled, true);
  assert.equal(buttons().find(button => text(button).trim() === 'Nota de venta').props.disabled, false);
  await act(async () => buttons().find(button => text(button).trim() === 'Factura').props.onClick());
  assert.match(h.errors.at(-1), /no están habilitados/);
  assert.equal(h.writes.length, 0);
});
