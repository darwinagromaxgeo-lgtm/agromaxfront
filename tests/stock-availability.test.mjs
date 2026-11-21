import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, Module } from 'node:module';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const base = fileURLToPath(new URL('../', import.meta.url));
const delay = () => new Promise(resolve => setTimeout(resolve, 5));
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const branches = [
  { branchId: 'b1', branchCode: 'ASC', branchName: 'Ascope - Central', quantity: 0, prices: [] },
  { branchId: 'b2', branchCode: 'PAI', branchName: 'Paiján', quantity: 5, prices: [{ priceTierId: 'tier', price: 12 }] },
  { branchId: 'b3', branchCode: 'SAU', branchName: 'Sausal', quantity: 10, prices: [{ priceTierId: 'tier', price: 13 }] },
];

async function harness(t, failInitially = false) {
  const calls = [], writes = [], requests = [];
  let failBranches = failInitially;
  const auth = { user: { role: 'ADMIN', branchAssignments: [] }, selectedBranch: { id: 'b3', name: 'Sausal', companyIds: ['company'], defaultCompanyId: 'company' }, selectBranch: () => { throw Error('Consultation must not switch the active session branch'); } };
  const wrap = data => ({ data: { data } });
  const metadata = () => branches.map(({ quantity, prices, ...branch }) => ({ ...branch, isCurrent: branch.branchId === auth.selectedBranch.id }));
  const api = {
    get: async (url, options) => {
      calls.push({ url, options });
      if (url === '/companies') return wrap([{ id: 'company', name: 'AGROMAX GEO S.A.C.', ruc: '20600000001', isActive: true }]);
      if (url === '/products') return wrap({ data: [{ id: 'p1', name: 'Producto de prueba', isActive: true, unit: 'UND', prices: [] }], total: 1 });
      if (url === '/price-tiers') return wrap([{ id: 'tier', name: 'Minorista' }]);
      if (url === '/stock-requests') return wrap({ data: requests, total: requests.length });
      if (url === '/stock/branches') { if (failBranches) throw Error('Network unavailable'); return wrap(metadata()); }
      if (url === '/stock/availability/p1') return wrap({ productId: 'p1', productName: 'Producto de prueba', unit: 'UND', branches: branches.map(branch => ({ ...branch, isCurrent: branch.branchId === auth.selectedBranch.id })) });
      throw Error('Unexpected read: ' + url);
    },
    post: async (url, payload) => {
      assert.equal(url, '/stock-requests'); writes.push(structuredClone(payload));
      const request = { id: 'request', ...payload, requestingBranchId: auth.selectedBranch.id, requestingBranchName: auth.selectedBranch.name, sourceBranchName: 'Paiján', requestedBy: 'user', status: 'PENDING', items: payload.items.map(item => ({ ...item, requestedQuantity: item.quantity })) };
      requests.push(request); return wrap(request);
    },
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
        if (target === path.join(base, 'src/app/providers/AuthProvider')) return { useAuth: () => auth };
        if (target === path.join(base, 'src/shared/components/SearchableSelect')) return { SearchableSelect: ({ value, onChange, options }) => React.createElement('select', { 'aria-label': 'Producto', value, onChange: event => onChange(event.target.value) }, React.createElement('option', { value: '' }, 'Buscar producto'), ...options.map(option => React.createElement('option', { key: option.value, value: option.value }, option.label))) };
        const dependency = [target + '.ts', target + '.tsx'].find(existsSync);
        if (dependency) return load(dependency);
      }
      return originalRequire(specifier);
    };
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return loaded.exports;
  };
  const { StockRequestsPage } = load(path.join(base, 'src/modules/stock-requests/pages/StockRequestsPage.tsx'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  let tree;
  const element = () => React.createElement(QueryClientProvider, { client }, React.createElement(StockRequestsPage));
  await act(async () => { tree = TestRenderer.create(element()); await delay(); });
  const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await delay(); }); };
  await settle();
  t.after(() => { act(() => tree.unmount()); client.clear(); });
  const rows = () => tree.root.findAll(node => node.type === 'div' && node.props['data-branch-id']);
  const change = async (label, value) => { await act(async () => { tree.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }); await delay(); }); await settle(); };
  return { tree, auth, calls, writes, rows, change, settle, setBranchFailure: value => { failBranches = value; }, rerender: async () => { await act(async () => { tree.update(element()); await delay(); }); await settle(); } };
}

test('all three branches are visible before selecting a product and company is clearly separate', async t => {
  const h = await harness(t);
  assert.deepEqual(h.rows().map(row => row.props['data-branch-id']), ['b1', 'b2', 'b3']);
  assert.ok(text(h.tree.root).includes('3 sucursales disponibles'));
  const selector = h.tree.root.findByProps({ 'aria-label': 'Sucursal a consultar' });
  assert.deepEqual(selector.findAllByType('option').map(option => text(option)), ['Todas las sucursales', 'Ascope - Central', 'Paiján', 'Sausal (actual)']);
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Empresa' }).length, 0, 'A single company must not masquerade as a branch selector');
  assert.equal(h.calls.filter(call => call.url.startsWith('/stock/availability/')).length, 0);
});

test('a product shows each branch including zero stock and filtering never switches the current session', async t => {
  const h = await harness(t);
  await h.change('Producto', 'p1');
  assert.equal(h.rows().length, 3);
  assert.ok(text(h.rows()[0]).includes('Sin disponibilidad'));
  assert.ok(text(h.rows()[1]).includes('S/ 12.00'));
  assert.ok(text(h.tree.root).includes('3 de 3 sucursales'));
  await h.change('Sucursal a consultar', 'b2');
  assert.deepEqual(h.rows().map(row => row.props['data-branch-id']), ['b2']);
  assert.ok(text(h.tree.root).includes('1 de 3 sucursales'));
  assert.equal(h.auth.selectedBranch.id, 'b3');
  await h.change('Sucursal a consultar', ''); assert.equal(h.rows().length, 3);
  await h.change('Producto', ''); assert.equal(h.rows().length, 3);
  assert.ok(!text(h.tree.root).includes('S/ 12.00'));
  assert.equal(h.writes.length, 0);
});

test('a request from a filtered branch retains the original requesting branch', async t => {
  const h = await harness(t);
  await h.change('Sucursal a consultar', 'b2');
  await h.change('Producto', 'p1');
  const request = h.tree.root.findAllByType('button').find(button => text(button).includes('Solicitar'));
  act(() => request.props.onClick());
  act(() => h.tree.root.findByProps({ type: 'number' }).props.onChange({ target: { value: '2' } }));
  await act(async () => { await h.tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); await delay(); });
  assert.equal(h.writes[0].sourceBranchId, 'b2'); assert.equal(h.writes[0].items[0].quantity, 2);
  assert.equal(h.auth.selectedBranch.id, 'b3');
});

test('branch-loading failures have a retry instead of silently showing one branch', async t => {
  const h = await harness(t, true);
  assert.ok(text(h.tree.root).includes('No se pudieron cargar las sucursales'));
  h.setBranchFailure(false);
  await act(async () => { await h.tree.root.findAllByType('button').find(button => text(button) === 'Volver a intentar').props.onClick(); await delay(); });
  await h.settle(); assert.equal(h.rows().length, 3);
});

test('switching the actual session branch resets consultation filters and refreshes the current-branch marker', async t => {
  const h = await harness(t);
  await h.change('Producto', 'p1'); await h.change('Sucursal a consultar', 'b1');
  h.auth.selectedBranch = { ...h.auth.selectedBranch, id: 'b2', name: 'Paiján' };
  await h.rerender();
  assert.equal(h.tree.root.findByProps({ 'aria-label': 'Sucursal a consultar' }).props.value, '');
  assert.equal(h.rows().length, 3);
  assert.ok(text(h.rows().find(row => row.props['data-branch-id'] === 'b2')).includes('Actual'));
  assert.ok(!text(h.rows().find(row => row.props['data-branch-id'] === 'b3')).includes('Actual'));
});
