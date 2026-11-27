import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider, useQueries } = require('@tanstack/react-query');
const filename = fileURLToPath(new URL('../src/modules/products/hooks/useProducts.ts', import.meta.url));
const delay = () => new Promise(resolve => setTimeout(resolve, 5));

test('creating a product refreshes the catalog, POS stock and Kardex before confirming success', async t => {
  let quantity = 0, exists = false, mutation, views, tree, fail = false;
  const notifications = [], reads = [];
  const productService = { create: async () => {
    if (fail) throw { response: { data: { message: ['No se pudo guardar el producto'] } } };
    exists = true; quantity = 10;
    return { id: 'new-product', name: 'PRODUCTO PRUEBA' };
  } };
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === '../services/productService') return { productService };
    if (name === '../../stock/services/productLotService') return { productLotService: {} };
    if (name === 'react-hot-toast') return { default: { success: message => notifications.push(['success', message]), error: message => notifications.push(['error', message]) } };
    return original(name);
  };
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const keys = [
    ['products', { page: 1 }], ['stock', 'company', 'sausal'], ['stock', 'company', 'adjustment-snapshot'],
    ['stock-alerts', 'company', 10], ['stock-availability', 'new-product', 'company'],
    ['kardex', { companyId: 'company' }], ['stock-movements', { companyId: 'company' }],
  ];
  function Host() {
    mutation = loaded.exports.useCreateProduct();
    views = useQueries({ queries: keys.map(queryKey => ({ queryKey, queryFn: async () => {
      reads.push(queryKey);
      return { quantity, exists };
    } })) });
    return null;
  }
  const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await delay(); }); };
  t.after(() => { act(() => tree?.unmount()); client.clear(); });
  await act(async () => { tree = TestRenderer.create(React.createElement(QueryClientProvider, { client }, React.createElement(Host))); });
  await settle();
  assert.ok(views.every(view => view.data?.quantity === 0 && !view.data.exists));
  const previousReads = reads.length;
  await act(async () => {
    const created = await mutation.mutateAsync({ name: 'PRODUCTO PRUEBA', initialStocks: [{ companyId: 'company', quantity: 10 }] });
    assert.equal(created.id, 'new-product');
  });
  await settle();
  assert.ok(views.every(view => view.data.quantity === 10 && view.data.exists), 'All open stock and catalog screens must refresh without reloading');
  assert.equal(reads.length - previousReads, keys.length);
  assert.deepEqual(notifications, [['success', 'Producto creado']]);
  fail = true;
  const beforeFailure = reads.length;
  await act(async () => { await assert.rejects(mutation.mutateAsync({ name: 'Fallido' })); });
  await settle();
  assert.equal(reads.length, beforeFailure);
  assert.ok(views.every(view => view.data.quantity === 10));
  assert.deepEqual(notifications[1], ['error', 'No se pudo guardar el producto']);
});
