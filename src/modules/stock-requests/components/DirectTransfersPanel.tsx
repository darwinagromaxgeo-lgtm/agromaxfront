import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowRightLeft, CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../../../app/providers/AuthProvider';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import { Pagination } from '../../../shared/components/Pagination';
import type { Company, Product } from '../../../shared/types';
import { useStockAvailability } from '../hooks/useStockRequests';
import { useBranchTransfers, useCreateBranchTransfer } from '../hooks/useBranchTransfers';
import type { BranchTransfer, BranchTransferPayload } from '../services/branchTransferService';

type Row = { productId: string; quantity: string };
const amount = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 6 });
const keyFor = (company: string, source: string, product: string) => `${company}:${source}:${product}`;
function pendingTransfer(key: string): BranchTransferPayload | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    return value && typeof value.requestId === 'string' && typeof value.fromBranchId === 'string' && typeof value.toBranchId === 'string' && typeof value.companyId === 'string' && Array.isArray(value.items) && value.items.length && value.items.every((item: Row) => typeof item.productId === 'string' && Number(item.quantity) > 0) ? value : null;
  } catch { return null; }
}
function storePending(key: string, payload: BranchTransferPayload | null) {
  try { if (payload) sessionStorage.setItem(key, JSON.stringify(payload)); else sessionStorage.removeItem(key); } catch { /* The in-memory request remains stable when storage is unavailable. */ }
}

function TransferRow({ row, index, products, companyId, fromBranchId, toBranchId, canRemove, onChange, onRemove, onAvailability }: {
  row: Row; index: number; products: Product[]; companyId: string; fromBranchId: string; toBranchId: string; canRemove: boolean;
  onChange: (row: Row) => void; onRemove: () => void; onAvailability: (key: string, quantity: number | null) => void;
}) {
  const query = useStockAvailability(row.productId, companyId, fromBranchId);
  const source = query.data?.branches.find(branch => branch.branchId === fromBranchId);
  const destination = query.data?.branches.find(branch => branch.branchId === toBranchId);
  const available = query.isError || !source ? null : source.quantity;
  useEffect(() => { if (row.productId) onAvailability(keyFor(companyId, fromBranchId, row.productId), available); }, [companyId, fromBranchId, row.productId, available, onAvailability]);
  const selected = products.find(product => product.id === row.productId);
  const parsed = Number(row.quantity);
  return <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
    <div className="grid gap-3 sm:grid-cols-[1fr_130px_auto]">
      <div><span className="mb-1.5 block text-xs font-semibold text-gray-600">Producto {index + 1}</span><SearchableSelect value={row.productId} onChange={productId => onChange({ productId, quantity: '' })} options={products.map(product => ({ value: product.id, label: product.name, sublabel: product.unit }))} minChars={0} placeholder={`Buscar producto ${index + 1}`} /></div>
      <label className="text-xs font-semibold text-gray-600">Cantidad<input aria-label={`Cantidad a transferir ${index + 1}`} type="number" min="0.000001" step="0.000001" required value={row.quantity} onChange={event => onChange({ ...row, quantity: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal" /></label>
      {canRemove && <button aria-label={`Quitar producto ${index + 1}`} type="button" onClick={onRemove} className="self-end rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={18} /></button>}
    </div>
    {row.productId && <div className="mt-3 text-xs leading-5">
      {query.isLoading ? <p className="text-gray-500">Consultando stock...</p> : available === null ? <p className="text-red-700">No se pudo consultar el stock. <button type="button" onClick={() => void query.refetch()} className="font-bold underline">Volver a intentar</button></p> : <div className="flex flex-wrap gap-x-5 gap-y-1"><p className="text-gray-600">Disponible en origen: <strong className="text-gray-900">{amount(available)} {selected?.unit}</strong></p>{destination && <p className="text-gray-600">Stock actual en destino: <strong>{amount(destination.quantity)}</strong></p>}{parsed > available && <p className="w-full font-semibold text-red-700">La cantidad supera el stock disponible.</p>}</div>}
      {selected?.tracksLot && <p className="mt-1 text-gray-500">Se conservarán los números de lote y sus vencimientos. Se asignan primero los lotes con vencimiento más próximo.</p>}
    </div>}
  </div>;
}

export function DirectTransfersPanel({ companies, products, initialCompanyId }: { companies: Company[]; products: Product[]; initialCompanyId: string }) {
  const { user, selectedBranch, branches = [] } = useAuth();
  const storageKey = `agromax-pending-branch-transfer:${user?.id || 'session'}`;
  const [pending, setPending] = useState<BranchTransferPayload | null>(() => pendingTransfer(storageKey));
  const [fromBranchId, setFromBranchId] = useState(pending?.fromBranchId || selectedBranch?.id || '');
  const [toBranchId, setToBranchId] = useState(pending?.toBranchId || '');
  const [companyId, setCompanyId] = useState(pending?.companyId || initialCompanyId);
  const [rows, setRows] = useState<Row[]>(pending?.items.map(item => ({ productId: item.productId, quantity: String(item.quantity) })) || [{ productId: '', quantity: '' }]);
  const [notes, setNotes] = useState(pending?.notes || '');
  const [review, setReview] = useState(!!pending);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<BranchTransfer | null>(null);
  const [filterBranch, setFilterBranch] = useState(selectedBranch?.id || '');
  const [page, setPage] = useState(1);
  const [availability, setAvailability] = useState<Record<string, number | null>>({});
  const saving = useRef(false);
  const history = useBranchTransfers(filterBranch, page);
  const mutation = useCreateBranchTransfer();
  const activeBranches = branches.filter(branch => branch.isActive);
  const from = activeBranches.find(branch => branch.id === fromBranchId), to = activeBranches.find(branch => branch.id === toBranchId);
  const eligibleCompanies = useMemo(() => companies.filter(company => company.isActive && from?.companyIds.includes(company.id) && (!to || to.companyIds.includes(company.id))), [companies, from, to]);
  useEffect(() => {
    if (!pending && !review && !eligibleCompanies.some(company => company.id === companyId)) setCompanyId(eligibleCompanies.find(company => company.id === initialCompanyId)?.id || eligibleCompanies[0]?.id || '');
  }, [companyId, initialCompanyId, eligibleCompanies, pending, review]);
  const reportAvailability = useCallback((key: string, value: number | null) => setAvailability(previous => previous[key] === value ? previous : { ...previous, [key]: value }), []);
  const valid = !!from && !!to && fromBranchId !== toBranchId && eligibleCompanies.some(company => company.id === companyId) && rows.length > 0 && new Set(rows.map(row => row.productId)).size === rows.length && rows.every(row => {
    const value = Number(row.quantity), available = availability[keyFor(companyId, fromBranchId, row.productId)];
    return !!row.productId && row.quantity.trim() !== '' && Number.isFinite(value) && value >= .000001 && Math.abs(Math.round(value * 1_000_000) / 1_000_000 - value) < 1e-10 && typeof available === 'number' && value <= available;
  });
  const complete = (result: BranchTransfer) => {
    storePending(storageKey, null); setPending(null); setReview(false); setSaved(result); setRows([{ productId: '', quantity: '' }]); setNotes(''); setError(''); setPage(1);
    if (filterBranch && filterBranch !== result.fromBranchId && filterBranch !== result.toBranchId) setFilterBranch('');
  };
  const submit = async () => {
    if (saving.current || (!pending && !valid)) return;
    const payload = pending || { requestId: crypto.randomUUID(), fromBranchId, toBranchId, companyId, items: rows.map(row => ({ productId: row.productId, quantity: Number(row.quantity) })), ...(notes.trim() ? { notes: notes.trim() } : {}) };
    saving.current = true; setPending(payload); storePending(storageKey, payload); setError('');
    try { complete(await mutation.mutateAsync({ payload, checkFirst: !!pending })); }
    catch (failure: any) {
      const message = failure.response?.data?.message;
      setError((Array.isArray(message) ? message.join('. ') : message) || 'No se pudo confirmar la transferencia. Reintenta el mismo envío; no se duplicará el movimiento.');
      if (!pending && failure.response?.status >= 400 && failure.response?.status < 500) { storePending(storageKey, null); setPending(null); setReview(false); }
    } finally { saving.current = false; }
  };
  return <div className="space-y-6">
    {saved && <section role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4"><h2 className="flex items-center gap-2 font-bold text-primary-900"><CheckCircle2 size={20} />Transferencia completada · {saved.reference}</h2><p className="mt-1 text-sm text-primary-900">{saved.fromBranchName} → {saved.toBranchName}. Stock y Kardex actualizados en ambas sucursales.</p></section>}
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><ArrowRightLeft size={20} />Transferencia directa</h2><p className="mb-5 mt-1 text-sm text-gray-600">Traslada productos y registra su ingreso en destino en una sola confirmación.</p>
      {pending && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay un envío pendiente de confirmación. Reintenta esta misma transferencia para comprobar el resultado.</p>}
      <form onSubmit={event => { event.preventDefault(); if (valid) { setReview(true); setError(''); setSaved(null); } }}>
        <fieldset disabled={review || !!pending || mutation.isPending} className="space-y-4 disabled:opacity-75">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-gray-700">Origen<select aria-label="Sucursal de origen" required value={fromBranchId} onChange={event => { setFromBranchId(event.target.value); if (toBranchId === event.target.value) setToBranchId(''); }} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm font-normal"><option value="">Seleccionar sucursal</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-gray-700">Destino<select aria-label="Sucursal de destino" required value={toBranchId} onChange={event => setToBranchId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm font-normal"><option value="">Seleccionar sucursal</option>{activeBranches.filter(branch => branch.id !== fromBranchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-gray-700">Empresa / RUC<select aria-label="Empresa del traslado" required value={companyId} onChange={event => setCompanyId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm font-normal"><option value="">Seleccionar empresa</option>{eligibleCompanies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          </div>
          {from && to && !eligibleCompanies.length && <p role="alert" className="text-sm text-red-700">Estas sucursales no comparten una empresa habilitada.</p>}
          <div className="space-y-3">{rows.map((row, index) => <TransferRow key={index} row={row} index={index} products={products.filter(product => product.isActive && (product.id === row.productId || !rows.some(other => other.productId === product.id)))} companyId={companyId} fromBranchId={fromBranchId} toBranchId={toBranchId} canRemove={rows.length > 1} onChange={value => setRows(previous => previous.map((item, position) => position === index ? value : item))} onRemove={() => setRows(previous => previous.filter((_, position) => position !== index))} onAvailability={reportAvailability} />)}</div>
          <button type="button" disabled={rows.length >= 100} onClick={() => setRows(previous => [...previous, { productId: '', quantity: '' }])} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50"><Plus size={16} />Agregar producto</button>
          <label className="block text-sm font-semibold text-gray-700">Observación (opcional)<textarea aria-label="Observación del traslado" value={notes} onChange={event => setNotes(event.target.value)} maxLength={500} rows={2} className="mt-1.5 w-full rounded-lg border border-gray-300 p-2.5 text-sm font-normal" /></label>
        </fieldset>
        {!review && <button type="submit" disabled={!valid || mutation.isPending} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">Revisar transferencia<ArrowRight size={16} /></button>}
      </form>
      {review && <div className="mt-5 rounded-xl border border-primary-200 bg-primary-50 p-4"><p className="font-bold text-gray-900">{from?.name || pending?.fromBranchId} → {to?.name || pending?.toBranchId}</p><p className="mt-1 text-sm text-gray-700">Se descontarán las cantidades indicadas del origen y se sumarán al destino. La operación quedará registrada a tu nombre.</p><div className="mt-4 flex flex-wrap gap-2">{!pending && <button disabled={mutation.isPending} onClick={() => setReview(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700">Volver a editar</button>}<button onClick={() => void submit()} disabled={mutation.isPending} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{mutation.isPending ? 'Transfiriendo...' : pending ? 'Reintentar y comprobar' : 'Confirmar transferencia'}</button></div></div>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </section>
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4"><h2 className="font-bold text-gray-900">Historial de transferencias directas</h2><div className="flex gap-2"><select aria-label="Sucursal del historial de transferencias" value={filterBranch} onChange={event => { setFilterBranch(event.target.value); setPage(1); }} className="min-w-0 rounded-lg border border-gray-200 p-2 text-sm"><option value="">Todas las sucursales</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button onClick={() => void history.refetch()} aria-label="Actualizar transferencias" className="rounded-lg border border-gray-200 p-2 text-gray-600"><RefreshCw size={16} /></button></div></div>
      {history.isLoading ? <p className="p-5 text-sm text-gray-500">Cargando transferencias...</p> : history.isError ? <p role="alert" className="p-5 text-sm text-red-700">No se pudo cargar el historial. Vuelve a actualizar.</p> : !history.data?.total ? <p className="p-8 text-center text-sm text-gray-500">Todavía no hay transferencias directas en esta vista.</p> : <div className="divide-y divide-gray-100">{history.data.data.map(transfer => <article key={transfer.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold text-gray-900">{transfer.fromBranchName} → {transfer.toBranchName}</p><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">Completada · {transfer.reference}</span></div><p className="mt-1 text-xs text-gray-500">{new Date(transfer.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })} · {transfer.transferredByName} · {transfer.companyName}</p><ul className="mt-3 space-y-2">{transfer.items.map(item => <li key={item.productId} className="rounded-lg bg-gray-50 p-3 text-sm"><p className="font-semibold text-gray-800">{item.productName} · {amount(item.quantity)} {item.unit}</p><p className="mt-1 text-xs text-gray-600">Origen {amount(item.sourcePrevious)} → {amount(item.sourceCurrent)} · Destino {amount(item.destinationPrevious)} → {amount(item.destinationCurrent)}</p>{item.lots.length > 0 && <p className="mt-1 text-xs text-gray-500">Lotes: {item.lots.map(lot => `${lot.lotNumber} (${amount(lot.quantity)})`).join(', ')}</p>}</li>)}</ul>{transfer.notes && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{transfer.notes}</p>}</article>)}</div>}
      <div className="px-4"><Pagination page={page} totalPages={Math.ceil((history.data?.total || 0) / 20)} onPageChange={setPage} /></div>
    </section>
  </div>;
}
