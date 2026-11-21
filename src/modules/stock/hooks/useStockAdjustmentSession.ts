import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product } from '../../../shared/types';
import { productLotService } from '../services/productLotService';
import { stockService } from '../services/stockService';
import { useCreateStockAdjustmentBatch } from './useStockAdjustments';
import { buildStockAdjustmentBatch, stockQuantity, type StockAdjustmentRow } from '../utils/stockAdjustment';

export function useStockAdjustmentSession(products: Product[], initialCompanyId: string) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const request = useRef<{ fingerprint: string; id: string }>();
  const saving = useRef(false);
  const mutation = useCreateStockAdjustmentBatch();
  const stocks = useQuery({ queryKey: ['stock', companyId, 'adjustment-snapshot'], queryFn: () => stockService.getAdjustmentSnapshot(companyId), enabled: !!companyId, refetchOnMount: 'always' });
  const lots = useQuery({ queryKey: ['product-lots', companyId, undefined], queryFn: () => productLotService.getByCompany(companyId), enabled: !!companyId, refetchOnMount: 'always' });
  const loading = !!companyId && (stocks.isFetching || lots.isFetching);
  const loadFailed = stocks.isError || lots.isError;
  const ready = !!companyId && stocks.isSuccess && lots.isSuccess && !loading && !loadFailed;
  const quantities = (stockData = stocks.data, lotsData = lots.data) => {
    const raw = new Map((stockData?.data || []).map(stock => [stock.productId, stock.quantity]));
    const totals = new Map<string, number>();
    for (const lot of lotsData || []) if (lot.isActive && lot.currentQuantity > 0) totals.set(lot.productId, (totals.get(lot.productId) || 0) + lot.currentQuantity);
    return new Map(products.filter(product => product.isActive).map(product => [product.id, stockQuantity(product.tracksLot ? totals.get(product.id) || 0 : raw.get(product.id) || 0)]));
  };
  const currentQuantities = quantities();
  const changeCompany = (value: string) => {
    setCompanyId(value); setError(''); setNotice(''); setNeedsReview(false); request.current = undefined;
  };
  const refresh = async () => {
    const [stockResult, lotResult] = await Promise.all([stocks.refetch(), lots.refetch()]);
    if (stockResult.isError || lotResult.isError) { setError('No se pudo actualizar el inventario. Intenta otra vez.'); return; }
    setError(''); setNeedsReview(false); setNotice('Stock actualizado. Revisa las cantidades finales antes de guardar.');
    return quantities(stockResult.data, lotResult.data);
  };
  const save = async (rows: StockAdjustmentRow[], reason: string, allowUnchanged = false) => {
    if (saving.current || !ready || needsReview) return false;
    setError(''); setNotice('');
    try {
      const payload = buildStockAdjustmentBatch(companyId, reason, rows, '', allowUnchanged);
      const fingerprint = JSON.stringify(payload);
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
      payload.requestId = request.current.id;
      saving.current = true;
      await mutation.mutateAsync(payload);
      return true;
    } catch (failure: any) {
      const message = failure.response?.data?.message;
      setError((Array.isArray(message) ? message.join('. ') : message) || failure.message || 'No se pudo guardar el ajuste.');
      if (failure.response?.status === 409) setNeedsReview(true);
      return false;
    } finally { saving.current = false; }
  };
  const setInputError = (value: string) => { if (value || !needsReview) setError(value); };
  return { companyId, changeCompany, currentQuantities, ready, loading, loadFailed, error, notice, setError: setInputError, needsReview, refresh, save, pending: mutation.isPending, isSaving: () => saving.current };
}
