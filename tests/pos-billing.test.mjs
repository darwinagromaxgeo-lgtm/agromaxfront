import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Replace the API boundary before loading the helper: these tests cannot reach
// the application database or a fiscal service.
function loadCheckout(service) {
  const filename = fileURLToPath(new URL('../src/modules/pos/services/posBilling.ts', import.meta.url));
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.require = specifier => {
    assert.equal(specifier, '../../billing/services/billingService');
    return { billingService: service };
  };
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

const receiver = { documentType: 'RUC', documentNumber: '20100070970', name: 'Cliente de prueba' };
const groups = ['GRAVADO', 'EXONERADO'].map(taxType => ({ companyId: 'company', taxType, total: 1 }));
function fixture(initial = []) {
  let documents = structuredClone(initial);
  const calls = { created: 0, issued: [], queried: [], filters: [] };
  const service = {
    groups: async () => groups,
    list: async filter => { calls.filters.push(filter); return { data: structuredClone(documents), total: documents.length }; },
    create: async input => {
      calls.created++;
      const document = { ...input, id: `draft-${calls.created}`, status: 'DRAFT', receiverRevision: 2 };
      documents.push(document); return structuredClone(document);
    },
    issue: async input => {
      calls.issued.push(input);
      const document = documents.find(item => item.id === input.id);
      document.status = 'ACCEPTED'; return structuredClone(document);
    },
    checkStatus: async id => {
      calls.queried.push(id); return structuredClone(documents.find(item => item.id === id));
    },
  };
  return { service, calls, ...loadCheckout(service) };
}

test('checkout emits separate tax groups and confirms the stored receiver revision', async () => {
  const f = fixture();
  const result = await f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2);
  assert.deepEqual(result.map(document => document.taxType), ['GRAVADO', 'EXONERADO']);
  assert.ok(result.every(document => document.status === 'ACCEPTED'));
  assert.equal(f.calls.created, 2);
  assert.deepEqual(f.calls.issued.map(input => input.receiverRevision), [2, 2]);
  assert.equal(f.calls.filters[0].saleId, 'sale');
});

test('recovery reuses existing drafts and never submits accepted, pending or unknown documents again', async () => {
  for (const status of ['ACCEPTED', 'PENDING', 'UNKNOWN', 'SENDING', 'REJECTED']) {
    const first = { ...groups[0], id: 'existing', documentType: 'FACTURA', status, receiver };
    const second = { ...groups[1], id: 'remaining', documentType: 'FACTURA', status: 'DRAFT', receiver, receiverRevision: 3 };
    const f = fixture([first, second]);
    await f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2);
    assert.equal(f.calls.created, 0);
    assert.deepEqual(f.calls.issued, [{ id: 'remaining', receiverRevision: 3 }]);
    assert.deepEqual(f.calls.queried, status === 'PENDING' ? ['existing'] : []);
  }
});

test('a failed issue can continue with the same drafts without allocating another document', async () => {
  const f = fixture(); const issue = f.service.issue;
  f.service.issue = async () => { throw new Error('Transport unavailable'); };
  await assert.rejects(f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2), /Transport/);
  assert.equal(f.calls.created, 1);
  f.service.issue = issue;
  const result = await f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2);
  assert.equal(f.calls.created, 2, 'Only the remaining tax group needs a new draft');
  assert.equal(new Set(result.map(document => document.id)).size, 2);
  assert.equal(f.calls.issued.length, 2);
});

test('checkout refuses inconsistent totals or a receiver changed after confirmation', async () => {
  const f = fixture();
  await assert.rejects(f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 1), /total/);
  assert.equal(f.calls.created, 0); assert.equal(f.calls.issued.length, 0);
  const changed = fixture([{ ...groups[0], id: 'changed', status: 'DRAFT', documentType: 'FACTURA', receiver: { ...receiver, name: 'Editado en otra pantalla' } }]);
  await assert.rejects(changed.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2), /receptor/);
  assert.equal(changed.calls.issued.length, 0);
});

test('credit checkout prepares documents without sending them', async () => {
  const f = fixture();
  const result = await f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, false, 2);
  assert.equal(result.length, 2); assert.ok(result.every(document => document.status === 'DRAFT'));
  assert.equal(f.calls.issued.length, 0); assert.equal(f.calls.queried.length, 0);
});


test('checkout checks every group before creating or issuing any document', async () => {
  const f = fixture();
  f.service.groups = async () => [groups[0], { ...groups[1], billingEnabled: false, blockedProducts: ['Solo nota de venta'] }];
  await assert.rejects(f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2), /no habilitados/);
  assert.equal(f.calls.created, 0); assert.equal(f.calls.issued.length, 0);
});

test('product restrictions do not prevent retrieving already accepted documents', async () => {
  const initial = groups.map((group, index) => ({ ...group, id: String(index), documentType: 'FACTURA', status: 'ACCEPTED', receiver }));
  const f = fixture(initial);
  f.service.groups = async () => groups.map(group => ({ ...group, billingEnabled: false }));
  assert.equal((await f.emitCheckoutDocuments('sale', 'FACTURA', receiver, () => {}, true, 2)).length, 2);
  assert.equal(f.calls.created, 0); assert.equal(f.calls.issued.length, 0);
});
