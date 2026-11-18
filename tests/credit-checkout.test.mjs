import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/loadTs.mjs';

const { checkoutTotal, creditCheckout } = loadTs('src/modules/pos/utils/creditCheckout.ts');

test('fractional quantities keep the same line rounding as the saved sale', () => {
  const total = checkoutTotal([{ quantity: 0.333, unitPrice: 2.99 }, { quantity: 0.333, unitPrice: 2.99 }]);
  assert.equal(total, 2);
  assert.equal(creditCheckout(total, true, '1', 'cash').pending, 1);
});

test('an optional deposit leaves only the remaining sale amount on credit', () => {
  assert.deepEqual(creditCheckout(295, true, '100', 'cash'), { payments: [{ paymentMethodId: 'cash', amount: 100 }], deposit: 100, pending: 195, error: undefined });
  assert.equal(creditCheckout(0.30, true, '0.10', 'cash').pending, 0.20);
  assert.deepEqual(creditCheckout(295, false, '100', 'cash'), { payments: [], deposit: 0, pending: 295, error: undefined });
});

test('credit checkout rejects invalid deposits and routes full payment to immediate sale', () => {
  for (const amount of ['', '0', '-1', '1.001', '295', '300', 'NaN', 'Infinity']) {
    const result = creditCheckout(295, true, amount, 'cash');
    assert.ok(result.error, amount); assert.deepEqual(result.payments, []);
  }
  assert.match(creditCheckout(295, true, '295', 'cash').error, /Pago inmediato/);
  assert.match(creditCheckout(295, true, '100', '').error, /método/);
});
