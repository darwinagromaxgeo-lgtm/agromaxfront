import { useEffect, useState } from 'react';
import { ArrowRight, Boxes, Info, Package } from 'lucide-react';
import { Modal } from '../../../shared/components/Modal';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import type { Category, Company, Product } from '../../../shared/types';
import { useStockAdjustmentSession } from '../hooks/useStockAdjustmentSession';
import { adjustmentPreview, formatStockQuantity, stockMovementLabels, stockMovementModes, type StockAdjustmentRow, type StockMovementKind } from '../utils/stockAdjustment';
import { StockAdjustmentCompany, StockAdjustmentFeedback } from './StockAdjustmentFeedback';

interface Props { companies: Company[]; products: Product[]; categories: Category[]; companyId: string; productId?: string; branchName: string; onClose: () => void; }
const reasons: Record<StockMovementKind, string[]> = {
  ENTRY: ['Ingreso manual', 'Reposición', 'Corrección'],
  EXIT: ['Salida manual', 'Uso interno', 'Corrección'],
  WASTE: ['Producto vencido', 'Producto dañado', 'Pérdida de mercadería'],
  COUNT: ['Conteo de inventario', 'Corrección de stock'],
};
const instructions: Record<StockMovementKind, string> = {
  ENTRY: 'Escribe las unidades que ingresan. Se sumarán al stock actual.',
  EXIT: 'Escribe las unidades que salen. Se restarán del stock actual.',
  WASTE: 'Registra las unidades vencidas, dañadas o perdidas. Se descontarán del stock.',
  COUNT: 'Escribe el stock físico final que tienes de este producto.',
};
const quantityLabels: Record<StockMovementKind, string> = { ENTRY: 'Cantidad que ingresa', EXIT: 'Cantidad que sale', WASTE: 'Cantidad de merma', COUNT: 'Stock físico final' };

export function StockMovementModal({ companies, products, categories, companyId, productId: presetProductId, branchName, onClose }: Props) {
  const session = useStockAdjustmentSession(products, companyId);
  const [productId, setProductId] = useState(presetProductId || '');
  const [kind, setKind] = useState<StockMovementKind>('ENTRY');
  const [quantity, setQuantity] = useState('');
  const [expectedQuantity, setExpectedQuantity] = useState<number>();
  const [reason, setReason] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const product = products.find(item => item.id === productId && item.isActive);
  const category = categories.find(item => item.id === product?.categoryId)?.name;
  const row: StockAdjustmentRow = { id: productId, productId, type: stockMovementModes[kind], movementKind: kind, quantity, expectedQuantity, lotNumber, expirationDate };
  const preview = adjustmentPreview(row);
  const current = expectedQuantity ?? session.currentQuantities.get(productId);
  const resulting = preview?.final ?? current;
  const close = () => { if (!session.isSaving()) onClose(); };

  useEffect(() => {
    if (session.ready && expectedQuantity === undefined && session.currentQuantities.has(productId)) setExpectedQuantity(session.currentQuantities.get(productId));
  }, [session.ready, session.currentQuantities, expectedQuantity, productId]);
  const reset = () => { setQuantity(''); setReason(''); setLotNumber(''); setExpirationDate(''); session.setError(''); };
  const refresh = async () => {
    const quantities = await session.refresh();
    if (quantities) setExpectedQuantity(quantities.get(productId));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await session.save([row], reason, kind === 'COUNT')) onClose();
  };

  return <Modal isOpen onClose={close} closeDisabled={session.pending} title="Registrar movimiento" size="lg"
    description={<div className="mt-1"><p className="text-sm text-gray-700">{product ? [product.name, category].filter(Boolean).join(' · ') : 'Selecciona un producto'}</p><p className="text-xs text-gray-500 mt-1">{branchName}</p></div>}
    footer={<div className="flex items-center justify-between gap-3">
      <button type="button" onClick={close} disabled={session.pending} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
      <button type="submit" form="stock-movement-form" disabled={!session.ready || !product || !preview?.valid || !reason.trim() || session.pending || session.needsReview} className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
        {session.pending ? 'Guardando...' : kind === 'COUNT' ? 'Guardar conteo' : 'Registrar movimiento'}
      </button>
    </div>}>
    <form id="stock-movement-form" onSubmit={submit} className="space-y-5">
      <StockAdjustmentCompany session={session} companies={companies} onChange={value => { session.changeCompany(value); setExpectedQuantity(undefined); reset(); }} />
      {!presetProductId && <fieldset disabled={!session.ready || session.pending}><label className="block text-sm font-medium text-gray-700">
        Producto
        <div className="mt-1"><SearchableSelect value={productId} required options={products.filter(item => item.isActive).map(item => ({ value: item.id, label: item.name, sublabel: item.supplier }))}
          onChange={value => { setProductId(value); setExpectedQuantity(session.ready ? session.currentQuantities.get(value) : undefined); reset(); }} placeholder="Buscar producto..." />
        </div>
      </label></fieldset>}
      <div role="tablist" aria-label="Tipo de movimiento" className="grid grid-cols-4 gap-1 rounded-2xl border border-gray-200 p-1">
        {(Object.keys(stockMovementLabels) as StockMovementKind[]).map(value => <button key={value} type="button" role="tab" id={`stock-tab-${value}`} aria-selected={kind === value} aria-controls="stock-movement-panel" disabled={session.pending}
          onClick={() => { setKind(value); reset(); }} className={`px-1.5 sm:px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${kind === value ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'}`}>
          {stockMovementLabels[value]}
        </button>)}
      </div>
      <StockAdjustmentFeedback session={session} onRefresh={refresh} />
      <div role="tabpanel" id="stock-movement-panel" aria-labelledby={`stock-tab-${kind}`} className="space-y-5">
        <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-700"><Info size={20} className="shrink-0" /><span>{instructions[kind]}</span></div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-center items-center rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
          <div><p className="text-xs sm:text-sm text-gray-500">Stock actual</p><p className="mt-1 text-2xl font-semibold tabular-nums text-gray-800">{current === undefined ? '—' : formatStockQuantity(current)}</p></div>
          <div className="text-gray-500"><ArrowRight size={21} className="mx-auto" /><p className="text-xs mt-1">{kind === 'COUNT' ? '=' : kind === 'ENTRY' ? '+' : '−'}</p><p className="text-[10px] mt-1">{product?.unit || 'unidades'}</p></div>
          <div><p className="text-xs sm:text-sm text-gray-500">Stock resultante</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${preview && !preview.valid ? 'text-red-600' : 'text-orange-700'}`}>{resulting === undefined ? '—' : formatStockQuantity(resulting)}</p></div>
        </div>
        <fieldset disabled={!session.ready || session.pending} className="space-y-5 disabled:opacity-60">
          <div>
            <label htmlFor="stock-movement-quantity" className="block text-sm font-medium text-gray-800 mb-2">{quantityLabels[kind]} *</label>
            <div className="relative">
              <Package size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input id="stock-movement-quantity" type="number" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} min={kind === 'COUNT' ? 0 : 0.000001} max={1e12} step="0.000001" required placeholder={kind === 'COUNT' ? 'Cantidad final' : 'Cantidad'} className="w-full rounded-xl border border-gray-200 py-3.5 pl-11 pr-20 text-base outline-none focus:ring-2 focus:ring-orange-200" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">{product?.unit || 'unidades'}</span>
            </div>
            {quantity && !preview?.valid ? <p role="alert" className="text-xs text-red-600 mt-2">Revisa la cantidad. El stock resultante debe ser mayor o igual a cero.</p> : <p className="text-xs text-gray-500 mt-2">{kind === 'COUNT' ? 'Escribe 0 si ya no tienes existencias.' : 'Escribe las unidades de este movimiento.'}</p>}
          </div>
          <div>
            <label htmlFor="stock-movement-reason" className="block text-sm font-medium text-gray-800 mb-2">Motivo *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {reasons[kind].map(value => <button key={value} type="button" aria-pressed={reason === value} onClick={() => setReason(value)} className={`px-3 py-1.5 rounded-full border text-xs ${reason === value ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{value}</button>)}
            </div>
            <textarea id="stock-movement-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required rows={2} placeholder="Selecciona un motivo o escribe uno..." className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
          </div>
          {product?.tracksLot && (preview?.difference ?? 0) > 0 && <details className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
            <summary className="cursor-pointer font-medium"><Boxes size={14} className="inline mr-1" />Información de lote (opcional)</summary>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <label>Número de lote<input value={lotNumber} maxLength={100} onChange={event => setLotNumber(event.target.value)} placeholder="Nuevo o existente" className="w-full px-3 py-2 border rounded-lg text-sm mt-1" /></label>
              <label>Vencimiento<input type="date" value={expirationDate} onChange={event => setExpirationDate(event.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" /></label>
            </div>
            <p className="mt-2">Si dejas el lote vacío, se creará uno para las unidades agregadas.</p>
          </details>}
          {product?.tracksLot && (preview?.difference ?? 0) < 0 && <p className="text-xs text-gray-500">Se descontará primero de los lotes que vencen antes.</p>}
        </fieldset>
        <button type="button" onClick={refresh} disabled={session.loading || session.pending || !session.companyId} className="text-xs text-gray-500 underline">Actualizar stock y revisar</button>
      </div>
    </form>
  </Modal>;
}
