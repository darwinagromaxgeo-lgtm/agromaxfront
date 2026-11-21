import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Boxes, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Modal } from '../../../shared/components/Modal';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import type { Company, Product, ProductLot, Stock } from '../../../shared/types';
import { stockService } from '../services/stockService';
import { productLotService } from '../services/productLotService';
import { useCreateStockAdjustmentBatch } from '../hooks/useStockAdjustments';
import { adjustmentPreview, buildStockAdjustmentBatch, formatStockQuantity, stockQuantity, type StockAdjustmentRow } from '../utils/stockAdjustment';

interface Props { companies: Company[]; products: Product[]; companyId: string; productId?: string; branchName: string; onClose: () => void; }
const emptyRow = (productId = ''): StockAdjustmentRow => ({ id: crypto.randomUUID(), productId, type: 'SET', quantity: '', lotNumber: '', expirationDate: '' });

export function StockAdjustmentModal({ companies, products, companyId: initialCompanyId, productId, branchName, onClose }: Props) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [rows, setRows] = useState<StockAdjustmentRow[]>(() => [emptyRow(productId)]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const request = useRef<{ fingerprint: string; id: string }>();
  const saving = useRef(false);
  const mutation = useCreateStockAdjustmentBatch();
  const stockQuery = useQuery({ queryKey: ['stock', companyId, 'adjustment-snapshot'], queryFn: () => stockService.getAdjustmentSnapshot(companyId), enabled: !!companyId, refetchOnMount: 'always' });
  const lotsQuery = useQuery({ queryKey: ['product-lots', companyId, undefined], queryFn: () => productLotService.getByCompany(companyId), enabled: !!companyId, refetchOnMount: 'always' });
  const loading = !!companyId && (stockQuery.isFetching || lotsQuery.isFetching);
  const loadFailed = stockQuery.isError || lotsQuery.isError;
  const ready = !!companyId && stockQuery.isSuccess && lotsQuery.isSuccess && !loading && !loadFailed;
  const availableProducts = products.filter(product => product.isActive);

  const quantities = (stockData = stockQuery.data, lotsData = lotsQuery.data) => {
    const stock: Stock[] = stockData?.data || [];
    const lots: ProductLot[] = Array.isArray(lotsData) ? lotsData : [];
    const map = new Map(stock.map(item => [item.productId, item.quantity]));
    const lotTotals = new Map<string, number>();
    for (const lot of lots) if (lot.isActive && lot.currentQuantity > 0) lotTotals.set(lot.productId, (lotTotals.get(lot.productId) || 0) + lot.currentQuantity);
    return new Map(availableProducts.map(product => [product.id, stockQuantity(product.tracksLot ? lotTotals.get(product.id) || 0 : map.get(product.id) || 0)]));
  };
  const currentQuantities = quantities();
  // Freeze each row's starting quantity: background fetches must not silently change its preview.
  useEffect(() => {
    if (!ready) return;
    setRows(previous => {
      if (!previous.some(row => currentQuantities.has(row.productId) && row.expectedQuantity === undefined)) return previous;
      return previous.map(row => currentQuantities.has(row.productId) && row.expectedQuantity === undefined ? { ...row, expectedQuantity: currentQuantities.get(row.productId)! } : row);
    });
  }, [companyId, ready, stockQuery.data, lotsQuery.data, products]);

  const updateRow = (id: string, patch: Partial<StockAdjustmentRow>) => {
    setRows(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row));
    setError('');
  };
  const refresh = async () => {
    const [stocks, lots] = await Promise.all([stockQuery.refetch(), lotsQuery.refetch()]);
    if (stocks.isError || lots.isError) { setError('No se pudo actualizar el inventario. Intenta otra vez.'); return; }
    const refreshed = quantities(stocks.data, lots.data);
    setRows(previous => previous.map(row => ({ ...row, expectedQuantity: row.productId ? refreshed.get(row.productId) ?? 0 : undefined })));
    setNeedsReview(false);
    setError('Stock actualizado. Revisa las cantidades finales antes de guardar.');
  };
  const changed = rows.filter(row => { const preview = adjustmentPreview(row); return preview?.valid && preview.difference !== 0; }).length;
  const valid = rows.every(row => row.productId && adjustmentPreview(row)?.valid) && new Set(rows.map(row => row.productId)).size === rows.length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current || !ready || needsReview) return;
    setError('');
    try {
      const payload = buildStockAdjustmentBatch(companyId, reason, rows, '');
      const fingerprint = JSON.stringify(payload);
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
      payload.requestId = request.current.id;
      saving.current = true;
      await mutation.mutateAsync(payload);
      onClose();
    } catch (failure: any) {
      const message = failure.response?.data?.message;
      setError((Array.isArray(message) ? message.join('. ') : message) || failure.message || 'No se pudo guardar el ajuste.');
      if (failure.response?.status === 409) setNeedsReview(true);
    } finally { saving.current = false; }
  };

  return <Modal isOpen onClose={() => { if (!saving.current) onClose(); }} title="Ajustar stock" size="xl">
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600">Establece la cantidad que tienes o suma y resta unidades. Agrega varios productos para guardarlos juntos.</p>
      <div className="grid gap-3 sm:grid-cols-2 items-end">
        <div><label htmlFor="adjustment-company" className="block text-sm font-medium text-gray-700 mb-1">Empresa · {branchName}</label>
          <select id="adjustment-company" value={companyId} disabled={mutation.isPending} required onChange={event => { setCompanyId(event.target.value); setRows(previous => previous.map(row => ({ ...row, expectedQuantity: undefined, lotNumber: '', expirationDate: '' }))); setError(''); setNeedsReview(false); request.current = undefined; }} className="w-full px-3 py-2 border rounded-lg">
            <option value="">Seleccionar empresa...</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
        <button type="button" onClick={refresh} disabled={!companyId || loading || mutation.isPending} className="flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-700 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{loading ? 'Cargando stock...' : 'Actualizar stock y revisar'}</button>
      </div>
      {loadFailed && <p role="alert" className="text-sm text-red-700">No se pudo cargar el inventario. Actualiza el stock antes de ajustar.</p>}
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={18} className="shrink-0" /><span>{error}</span></div>}
      <fieldset disabled={!ready || mutation.isPending} className="space-y-3 disabled:opacity-60">
        {rows.map((row, index) => {
          const product = availableProducts.find(item => item.id === row.productId);
          const preview = adjustmentPreview(row);
          const increasing = (preview?.difference ?? 0) > 0;
          return <div key={row.id} className="border border-gray-200 rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-gray-500">PRODUCTO {index + 1}</span><button type="button" aria-label={`Quitar producto ${index + 1}`} disabled={rows.length === 1} onClick={() => { setRows(previous => previous.filter(item => item.id !== row.id)); setError(''); }} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button></div>
            <SearchableSelect value={row.productId} placeholder="Buscar producto por nombre..." required options={availableProducts.filter(item => item.id === row.productId || !rows.some(other => other.productId === item.id)).map(item => ({ value: item.id, label: item.name, sublabel: `${formatStockQuantity(currentQuantities.get(item.id) ?? 0)} ${item.unit} disponibles` }))} onChange={value => updateRow(row.id, { productId: value, expectedQuantity: value ? currentQuantities.get(value) ?? 0 : undefined, quantity: '', lotNumber: '', expirationDate: '' })} />
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor={`adjustment-mode-${row.id}`} className="block text-xs font-medium text-gray-700 mb-1">Acción</label><select id={`adjustment-mode-${row.id}`} value={row.type} onChange={event => updateRow(row.id, { type: event.target.value as StockAdjustmentRow['type'], quantity: '', lotNumber: '', expirationDate: '' })} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="SET">Establecer cantidad</option><option value="INCREASE">Sumar unidades</option><option value="DECREASE">Restar unidades</option></select></div>
              <div><label htmlFor={`adjustment-quantity-${row.id}`} className="block text-xs font-medium text-gray-700 mb-1">{row.type === 'SET' ? 'Cantidad final que tienes' : row.type === 'INCREASE' ? 'Cantidad a sumar' : 'Cantidad a restar'}</label><input id={`adjustment-quantity-${row.id}`} type="number" inputMode="decimal" min={row.type === 'SET' ? 0 : 0.000001} max={1e12} step="0.000001" value={row.quantity} onChange={event => updateRow(row.id, { quantity: event.target.value })} required placeholder={row.type === 'SET' ? 'Ej.: 20' : 'Cantidad'} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
            {product && <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm ${preview && !preview.valid ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}><span>Actual: <strong>{row.expectedQuantity === undefined ? '...' : formatStockQuantity(row.expectedQuantity)}</strong></span><ArrowRight size={14} /><span>Final: <strong>{preview ? formatStockQuantity(preview.final) : '—'}</strong> {product.unit}</span>{preview && <span className="text-xs">({preview.difference > 0 ? '+' : ''}{formatStockQuantity(preview.difference)}){!preview.valid && ' · Stock insuficiente'}</span>}</div>}
            {product?.tracksLot && increasing && <details className="rounded-lg bg-blue-50 p-3"><summary className="cursor-pointer text-xs font-medium text-blue-700"><Boxes size={13} className="inline mr-1" />Información de lote (opcional)</summary><div className="grid gap-3 sm:grid-cols-2 mt-3"><div><label htmlFor={`adjustment-lot-${row.id}`} className="block text-xs mb-1">Número de lote</label><input id={`adjustment-lot-${row.id}`} value={row.lotNumber} maxLength={100} onChange={event => updateRow(row.id, { lotNumber: event.target.value })} placeholder="Nuevo o existente" className="w-full px-3 py-2 border rounded-lg text-sm" /></div><div><label htmlFor={`adjustment-expiration-${row.id}`} className="block text-xs mb-1">Vencimiento</label><input id={`adjustment-expiration-${row.id}`} type="date" value={row.expirationDate} onChange={event => updateRow(row.id, { expirationDate: event.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div></div><p className="mt-2 text-xs text-blue-700">Si dejas el lote vacío, se creará uno para las unidades agregadas.</p></details>}
            {product?.tracksLot && preview && preview.difference < 0 && <p className="text-xs text-gray-500">La reducción se descontará primero de los lotes que vencen antes.</p>}
          </div>;
        })}
        <button type="button" disabled={rows.length >= 100} onClick={() => setRows(previous => [...previous, emptyRow()])} className="w-full flex justify-center items-center gap-2 border-2 border-dashed border-orange-200 text-orange-700 py-2.5 rounded-xl text-sm font-medium hover:bg-orange-50"><Plus size={16} />Agregar otro producto</button>
        <div><label htmlFor="adjustment-reason" className="block text-sm font-medium text-gray-700 mb-1">Motivo del ajuste</label><textarea id="adjustment-reason" value={reason} onChange={event => { setReason(event.target.value); setError(''); }} maxLength={500} required rows={2} placeholder="Ej.: Conteo físico de inventario" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
      </fieldset>
      <div className="sticky bottom-0 bg-white pt-3 border-t space-y-2"><p className="text-xs text-gray-500">{changed} {changed === 1 ? 'producto con cambios' : 'productos con cambios'}. Se guardará un ajuste en el historial de cada producto.</p><button type="submit" disabled={!ready || !valid || !changed || !reason.trim() || mutation.isPending || needsReview} className="w-full py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm font-semibold">{mutation.isPending ? 'Guardando ajustes...' : changed === 1 ? 'Guardar ajuste' : `Guardar ${changed} ajustes`}</button></div>
    </form>
  </Modal>;
}
