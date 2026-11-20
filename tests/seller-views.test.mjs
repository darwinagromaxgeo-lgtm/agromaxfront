import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadTs } from './helpers/loadTs.mjs';

const { roleHome, canAccessView } = loadTs(fileURLToPath(new URL('../src/shared/utils/accessPolicy.ts', import.meta.url)));

test('any seller starts in POS and only accesses sales, quotations and customers', () => {
  assert.equal(roleHome('VENDEDOR'), '/pos');
  for (const path of ['/', '/pos', '/sales', '/quotes', '/clients']) assert.equal(canAccessView('VENDEDOR', path), true, path);
  for (const path of ['/dashboard', '/products', '/purchases', '/purchases/new', '/stock', '/stock-requests', '/kardex', '/cash-register', '/cash-register/history', '/credits', '/accounts-payable', '/billing', '/invoices', '/categories', '/units', '/companies', '/price-tiers', '/admin', '/users', '/branches', '/pos-administration']) assert.equal(canAccessView('VENDEDOR', path), false, path);
  assert.equal(canAccessView(undefined, '/pos'), false);
});

test('administrator navigation remains available and its home is the dashboard', () => {
  assert.equal(roleHome('ADMIN'), '/dashboard');
  for (const path of ['/dashboard', '/pos', '/cash-register', '/purchases', '/stock', '/billing', '/admin', '/users']) assert.equal(canAccessView('ADMIN', path), true, path);
});
