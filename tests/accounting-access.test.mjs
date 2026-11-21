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
const require=createRequire(import.meta.url);
const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const {MemoryRouter}=require('react-router-dom');
const base=fileURLToPath(new URL('../',import.meta.url));
const policy=loadTs(path.join(base,'src/shared/utils/accessPolicy.ts'));
const text=node=>typeof node==='string'||typeof node==='number'?String(node):(node?.children||[]).map(text).join('');
const id='000000000000000000000001';

test('accounting navigation includes consultation and excludes creation, editing, POS and administration',()=>{
 for(const route of ['/','/dashboard','/sales','/purchases','/purchases/'+id,'/billing','/cash-register','/cash-register/history','/credits','/credits/client/'+id,'/accounts-payable','/agreements/'+id,'/invoices','/clients','/stock','/kardex','/kardex/product/'+id]) assert.equal(policy.canAccessView('CONTABILIDAD',route),true,route);
 for(const route of ['/pos','/quotes','/products','/purchases/new','/purchases/'+id+'/edit','/stock-requests','/companies','/categories','/units','/price-tiers','/users','/branches','/admin','/billing/new']) assert.equal(policy.canAccessView('CONTABILIDAD',route),false,route);
 assert.equal(policy.roleHome('CONTABILIDAD'),'/dashboard');
 assert.equal(policy.accessRole({role:'CONTABILIDAD',branchAssignments:[{branchId:id,role:'ADMIN'}]},id),'CONTABILIDAD','A branch assignment cannot make a read-only account writable');
 assert.equal(policy.accessRole({role:'ALMACENERO',branchAssignments:[{branchId:id,role:'CONTABILIDAD'}]},id),'CONTABILIDAD');
});

async function mount(t,relative,role='CONTABILIDAD',initialRoute='/',receipt=null,cashRegister=null){
 const reads=[],writes=[],downloads=[];const auth={user:{role,branchAssignments:[{branchId:id,role}]},selectedBranch:{id,name:'Sausal',companyIds:[id],defaultCompanyId:id}};
 const wrap=data=>({data:{data}});
 const api={get:async route=>{reads.push(route);if(route==='/companies')return wrap([{id,name:'Empresa de prueba',ruc:'20600000001',isActive:true}]);if(['/categories','/units','/price-tiers','/payment-methods','/payment-agreements','/product-lots','/product-lots/expiring'].includes(route)||route.startsWith('/stock/alerts/'))return wrap([]);if(route==='/cash-registers/today')return wrap(cashRegister);if(receipt && route==='/billing/documents')return wrap({data:[receipt],total:1});if(receipt && route==='/billing/documents/'+receipt.id)return wrap(receipt);if(route==='/billing/status')return wrap({ready:true,environment:'beta',supportedDocumentTypes:['FACTURA','BOLETA'],creditNotes:{ready:true}});if(route==='/accounts-payable/alerts')return wrap({overdue:[],upcoming:[]});return wrap({data:[],total:0});}};
 for(const method of ['post','put','patch','delete'])api[method]=async(...args)=>{writes.push([method,...args]);throw Error('Unexpected mutation');};
 const cache=new Map();
 const load=filename=>{
  if(cache.has(filename))return cache.get(filename).exports;
  const loaded=new Module(filename);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(filename,loaded);const original=loaded.require.bind(loaded);
  loaded.require=specifier=>{
   if(specifier==='xlsx')return {...require('xlsx'),writeFile:(workbook,filename,options)=>downloads.push({workbook,filename,options})};
   if(specifier==='react-hot-toast')return {success(){},error(){}};
   if(/(?:draftPdf|creditsPdf|salePdf)$/.test(specifier))return new Proxy({},{get:()=>()=>{throw Error('Unexpected PDF operation during rendering');}});
   if(specifier.startsWith('.')){
    const target=path.resolve(path.dirname(filename),specifier);
    if(target===path.join(base,'src/shared/services/api'))return {api};
    if(target===path.join(base,'src/app/providers/AuthProvider'))return {useAuth:()=>auth};
    if(target===path.join(base,'src/shared/components/Modal'))return {Modal:({isOpen,children})=>isOpen?React.createElement('section',{},children):null};
    if(target===path.join(base,'src/shared/components/SearchableSelect'))return {SearchableSelect:()=>null};
    if(target.endsWith('/BillingPreviewModal'))return {BillingPreviewModal:()=>null};
    const dependency=[target+'.ts',target+'.tsx'].find(existsSync);if(dependency)return load(dependency);
   }
   return original(specifier);
  };
  loaded._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return loaded.exports;
 };
 const filename=path.join(base,'src/'+relative+'.tsx'),name=path.basename(relative);const Component=load(filename)[name];
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{retry:false,gcTime:Infinity}}});let tree;
 await act(async()=>{tree=TestRenderer.create(React.createElement(MemoryRouter,{initialEntries:[initialRoute]},React.createElement(QueryClientProvider,{client},React.createElement(Component))));});
 const settle=async()=>{for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,5));});};await settle();
 t.after(()=>{act(()=>tree.unmount());client.clear();});
 return {tree,reads,writes,downloads,settle,buttons:()=>tree.root.findAllByType('button').map(text)};
}

for(const [page,forbidden] of [
 ['stock/pages/StockPage',/Importar|Conteo|Transferir|Movimiento|Ajustar/i],
 ['clients/pages/ClientsPage',/Nuevo Cliente|Editar/i],
 ['purchases/pages/PurchasesPage',/Nueva Compra|Factura Antigua|Agregar guía/i],
 ['cash-register/pages/CashRegisterPage',/Abrir Caja|Ingreso|Egreso|Ajuste|Cerrar Caja/i],
 ['credits/pages/CreditsPage',/Registrar abono|Editar|Eliminar/i],
 ['accounts-payable/pages/AccountsPayablePage',/Nuevo Acuerdo|Crear el primero|Registrar pago/i],
 ['billing/pages/BillingPage',/Nuevo comprobante|Preparar|Enviar|Anular|Descartar/i],
])test('accounting has no write actions in '+page,async t=>{const h=await mount(t,'modules/'+page);for(const label of h.buttons())assert.doesNotMatch(label,forbidden);assert.equal(h.writes.length,0);});

test('a billing sale URL cannot start draft preparation for an accountant',async t=>{
 const h=await mount(t,'modules/billing/pages/BillingPage','CONTABILIDAD','/billing?saleId='+id);
 assert.ok(h.reads.includes('/billing/documents'),'Existing receipts remain readable');
 assert.equal(h.reads.some(route=>route.startsWith('/billing/sales/')),false,'No preparation query may run');
 assert.equal(h.writes.length,0);
 const button=h.tree.root.findAllByType('button').find(button=>text(button)===' Notas de crédito'||text(button).trim()==='Notas de crédito');
 assert.ok(button);await act(async()=>button.props.onClick());await h.settle();
 for(const label of h.buttons())assert.doesNotMatch(label,/Nueva nota|Confirmar anulación|Volver a emitir/);
 assert.ok(h.reads.includes('/billing/credit-notes'));
});

test('administrators keep the create customer action',async t=>{const h=await mount(t,'modules/clients/pages/ClientsPage','ADMIN');assert.ok(h.buttons().some(label=>label.includes('Nuevo Cliente')));});

for(const status of ['DRAFT','ACCEPTED','PENDING'])test('accounting receipt detail keeps files and blocks operations for '+status,async t=>{
 const receipt={id,branchId:id,saleId:id,documentType:'BOLETA',taxType:'GRAVADO',status,series:'B001',number:1,issuer:{name:'Emisor',documentNumber:'20600000001'},receiver:{name:'Cliente',documentType:'UNIDENTIFIED'},items:[],warnings:[],taxableAmount:29.66,exemptAmount:0,unaffectedAmount:0,taxAmount:5.34,total:35,hasPdf:true,hasXml:true,hasCdr:status==='ACCEPTED',paymentCondition:'CONTADO'};
 const h=await mount(t,'modules/billing/pages/BillingPage','CONTABILIDAD','/billing?documentId='+id,receipt);
 assert.ok(text(h.tree.root).includes('B001-00000001'));
 for(const label of h.buttons())assert.doesNotMatch(label,/Preparar|Enviar|Anular|Descartar|Simular|Consultar estado SUNAT/);
 assert.ok(h.buttons().some(label=>label.trim()==='PDF'));assert.ok(h.buttons().some(label=>label.trim()==='XML'));
 if(status==='ACCEPTED')assert.ok(h.buttons().some(label=>label.trim()==='CDR'));
 assert.equal(h.writes.length,0);
});


test('an accountant downloads filtered cash movements as Excel without changing the register',async t=>{
 const movement=(id,description,amount,overrides={})=>({id,description,amount,type:'INCOME',category:'SALE',paymentMethodName:'Yape',voucherType:'NONE',isDeleted:false,editHistory:[],...overrides});
 const register={id,date:'2026-11-21',openingBalance:100,status:'OPEN',entries:[movement('a','Cobro de maíz',12.75),movement('b','Otro ingreso',20),movement('c','Cobro anulado',1000,{isDeleted:true})]};
 const h=await mount(t,'modules/cash-register/pages/CashRegisterPage','CONTABILIDAD','/cash-register',null,register);
 const search=h.tree.root.findByProps({placeholder:'Producto, descripción, referencia…'});
 await act(async()=>search.props.onChange({target:{value:'maíz'}}));
 const button=h.tree.root.findAllByType('button').find(button=>text(button).trim()==='Descargar Excel');
 assert.ok(button);assert.equal(button.props.disabled,false);
 await act(async()=>button.props.onClick());
 assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].filename,'Caja-2026-11-21.xlsx');
 const XLSX=require('xlsx'),bytes=XLSX.write(h.downloads[0].workbook,{type:'buffer',bookType:h.downloads[0].options.bookType});
 const workbook=XLSX.read(bytes,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(workbook.Sheets.Movimientos);
 assert.equal(rows.length,1);assert.equal(rows[0]['Descripción'],'Cobro de maíz');assert.equal(rows[0]['Monto S/'],12.75);
 for(const label of h.buttons())assert.doesNotMatch(label,/Abrir Caja|Ingreso|Egreso|Ajuste|Cerrar Caja/);
 assert.equal(h.writes.length,0);assert.equal(register.entries.length,3);
});
