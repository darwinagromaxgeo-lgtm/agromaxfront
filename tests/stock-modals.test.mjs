import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, Module } from 'node:module';
import { randomUUID } from 'node:crypto';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const base = fileURLToPath(new URL('../', import.meta.url));
const delay = () => new Promise(resolve => setTimeout(resolve, 5));
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const products = [
  { id: 'p1', name: 'Abono Maíz', supplier: 'Proveedor Norte', categoryId: 'c1', unit: 'UND', isActive: true },
  { id: 'p2', name: 'Insecticida', supplier: 'Proveedor Sur', categoryId: 'c2', unit: 'L', isActive: true },
  { id: 'p3', name: 'Producto sin contar', categoryId: 'c1', unit: 'UND', isActive: true },
];
const categories = [{ id: 'c1', name: 'Fertilizantes' }, { id: 'c2', name: 'Insecticidas' }];

function loader(api) {
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
        const dependency = [target + '.ts', target + '.tsx'].find(existsSync);
        if (dependency) return load(dependency);
      }
      return originalRequire(specifier);
    };
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return loaded.exports;
  };
  return load;
}

async function harness(t, componentName, extra = {}) {
  const stock = new Map([['p1', 60], ['p2', 8], ['p3', 4]]);
  const writes = [], reads = [], saved = new Map();
  let closes = 0, failAfterCommit = false;
  const api = {
    get: async url => {
      reads.push(url);
      if (url.startsWith('/stock/company/')) return { data: { data: { data: [...stock].map(([productId, quantity]) => ({ productId, quantity })), total: stock.size } } };
      if (url === '/product-lots') return { data: { data: [] } };
      throw Error('Unexpected read: ' + url);
    },
    post: async (url, payload) => {
      assert.equal(url, '/stock-adjustments/batch');
      writes.push(structuredClone(payload));
      if (saved.has(payload.requestId)) return saved.get(payload.requestId);
      for (const item of payload.items) if (stock.get(item.productId) !== item.expectedQuantity) throw { response: { status: 409, data: { message: 'El stock cambió. Revisa las cantidades.' } } };
      const adjustments = [], unchangedProductIds = [];
      for (const item of payload.items) {
        const before = stock.get(item.productId);
        const after = item.type === 'SET' ? item.quantity : before + (item.type === 'INCREASE' ? item.quantity : -item.quantity);
        if (after === before) unchangedProductIds.push(item.productId);
        else { stock.set(item.productId, after); adjustments.push({ id: randomUUID(), previousQuantity: before, newQuantity: after, ...item }); }
      }
      const response = { data: { data: { requestId: payload.requestId, adjustments, unchangedProductIds } } };
      saved.set(payload.requestId, response);
      if (failAfterCommit) { failAfterCommit = false; throw Error('Conexión interrumpida'); }
      return response;
    },
  };
  const component = loader(api)(path.join(base, `src/modules/stock/components/${componentName}.tsx`))[componentName];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  let tree;
  await act(async () => { tree = TestRenderer.create(React.createElement(QueryClientProvider, { client }, React.createElement(component, { companies: [{ id: 'company-1', name: 'Agromax' }], products, categories, companyId: 'company-1', branchName: 'Sausal', onClose: () => closes++, ...extra }))); await delay(); });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (tree.root.findAllByType('input').some(input => input.props.type === 'number' && !input.props.disabled)) break;
    await act(async () => { await delay(); });
  }
  await act(async () => { await delay(); });
  t.after(() => { act(() => tree.unmount()); client.clear(); });
  const change = (input, value) => act(() => input.props.onChange({ target: { value } }));
  const button = label => tree.root.findAllByType('button').find(node => text(node) === label);
  const submit = async () => { await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); await delay(); }); };
  return { tree, stock, writes, reads, change, button, submit, closes: () => closes, failNextResponse: () => { failAfterCommit = true; } };
}

test('the count table keeps hidden values, saves only entered products and refreshes cached inventory', async t => {
  const h = await harness(t, 'StockCountModal');
  assert.equal(h.button('Guardar conteo').props.disabled, true);
  h.change(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }), '0');
  h.change(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Insecticida' }), '20');
  h.change(h.tree.root.findByProps({ 'aria-label': 'Buscar productos del conteo' }), 'Sur');
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }).length, 0);
  assert.ok(text(h.tree.root).includes('2 de 3 artículos contados'));
  const readsBefore = h.reads.length;
  await h.submit();
  assert.deepEqual(h.writes[0].items.map(item => [item.productId, item.quantity, item.type, item.movementKind]), [['p1', 0, 'SET', 'COUNT'], ['p2', 20, 'SET', 'COUNT']]);
  assert.equal(h.stock.get('p1'), 0); assert.equal(h.stock.get('p2'), 20); assert.equal(h.stock.get('p3'), 4);
  assert.ok(h.reads.length > readsBefore, 'A saved count must refetch the visible inventory');
  assert.equal(h.closes(), 1);
});

test('folding a category retains its typed quantities and a matching count can be saved', async t => {
  const h = await harness(t, 'StockCountModal');
  h.change(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }), '60');
  const category = () => h.tree.root.findAllByType('button').find(node => text(node).includes('Fertilizantes'));
  act(() => category().props.onClick());
  assert.equal(h.tree.root.findAllByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }).length, 0);
  act(() => category().props.onClick());
  assert.equal(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }).props.value, '60');
  assert.equal(h.button('Guardar conteo').props.disabled, false);
  await h.submit();
  assert.equal(h.stock.get('p1'), 60); assert.equal(h.writes[0].items.length, 1); assert.equal(h.closes(), 1);
});

test('waste is saved as a decrease with its own kind and updated resulting stock', async t => {
  const h = await harness(t, 'StockMovementModal', { productId: 'p1' });
  for (const label of ['Entrada', 'Salida', 'Merma', 'Conteo físico']) assert.ok(h.button(label));
  act(() => h.button('Merma').props.onClick());
  h.change(h.tree.root.findByProps({ id: 'stock-movement-quantity' }), '5');
  act(() => h.button('Producto vencido').props.onClick());
  assert.ok(text(h.tree.root).includes('55'));
  await h.submit();
  assert.deepEqual([h.writes[0].items[0].type, h.writes[0].items[0].movementKind, h.writes[0].items[0].quantity], ['DECREASE', 'WASTE', 5]);
  assert.equal(h.stock.get('p1'), 55); assert.equal(h.closes(), 1);
});

test('the individual physical count accepts zero and sets stock absolutely', async t => {
  const h = await harness(t, 'StockMovementModal', { productId: 'p1' });
  act(() => h.button('Conteo físico').props.onClick());
  h.change(h.tree.root.findByProps({ id: 'stock-movement-quantity' }), '0');
  act(() => h.button('Conteo de inventario').props.onClick());
  assert.equal(h.tree.root.findByProps({ id: 'stock-movement-quantity' }).props.min, 0);
  assert.equal(h.button('Guardar conteo').props.disabled, false);
  await h.submit(); assert.equal(h.stock.get('p1'), 0); assert.equal(h.writes[0].items[0].type, 'SET');
});

test('a stale count stays open with its values and requires refreshing before saving', async t => {
  const h = await harness(t, 'StockCountModal');
  h.change(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }), '20');
  h.stock.set('p1', 59);
  await h.submit();
  assert.equal(h.closes(), 0); assert.equal(h.stock.get('p1'), 59); assert.equal(h.button('Guardar conteo').props.disabled, true);
  assert.equal(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }).props.value, '20');
  h.change(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }), '19');
  assert.ok(text(h.tree.root).includes('El stock cambió'));
  assert.equal(h.button('Guardar conteo').props.disabled, true);
  await act(async () => { await h.button('Actualizar stock y revisar').props.onClick(); await delay(); });
  assert.equal(h.button('Guardar conteo').props.disabled, false);
  await h.submit(); assert.equal(h.writes[1].items[0].expectedQuantity, 59); assert.equal(h.stock.get('p1'), 19); assert.equal(h.closes(), 1);
});

test('retrying a lost response reuses the request id and cannot add the movement twice', async t => {
  const h = await harness(t, 'StockMovementModal', { productId: 'p1' });
  h.change(h.tree.root.findByProps({ id: 'stock-movement-quantity' }), '3');
  act(() => h.button('Ingreso manual').props.onClick());
  h.failNextResponse(); await h.submit(); assert.equal(h.stock.get('p1'), 63); assert.equal(h.closes(), 0);
  await h.submit(); assert.equal(h.stock.get('p1'), 63); assert.equal(h.closes(), 1);
  assert.equal(h.writes[0].requestId, h.writes[1].requestId);
});

test('cancelling a count never writes inventory', async t => {
  const h = await harness(t, 'StockCountModal');
  h.change(h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }), '20');
  act(() => h.button('Cancelar').props.onClick());
  assert.equal(h.writes.length, 0); assert.equal(h.stock.get('p1'), 60); assert.equal(h.closes(), 1);
});

test('Enter navigates quantity inputs and cannot accidentally save while searching or counting', async t => {
  const h = await harness(t, 'StockCountModal');
  let prevented = 0, focused = 0;
  const first = {}, second = { focus: () => focused++ };
  first.form = { querySelectorAll: () => [first, second] };
  h.tree.root.findByProps({ 'aria-label': 'Stock físico final de Abono Maíz' }).props.onKeyDown({ key: 'Enter', preventDefault: () => prevented++, currentTarget: first });
  h.tree.root.findByProps({ 'aria-label': 'Buscar productos del conteo' }).props.onKeyDown({ key: 'Enter', preventDefault: () => prevented++ });
  assert.equal(prevented, 2); assert.equal(focused, 1); assert.equal(h.writes.length, 0);
});
