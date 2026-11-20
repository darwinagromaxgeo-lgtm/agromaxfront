import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Module } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { loadTs } from './helpers/loadTs.mjs';

const billing=loadTs(fileURLToPath(new URL('../src/modules/sales/utils/saleBilling.ts',import.meta.url)));
const sale={id:'sale',voucherType:'BOLETA',isCancelled:false};
const original={id:'original',saleId:'sale',documentType:'BOLETA',status:'ACCEPTED',series:'BAG3',number:4,total:30,taxType:'GRAVADO',issuer:{name:'Emisor',documentNumber:'20600000001'},receiver:{name:'Cliente',documentType:'UNIDENTIFIED'},cancelledByCreditNoteId:'accepted-note'};

test('an accepted cancellation becomes a sales note even when the open detail still holds the old voucher type',()=>{
  assert.equal(billing.saleUsesInternalNote(sale,[original]),true);
  assert.equal(billing.saleVoucherLabel(sale,[original]),'Nota de venta');
  assert.equal(billing.activeFiscalDocuments([original]).length,0);
  assert.equal(billing.saleFiscalDocuments([original],sale.id).length,1,'The original receipt remains available as history');
  assert.equal(billing.billingBlocksCancellation([original]),true,'Displaying a sales note must not enable an unintended inventory refund');
});

test('an active replacement or unresolved document keeps its fiscal label and disables the internal-note print flow',()=>{
  for(const status of ['DRAFT','SENDING','PENDING','UNKNOWN','ACCEPTED']){
    const replacement={...original,id:'replacement',cancelledByCreditNoteId:undefined,documentType:'FACTURA',status};
    assert.equal(billing.saleUsesInternalNote({...sale,voucherType:'NONE'},[original,replacement]),false,status);
    assert.equal(billing.saleVoucherLabel({...sale,voucherType:'NONE'},[original,replacement]),'Factura',status);
  }
  assert.equal(billing.saleUsesInternalNote(sale,[]),false,'An unissued boleta is not a cancellation');
  assert.equal(billing.saleUsesInternalNote({...sale,voucherType:'NONE'},[]),true);
});

function components(){
  const filename=fileURLToPath(new URL('../src/modules/sales/components/SaleBillingDocuments.tsx',import.meta.url));
  const loaded=new Module(filename);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(fileURLToPath(new URL('../src/modules/sales/components',import.meta.url)));
  const originalRequire=loaded.require.bind(loaded);
  loaded.require=specifier=>{
    if(specifier==='../utils/saleBilling')return billing;
    if(specifier==='../../billing/services/billingService')return{billingService:{download:()=>{throw Error('No network request is permitted in this test');}}};
    return originalRequire(specifier);
  };
  loaded._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
  return loaded.exports;
}

test('the visible badge and document detail show a sales note while preserving the cancelled receipt and its history',()=>{
  const {SaleBillingBadge,SaleBillingDocuments}=components();
  const badge=renderToStaticMarkup(React.createElement(SaleBillingBadge,{sale,documents:[original],loading:false,error:false}));
  assert.match(badge,/Nota de venta/);assert.match(badge,/BAG3-00000004/);assert.match(badge,/Anulado por nota de crédito/);
  const detail=renderToStaticMarkup(React.createElement(SaleBillingDocuments,{documents:[original],onPreview:()=>{}}));
  assert.match(detail,/La venta queda como nota de venta/);assert.match(detail,/BAG3-00000004/);assert.match(detail,/se conservan como historial/);
  assert.doesNotMatch(detail,/El tipo de comprobante se conserva/);
});
