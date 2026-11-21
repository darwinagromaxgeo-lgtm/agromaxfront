import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Modal } from '../../../shared/components/Modal';
import type { Category, Company, Product } from '../../../shared/types';
import { useStockAdjustmentSession } from '../hooks/useStockAdjustmentSession';
import { adjustmentPreview, formatStockQuantity, type StockAdjustmentRow } from '../utils/stockAdjustment';
import { stockCountGroups, stockCountSummary, updateStockCount } from '../utils/stockCount';
import { StockAdjustmentCompany, StockAdjustmentFeedback } from './StockAdjustmentFeedback';

interface Props {
  companies: Company[];
  products: Product[];
  categories: Category[];
  companyId: string;
  branchName: string;
  onClose: () => void;
}

export function StockCountModal({ companies, products, categories, companyId, branchName, onClose }: Props) {
  const session = useStockAdjustmentSession(products, companyId);
  const [rows, setRows] = useState<StockAdjustmentRow[]>([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [reason, setReason] = useState('Conteo físico de inventario');
  const groups = useMemo(() => stockCountGroups(products, categories, search), [products, categories, search]);
  const activeCount = products.filter(product => product.isActive).length;
  const summary = stockCountSummary(rows);
  const entered = new Map(rows.map(row => [row.productId, row]));
  const close = () => { if (!session.isSaving()) onClose(); };
  const refresh = async () => {
    const quantities = await session.refresh();
    if (quantities) setRows(previous => previous.map(row => ({ ...row, expectedQuantity: quantities.get(row.productId) ?? 0 })));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await session.save(rows, reason.trim() || 'Conteo físico de inventario', true)) onClose();
  };
  const toggle = (id: string) => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const nextQuantity = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputs = Array.from(event.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[data-stock-count]') || []);
    inputs[inputs.indexOf(event.currentTarget) + 1]?.focus();
  };

  return <Modal isOpen onClose={close} closeDisabled={session.pending} title="Conteo de stock" size="2xl"
    description={<div className="mt-1 space-y-1">
      <p className="text-sm font-medium text-gray-700">{summary.counted} de {activeCount} artículos contados · {branchName}</p>
      <p className="text-xs sm:text-sm text-gray-500">Ingresa el stock físico final. Las entradas, salidas y mermas se registran desde el producto.</p>
    </div>}
    footer={<div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={close} disabled={session.pending} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-xs text-gray-500">{summary.changed} {summary.changed === 1 ? 'con diferencia' : 'con diferencias'}</span>
        <button type="submit" form="stock-count-form" disabled={!session.ready || !summary.valid || rows.length > 1000 || session.pending || session.needsReview} className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
          {session.pending ? 'Guardando conteo...' : 'Guardar conteo'}
        </button>
      </div>
    </div>}>
    <form id="stock-count-form" onSubmit={submit} className="space-y-4">
      <StockAdjustmentCompany session={session} companies={companies} onChange={value => { session.changeCompany(value); setRows([]); }} />
      <StockAdjustmentFeedback session={session} onRefresh={refresh} />
      <div className="relative">
        <Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input aria-label="Buscar productos del conteo" type="search" value={search} onChange={event => { setSearch(event.target.value); setCollapsed(new Set()); }} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Buscar por nombre, proveedor o categoría..." className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-11 pr-10 py-3.5 text-sm focus:ring-2 focus:ring-orange-200 outline-none" />
        {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={16} /></button>}
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th scope="col" className="text-left px-3 sm:px-5 py-3 font-semibold">Producto</th>
              <th scope="col" className="text-right px-2 sm:px-4 py-3 font-semibold w-16 sm:w-24">Stock<br />actual</th>
              <th scope="col" className="hidden sm:table-cell text-center px-2 py-3 font-semibold w-24">Estado</th>
              <th scope="col" className="text-center px-3 sm:px-5 py-3 font-semibold w-28 sm:w-36">Stock físico<br />final</th>
            </tr>
          </thead>
          {groups.map(group => <tbody key={group.id}>
            <tr className="bg-gray-50/80 border-y border-gray-100">
              <td colSpan={4}>
                <button type="button" aria-expanded={!collapsed.has(group.id)} onClick={() => toggle(group.id)} className="flex items-center gap-2 w-full px-3 sm:px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-left">
                  {collapsed.has(group.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}{group.name} <span className="normal-case">({group.products.length})</span>
                </button>
              </td>
            </tr>
            {!collapsed.has(group.id) && group.products.map(product => {
              const row = entered.get(product.id);
              const current = row?.expectedQuantity ?? session.currentQuantities.get(product.id) ?? 0;
              const preview = row ? adjustmentPreview(row) : null;
              const invalid = !!row && !preview?.valid;
              return <tr key={product.id} className={`border-t border-gray-100 ${row ? 'bg-orange-50/30' : 'bg-white'}`}>
                <td className="px-3 sm:px-5 py-4">
                  <div className="font-semibold text-gray-800 leading-snug break-words">{product.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{[product.supplier, product.unit].filter(Boolean).join(' · ')}</div>
                </td>
                <td className={`px-2 sm:px-4 py-4 text-right font-semibold tabular-nums ${current === 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  {session.ready ? formatStockQuantity(current) : '—'}
                </td>
                <td className="hidden sm:table-cell px-2 py-4 text-center">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${current === 0 ? 'bg-red-50 border-red-200 text-red-600' : current <= 10 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                    {current === 0 ? 'Agotado' : current <= 10 ? 'Bajo' : 'OK'}
                  </span>
                </td>
                <td className="px-3 sm:px-5 py-3 text-center">
                  <input data-stock-count aria-label={`Stock físico final de ${product.name}`} aria-invalid={invalid || undefined} type="number" inputMode="decimal" min={0} max={1e12} step="0.000001" value={row?.quantity ?? ''} placeholder="Final" disabled={!session.ready || session.pending} onKeyDown={nextQuantity}
                    onChange={event => { const value = event.target.value; setRows(previous => updateStockCount(previous, product.id, value, session.currentQuantities.get(product.id) ?? 0)); session.setError(''); }}
                    className={`w-full min-w-0 px-2 py-3 text-center rounded-xl border outline-none focus:ring-2 focus:ring-orange-200 tabular-nums disabled:bg-gray-50 ${invalid ? 'border-red-400 text-red-700' : row ? 'border-orange-300 bg-white' : 'border-gray-200 bg-white'}`} />
                  {preview?.valid && <div className={`text-[10px] mt-1 ${preview.difference === 0 ? 'text-gray-500' : preview.difference > 0 ? 'text-green-700' : 'text-orange-700'}`}>
                    {preview.difference === 0 ? 'Sin diferencia' : `${preview.difference > 0 ? '+' : ''}${formatStockQuantity(preview.difference)}`}
                  </div>}
                  {invalid && <div className="text-[10px] mt-1 text-red-600">Revisa la cantidad</div>}
                </td>
              </tr>;
            })}
          </tbody>)}
          {!groups.length && <tbody><tr><td colSpan={4} className="text-center px-4 py-10 text-gray-500">No se encontraron productos.</td></tr></tbody>}
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500">
        <span>Los campos vacíos quedan sin modificar. Escribe 0 para dejar un producto sin stock.</span>
        <button type="button" disabled={session.loading || session.pending || !session.companyId} onClick={refresh} className="underline font-medium">Actualizar stock y revisar</button>
      </div>
      <details className="text-sm text-gray-600">
        <summary className="cursor-pointer text-xs font-medium">Motivo del conteo</summary>
        <input aria-label="Motivo del conteo" value={reason} maxLength={500} disabled={session.pending} onChange={event => setReason(event.target.value)} placeholder="Conteo físico de inventario" className="w-full mt-2 px-3 py-2 border rounded-lg text-sm" />
      </details>
    </form>
  </Modal>;
}
