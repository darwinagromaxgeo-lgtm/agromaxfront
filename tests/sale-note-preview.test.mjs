import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Module, createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { loadTs } from './helpers/loadTs.mjs';
const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake/build/pdfmake');
const base = fileURLToPath(new URL('../', import.meta.url));
const { saleNoteDocument } = loadTs(path.join(base, 'src/modules/sales/utils/saleNoteDocument.ts'));
const { buildBillingPrintDefinition } = loadTs(path.join(base, 'src/modules/billing/utils/documentPdf.ts'));
const cache = new Map();
function component(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, loaded);
  const original = loaded.require.bind(loaded);
  loaded.require = specifier => {
    if (specifier.endsWith('.css')) return {};
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), specifier);
      const dependency = [target+'.ts', target+'.tsx'].find(existsSync);
      if (dependency) return component(dependency);
    }
    return original(specifier);
  };
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return loaded.exports;
}
const { BillingDocumentPaper } = component(path.join(base, 'src/modules/billing/components/BillingDocumentPaper.tsx'));
const sale = {id:'sale',noteSeries:'NV03',noteNumber:71,voucherType:'NONE',date:'2026-11-21T17:00:00Z',createdAt:'2026-11-21T17:00:00Z',isCredit:true,total:118,payments:[{paymentMethodName:'Efectivo',amount:20},{paymentMethodName:'Yape',amount:10}],items:[{productId:'product',productName:'Producto de prueba',companyId:'issuer',quantity:1,unit:'UND',unitPrice:118,subtotal:118,taxType:'GRAVADO',taxRate:.18}]};
const company = {id:'issuer',name:'AGROMAX DE PRUEBA',ruc:'20600000001',bankAccounts:[{bank:'Banco configurado',currency:'PEN',accountNumber:'001234567',holder:'Emisor de prueba',isActive:true},{bank:'Banco inactivo',currency:'PEN',accountNumber:'999999999',holder:'No mostrar',isActive:false}]};
const note = () => saleNoteDocument({sale,companies:[company],client:{name:'Cliente de prueba',documentNumber:'12345678'},products:[],branchId:'branch'});

test('commercial A4 preview and real PDF retain the same internal reference, client, taxes, initial payments and configured accounts', async () => {
  const before=structuredClone(sale),document=note();
  const html=renderToStaticMarkup(React.createElement(BillingDocumentPaper,{document,format:'A4'}));
  const definition=buildBillingPrintDefinition(document,'A4'),json=JSON.stringify(definition);
  for (const text of ['NOTA DE VENTA','NV03-00000071','Cliente de prueba','12345678','Producto de prueba','118.00','100.00','18.00','Abono inicial','30.00','Saldo inicial','88.00','Banco configurado','001234567','Los abonos posteriores y el saldo actual se consultan en Créditos.']) {
    assert.ok(html.includes(text), 'preview: '+text); assert.ok(json.includes(text), 'PDF: '+text);
  }
  assert.ok(html.includes('sale-note-paper'));assert.ok(!html.includes('Banco inactivo'));assert.ok(!json.includes('Banco inactivo'));
  assert.ok(!html.includes('ACEPTADO POR SUNAT'));assert.ok(!json.includes('"qr"'));
  assert.equal((await pdfMake.createPdf(definition).getBuffer()).subarray(0,5).toString(),'%PDF-');
  assert.deepEqual(sale,before);
});

test('ticket notes retain readable thermal text and display initial payments without claiming current credit balances', async () => {
  const document=note(),html=renderToStaticMarkup(React.createElement(BillingDocumentPaper,{document,format:'TICKET'}));
  const definition=buildBillingPrintDefinition(document,'TICKET');
  for(const text of ['Abono inicial','Saldo inicial','30.00','88.00']){assert.ok(html.includes(text));assert.ok(JSON.stringify(definition).includes(text));}
  const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;if(node.text!==undefined){assert.equal(node.color,'#000000');assert.equal(node.bold,true);if(typeof node.fontSize==='number')assert.ok(node.fontSize>=9);}Object.values(node).forEach(visit);};visit(definition.content);
  assert.equal((await pdfMake.createPdf(definition).getBuffer()).subarray(0,5).toString(),'%PDF-');
});

test('cancelled sale notes remain visibly cancelled in both A4 representations and never change their numbering',()=>{
  const document={...note(),status:'DISCARDED'};
  const html=renderToStaticMarkup(React.createElement(BillingDocumentPaper,{document,format:'A4'}));
  const json=JSON.stringify(buildBillingPrintDefinition(document,'A4'));
  assert.ok(html.includes('VENTA ANULADA'));assert.ok(json.includes('VENTA ANULADA'));
  assert.ok(html.includes('NV03-00000071'));assert.ok(json.includes('NV03-00000071'));
});

test('fractional quantities remain exact in the preview and commercial PDF',()=>{
  const document=note();document.items=[{...document.items[0],quantity:.125,unit:'KG'}];
  const html=renderToStaticMarkup(React.createElement(BillingDocumentPaper,{document,format:'A4'}));
  const json=JSON.stringify(buildBillingPrintDefinition(document,'A4'));
  assert.ok(html.includes('0.125'));assert.ok(json.includes('0.125'));assert.ok(!json.includes('"text":"0.13"'));
});
