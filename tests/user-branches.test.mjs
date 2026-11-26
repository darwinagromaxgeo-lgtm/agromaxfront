import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire,Module } from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from 'typescript';
const require=createRequire(import.meta.url),{QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const root=fileURLToPath(new URL('../',import.meta.url));
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
async function mount(t,role='ADMIN'){
 const branches=[{id:'ascope',name:'Ascope',code:'ASCOPE'},{id:'paijan',name:'Paiján',code:'PAIJAN'},{id:'sausal',name:'Sausal',code:'SAUSAL'}];
 const writes=[],errors=[],reads=[];let fail=false;const users=[];
 const wrap=data=>({data:{data}});
 const api={get:async(route,config)=>{reads.push({route,params:config?.params});return wrap({data:users,total:users.length});},post:async(route,data)=>{writes.push({route,data});if(fail)throw{response:{data:{message:['El nombre de usuario ya esta registrado']}}};const user={...data,id:'created',isActive:true};users.push(user);return wrap(user);}};
 const cache=new Map();const load=filename=>{
  if(cache.has(filename))return cache.get(filename).exports;
  const loaded=new Module(filename);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(filename,loaded);const original=loaded.require.bind(loaded);
  loaded.require=specifier=>{
   if(specifier==='react-hot-toast')return{success(){},error:message=>errors.push(message)};
   if(specifier.startsWith('.')){const target=path.resolve(path.dirname(filename),specifier);
    if(target===path.join(root,'src/shared/services/api'))return{api};
    if(target===path.join(root,'src/app/providers/AuthProvider'))return{useAuth:()=>({user:{id:'admin',username:'admin',role},branches,selectedBranch:branches[2]})};
    const dependency=[target+'.ts',target+'.tsx'].find(existsSync);if(dependency)return load(dependency);
   }return original(specifier);
  };
  loaded._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);return loaded.exports;
 };
 const {UsersPage}=load(path.join(root,'src/modules/users/pages/UsersPage.tsx'));
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{retry:false,gcTime:Infinity}}});let tree;
 const settle=async()=>{for(let i=0;i<4;i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,5)));};
 await act(async()=>{tree=TestRenderer.create(React.createElement(QueryClientProvider,{client},React.createElement(UsersPage)));});await settle();
 t.after(()=>{act(()=>tree.unmount());client.clear();});
 const click=async label=>{const button=tree.root.findAllByType('button').find(button=>text(button).trim()===label);assert.ok(button,label);await act(async()=>button.props.onClick());await settle();};
 const field=async(label,value)=>act(async()=>tree.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
 const fill=async()=>{await field('Nombre completo',' Vendedor Sausal ');await field('Usuario',' nuevo-vendedor ');await field('Contraseña','test-only-password');};
 const submit=async()=>{await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));await settle();};
 return{tree,writes,errors,reads,click,field,fill,submit,settle,setFailure:value=>{fail=value;}};
}

test('new users default to the selected branch and save exactly the chosen role and assignments',async t=>{
 const h=await mount(t);await h.click('Nuevo Usuario');
 assert.equal(h.tree.root.findByProps({'aria-label':'Sausal'}).props.checked,true);
 for(const name of ['Ascope','Paiján'])assert.equal(h.tree.root.findByProps({'aria-label':name}).props.checked,false);
 await h.fill();await h.field('Rol','ALMACENERO');await h.submit();
 assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].data.branchAssignments,[{branchId:'sausal',role:'ALMACENERO'}]);assert.equal(h.writes[0].data.role,'ALMACENERO');assert.equal(h.writes[0].data.username,'nuevo-vendedor');assert.equal(h.writes[0].data.email,undefined);
 assert.equal(h.tree.root.findAllByProps({role:'dialog'}).length,0);assert.ok(text(h.tree.root).includes('Sausal'));
});

test('a failed creation retains its values and displays a readable error so it can be corrected',async t=>{
 const h=await mount(t);await h.click('Nuevo Usuario');await h.fill();h.setFailure(true);await h.submit();
 assert.equal(h.tree.root.findByProps({'aria-label':'Usuario'}).props.value,' nuevo-vendedor ');assert.match(text(h.tree.root.findByProps({role:'alert'})),/ya esta registrado/);assert.equal(typeof h.errors[0],'string');
 h.setFailure(false);await h.field('Usuario','otro-vendedor');await h.submit();assert.equal(h.writes.length,2);assert.equal(h.tree.root.findAllByProps({role:'dialog'}).length,0);
});

test('an administrator explicitly enables transfers for a seller while new sellers default to no permission',async t=>{
 const h=await mount(t);await h.click('Nuevo Usuario');await h.fill();
 const checkbox=h.tree.root.findByProps({'aria-label':'Permitir transferencias entre sucursales'});assert.equal(checkbox.props.checked,false);
 await act(async()=>checkbox.props.onChange({target:{checked:true}}));await h.submit();assert.equal(h.writes[0].data.canTransferStock,true);assert.deepEqual(h.writes[0].data.branchAssignments,[{branchId:'sausal',role:'VENDEDOR'}]);
});

test('a branch is required for staff while administrators retain global access',async t=>{
 const h=await mount(t);await h.click('Nuevo Usuario');await h.fill();await act(async()=>h.tree.root.findByProps({'aria-label':'Sausal'}).props.onChange());await h.submit();
 assert.equal(h.writes.length,0);assert.match(text(h.tree.root.findByProps({role:'alert'})),/al menos una sucursal/);
 await h.field('Rol','ADMIN');await h.submit();assert.equal(h.writes[0].data.role,'ADMIN');assert.deepEqual(h.writes[0].data.branchAssignments,[]);assert.ok(text(h.tree.root).includes('Todas las sucursales'));
});

for(const role of ['VENDEDOR','CONTABILIDAD','ALMACENERO'])test(role+' cannot open user management or request its data',async t=>{
 const h=await mount(t,role);assert.match(text(h.tree.root),/Solo un administrador/);assert.equal(h.tree.root.findAllByType('button').length,0);assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
});
