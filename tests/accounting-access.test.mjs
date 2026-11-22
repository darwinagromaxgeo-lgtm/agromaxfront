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
const {MemoryRouter,Routes,Route}=require('react-router-dom');
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

async function mount(t,relative,role='CONTABILIDAD',initialRoute='/',receipt=null,cashRegister=null,credits=[]){
 const reads=[],writes=[],downloads=[];const auth={user:{role,branchAssignments:[{branchId:id,role}]},selectedBranch:{id,name:'Sausal',companyIds:[id],defaultCompanyId:id}};
 const wrap=data=>({data:{data}});
 const api={get:async route=>{reads.push(route);if(route==='/clients'&&credits.length)return wrap({data:[{id,name:'Cliente con crédito',isActive:true}],total:1});if(route==='/credits'||route==='/credits/client/'+id)return wrap({data:credits,total:credits.length});if(route==='/credits/'+id)return wrap(credits.find(credit=>credit.id===id));if(route==='/companies')return wrap([{id,name:'Empresa de prueba',ruc:'20600000001',isActive:true}]);if(['/categories','/units','/price-tiers','/payment-methods','/payment-agreements','/product-lots','/product-lots/expiring'].includes(route)||route.startsWith('/stock/alerts/'))return wrap([]);if(route==='/cash-registers/today')return wrap(cashRegister);if(route==='/cash-registers')return wrap({data:cashRegister?[cashRegister]:[],total:cashRegister?1:0});if(route==='/cash-registers/'+id)return wrap(cashRegister);if(receipt && route==='/billing/documents')return wrap({data:[receipt],total:1});if(receipt && route==='/billing/documents/'+receipt.id)return wrap(receipt);if(route==='/billing/status')return wrap({ready:true,environment:'beta',supportedDocumentTypes:['FACTURA','BOLETA'],creditNotes:{ready:true}});if(route==='/accounts-payable/alerts')return wrap({overdue:[],upcoming:[]});return wrap({data:[],total:0});}};
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
 await act(async()=>{tree=TestRenderer.create(React.createElement(MemoryRouter,{initialEntries:[initialRoute]},React.createElement(QueryClientProvider,{client},name==='ClientCreditDetailPage'?React.createElement(Routes,{},React.createElement(Route,{path:'/credits/client/:clientId',element:React.createElement(Component)})):React.createElement(Component))));});
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

test('sellers can open cash and reconcile without editing, deleting or adjusting movements',async t=>{
 const empty=await mount(t,'modules/cash-register/pages/CashRegisterPage','VENDEDOR');
 assert.ok(empty.buttons().some(label=>label.includes('Abrir Caja')));
 const register={id,date:'2026-11-21',openingBalance:100,status:'OPEN',revision:3,entries:[{id:'a',description:'Venta en efectivo',amount:50,type:'INCOME',category:'SALE',paymentMethodName:'Efectivo',voucherType:'NONE',isDeleted:false,editHistory:[]},{id:'b',description:'Venta por Yape',amount:12,type:'INCOME',category:'SALE',paymentMethodName:'Yape',voucherType:'NONE',isDeleted:false,editHistory:[]}]};
 const h=await mount(t,'modules/cash-register/pages/CashRegisterPage','VENDEDOR','/',null,register);
 assert.ok(h.reads.includes('/cash-registers/today'));
 for(const label of h.buttons())assert.doesNotMatch(label,/^(?:\+?\s*)?(?:Ingreso|Egreso|Ajuste|Editar|Anular movimiento manual)$/);
 assert.equal(h.tree.root.findAllByType('button').some(button=>['Editar','Anular movimiento manual'].includes(button.props.title)),false);
 const close=h.tree.root.findAllByType('button').find(button=>text(button).includes('Cerrar Caja'));assert.ok(close);
 await act(async()=>close.props.onClick());
 const counted=h.tree.root.findByProps({id:'cash-counted'});
 await act(async()=>counted.props.onChange({target:{value:'149'}}));
 assert.ok(text(h.tree.root).includes('Faltante: S/ 1.00'));
 let confirm=h.tree.root.findAllByType('button').find(button=>text(button).includes('Confirmar cierre con arqueo'));
 assert.equal(confirm.props.disabled,true,'A difference needs an explanation');
 await act(async()=>counted.props.onChange({target:{value:'150'}}));
 assert.ok(text(h.tree.root).includes('El efectivo contado coincide con el esperado.'));
 confirm=h.tree.root.findAllByType('button').find(button=>text(button).includes('Confirmar cierre con arqueo'));
 assert.equal(confirm.props.disabled,false,'Yape is excluded from the physical cash count');
 assert.equal(h.writes.length,0);
});

test('cash history lets sellers reconcile their open register and keeps accountants read-only',async t=>{
 const register={id,date:'2026-11-20',openingBalance:100,status:'OPEN',entries:[]};
 const seller=await mount(t,'modules/cash-register/pages/CashRegisterHistoryPage','VENDEDOR','/',null,register);
 assert.ok(seller.buttons().some(label=>label.trim()==='Cerrar'));
 const accountant=await mount(t,'modules/cash-register/pages/CashRegisterHistoryPage','CONTABILIDAD','/',null,register);
 assert.equal(accountant.buttons().some(label=>label.trim()==='Cerrar'),false);
 assert.equal(seller.writes.length,0);assert.equal(accountant.writes.length,0);
});

test('movement filters show their active subtotal, keep the complete cash total and reset without mutations',async t=>{
 const register={id,date:'2026-11-21',openingBalance:100,status:'OPEN',entries:[{id:'a',description:'Cobro por Yape',amount:12.75,type:'INCOME',category:'SALE',paymentMethodName:'Yape',voucherType:'NONE',isDeleted:false,editHistory:[]},{id:'b',description:'Cobro en efectivo',amount:20,type:'INCOME',category:'SALE',paymentMethodName:'Efectivo',voucherType:'NONE',isDeleted:false,editHistory:[]}]};
 const h=await mount(t,'modules/cash-register/pages/CashRegisterPage','ADMIN','/',null,register);
 const method=h.tree.root.findAllByType('select').find(select=>select.findAllByType('option').some(option=>option.props.value==='yape'));
 assert.ok(method);await act(async()=>method.props.onChange({target:{value:'yape'}}));
 const status=h.tree.root.findByProps({role:'status'});assert.ok(text(status).includes('Ingresos S/ 12.75'));assert.ok(text(status).includes('Neto S/ 12.75'));
 assert.ok(text(h.tree.root).includes('S/ 120.00'),'The drawer total still includes all cash movements and its opening');
 const reset=h.tree.root.findAllByType('button').find(button=>text(button)==='Limpiar filtros');assert.ok(reset);await act(async()=>reset.props.onClick());
 assert.equal(h.tree.root.findAllByProps({role:'status'}).length,0);assert.equal(method.props.value,'');assert.equal(h.writes.length,0);
});

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


test('sellers consult credit balances, individual detail and client history without write actions',async t=>{
 const credit={id,branchId:id,clientId:id,name:'Campaña de prueba',saleIds:[],saleDetails:[],totalAmount:118,paidAmount:18,pendingAmount:100,status:'PARTIAL',createdAt:'2026-11-22T12:00:00Z',payments:[{id,amount:18,paymentDate:'2026-11-22T13:00:00Z',paymentMethodName:'Efectivo',receivedByName:'Administrador'}]};
 const h=await mount(t,'modules/credits/pages/CreditsPage','VENDEDOR','/credits',null,null,[credit]);
 assert.ok(h.reads.includes('/credits')); assert.ok(text(h.tree.root).includes('Cliente con crédito')); assert.ok(text(h.tree.root).includes('100.00'));
 await act(async()=>h.tree.root.findByProps({role:'button',tabIndex:0}).props.onClick());await h.settle();
 for(const label of h.buttons())assert.doesNotMatch(label,/Registrar abono|Editar|Eliminar/);
 assert.equal(h.tree.root.findAllByType('button').some(button=>/Editar crédito|Eliminar crédito/.test(button.props.title||'')),false);
 const detail=h.tree.root.findAllByType('button').find(button=>button.props.title==='Ver detalle');assert.ok(detail);
 await act(async()=>detail.props.onClick());await h.settle();
 assert.ok(h.reads.includes('/credits/'+id));assert.ok(text(h.tree.root).includes('Historial de abonos'));assert.ok(text(h.tree.root).includes('Administrador'));
 assert.equal(h.tree.root.findAllByType('button').some(button=>button.props.title==='Descargar PDF detallado'),true);
 const history=await mount(t,'modules/credits/pages/ClientCreditDetailPage','VENDEDOR','/credits/client/'+id,null,null,[credit]);
 assert.ok(history.reads.includes('/credits/client/'+id));assert.ok(text(history.tree.root).includes('Cliente con crédito'));assert.ok(text(history.tree.root).includes('Campaña de prueba'));assert.ok(text(history.tree.root).includes('100.00'));
 for(const label of history.buttons())assert.doesNotMatch(label,/Registrar abono|Editar|Eliminar/);
 assert.equal(h.writes.length,0);assert.equal(history.writes.length,0);
});

test('administrators retain credit collection and editing actions',async t=>{
 const credit={id,branchId:id,clientId:id,name:'Campaña',saleIds:[],saleDetails:[],totalAmount:118,paidAmount:18,pendingAmount:100,status:'PARTIAL',createdAt:'2026-11-22T12:00:00Z',payments:[]};
 const h=await mount(t,'modules/credits/pages/CreditsPage','ADMIN','/credits',null,null,[credit]);
 assert.ok(h.buttons().some(label=>label.includes('Registrar abono')));
 await act(async()=>h.tree.root.findByProps({role:'button',tabIndex:0}).props.onClick());await h.settle();
 const buttons=h.tree.root.findAllByType('button');assert.ok(buttons.some(button=>button.props.title==='Editar crédito'));assert.ok(buttons.some(button=>button.props.title==='Eliminar crédito'));
 assert.equal(h.writes.length,0);
});
