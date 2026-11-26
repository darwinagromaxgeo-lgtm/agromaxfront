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
const { QueryClient, QueryClientProvider, focusManager } = require('@tanstack/react-query');
const filename = fileURLToPath(new URL('../src/modules/pos/hooks/usePOSStock.ts', import.meta.url));
const delay = () => new Promise(resolve => setTimeout(resolve, 5));

test('POS refreshes stock changed in another session and keeps the cart and branch caches separate', async t => {
  let branch = 'sausal', balance = 0, result, tree;
  const reads = [];
  const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => name === '../../stock/services/stockService' ? { stockService: { getAdjustmentSnapshot: async company => { reads.push({ company, branch }); return { data: [{ productId: 'alexin', quantity: branch === 'sausal' ? balance : 2 }], total: 1 }; } } } : original(name);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  const { usePOSStock } = loaded.exports;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  function Host({ selected }) { const [cart] = React.useState([{ productId: 'retained', quantity: 2 }]); result = usePOSStock('company', selected); return React.createElement('p', null, JSON.stringify({ quantity: result.data?.data[0].quantity, cart })); }
  const render = () => React.createElement(QueryClientProvider, { client }, React.createElement(Host, { selected: branch }));
  const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await delay(); }); };
  t.after(() => { act(() => tree?.unmount()); client.clear(); focusManager.setFocused(undefined); });
  await act(async () => { tree = TestRenderer.create(render()); }); await settle();
  assert.equal(result.data.data[0].quantity, 0);
  balance = 9; await act(async () => { await result.refetch(); }); await settle();
  assert.equal(result.data.data[0].quantity, 9); assert.match(tree.toJSON().children.join(''), /retained/);
  balance = 8; const previousReads = reads.length;
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); }); await settle();
  assert.ok(reads.length > previousReads); assert.equal(result.data.data[0].quantity, 8);
  branch = 'paijan'; await act(async () => { tree.update(render()); }); await settle();
  assert.equal(result.data.data[0].quantity, 2); assert.equal(client.getQueryData(['stock', 'company', 'sausal']).data[0].quantity, 8);
  assert.match(tree.toJSON().children.join(''), /retained/);
});
