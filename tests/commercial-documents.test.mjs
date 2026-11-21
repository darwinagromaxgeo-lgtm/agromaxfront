import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadTs } from './helpers/loadTs.mjs';
const require=createRequire(import.meta.url),pdfMake=require('pdfmake/build/pdfmake');
const { buildDocDefinition }=loadTs(fileURLToPath(new URL('../src/modules/quotes/utils/quotePdf.ts',import.meta.url)));
const { commercialTaxTotals }=loadTs(fileURLToPath(new URL('../src/shared/branding/commercialDocumentPdf.ts',import.meta.url)));
const { saleNoteDocument }=loadTs(fileURLToPath(new URL('../src/modules/sales/utils/saleNoteDocument.ts',import.meta.url)));
const { buildBillingPrintDefinition }=loadTs(fileURLToPath(new URL('../src/modules/billing/utils/documentPdf.ts',import.meta.url)));
const company={id:'issuer',name:'AGROMAX DE PRUEBA',ruc:'20600000001',address:'Dirección de prueba',bankAccounts:[
 {bank:'BANCO DE EJEMPLO',currency:'PEN',accountNumber:'001234567890',cci:'00123456789012345678',holder:'AGROMAX DE PRUEBA',isActive:true},
 {bank:'CUENTA DESACTIVADA',currency:'USD',accountNumber:'999999999',holder:'No mostrar',isActive:false},
]};
const lines=[['Campal plus 100 EC x L',3,33,'GRAVADO'],['Matrix x L',3,98,'GRAVADO'],['Strong-phos x L',3,20,'EXONERADO'],['Rapidmaster x L',3,27,'GRAVADO'],['Coronel SC x 500 ml',3,31,'GRAVADO'],['Clipper 500 EC x 250 ml',3,36,'GRAVADO'],['Codigo Gold x L',2,128,'GRAVADO']];
const items=lines.map(([productName,quantity,unitPrice,taxType],i)=>({productId:'p'+i,productName,quantity,unitPrice,taxType,unit:'UND',companyId:'issuer',subtotal:quantity*unitPrice}));
const quote={id:'quote',quoteNumber:'P001-00000058',series:'P001',number:58,issueDate:'2026-11-21T15:00:00Z',validUntil:'2026-12-06',total:991,items,clientName:'Cliente de ejemplo'};

test('the quotation follows the formal layout, preserves its reference and uses only active issuer accounts',async()=>{
 const definition=buildDocDefinition({quote,company,products:[],vendor:{name:'Vendedor de prueba'}});
 const text=JSON.stringify(definition.content);
 for(const value of ['COTIZACIÓN','P001-00000058','DATOS DEL CLIENTE','CONDICIONES COMERCIALES','FORMAS DE PAGO','001234567890','00123456789012345678','AGROMAX DE PRUEBA','788.98','60.00','142.02','991.00'])assert.ok(text.includes(value),value);
 assert.ok(!text.includes('CUENTA DESACTIVADA'));assert.ok(!text.includes('INVERSIONES QUIVEN'));assert.ok(!text.includes('57017218053026'));
 assert.ok(definition.content[0].columns[0].image.startsWith('data:image/png;base64,'));
 const totals=commercialTaxTotals(items);assert.equal(totals.taxable,788.98);assert.equal(totals.exempt,60);assert.equal(totals.tax,142.02);
 const bytes=await pdfMake.createPdf(definition).getBuffer();assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
});

test('no payment accounts are fabricated when the issuer has not configured them',()=>{
 const definition=buildDocDefinition({quote,products:[],company:{...company,bankAccounts:[]}});assert.ok(!JSON.stringify(definition.content).includes('FORMAS DE PAGO'));
});

test('long quotations and bank tables paginate with real PDF fonts',async()=>{
 const long={...quote,items:Array.from({length:65},(_,i)=>({...items[0],productId:'long'+i,productName:'Producto '+i+' con descripción extensa '.repeat(8)})),total:6435};
 const definition=buildDocDefinition({quote:long,products:[],company});const bytes=await pdfMake.createPdf(definition).getBuffer();assert.ok(bytes.length>10000);
});

test('A4 and ticket sale notes show the stored consecutive number and retain amounts and cancellation history',async()=>{
 const sale={id:'original-sale',noteSeries:'NV03',noteNumber:15,voucherType:'NONE',date:'2026-11-21T15:00:00Z',createdAt:'2026-11-21T15:00:00Z',total:991,isCredit:false,payments:[],items};
 const note=saleNoteDocument({sale,companies:[company],products:[],branchId:'sausal'});assert.equal(note.internalReference,'NV03-00000015');assert.equal(note.total,sale.total);
 for(const format of ['A4','TICKET']){const definition=buildBillingPrintDefinition(note,format);assert.ok(JSON.stringify(definition).includes('NV03-00000015'));assert.equal((await pdfMake.createPdf(definition).getBuffer()).subarray(0,5).toString(),'%PDF-');}
 const cancelled=saleNoteDocument({sale:{...sale,isCancelled:true},companies:[company],products:[],branchId:'sausal'});const definition=buildBillingPrintDefinition(cancelled,'A4');assert.ok(JSON.stringify(definition).includes('VENTA ANULADA'));assert.equal(cancelled.total,991);assert.equal(cancelled.internalReference,note.internalReference);
});
