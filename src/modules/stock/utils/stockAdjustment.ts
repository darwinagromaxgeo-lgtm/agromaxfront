export type StockAdjustmentMode = 'SET' | 'INCREASE' | 'DECREASE';
export interface StockAdjustmentRow {
  id: string;
  productId: string;
  type: StockAdjustmentMode;
  quantity: string;
  expectedQuantity?: number;
  lotNumber: string;
  expirationDate: string;
}
export interface StockAdjustmentBatchInput {
  companyId: string;
  requestId: string;
  reason: string;
  items: { productId: string; type: StockAdjustmentMode; quantity: number; expectedQuantity: number; lotNumber?: string; expirationDate?: string }[];
}

export const stockQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
export const formatStockQuantity = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 6 });

export function adjustmentPreview(row: Pick<StockAdjustmentRow, 'type' | 'quantity' | 'expectedQuantity'>) {
  const quantity = row.quantity.trim() === '' ? NaN : Number(row.quantity);
  const current = row.expectedQuantity;
  if (current === undefined || !Number.isFinite(quantity) || quantity < 0 || quantity > 1e12 || (row.type !== 'SET' && quantity === 0) || Math.abs(quantity - stockQuantity(quantity)) > 1e-9) return null;
  const final = stockQuantity(row.type === 'SET' ? quantity : current + (row.type === 'INCREASE' ? quantity : -quantity));
  return { current, final, difference: stockQuantity(final - current), valid: final >= 0 && final <= 1e12 };
}

export function buildStockAdjustmentBatch(companyId: string, reason: string, rows: StockAdjustmentRow[], requestId: string): StockAdjustmentBatchInput {
  if (!companyId) throw new Error('Selecciona una empresa');
  if (!reason.trim()) throw new Error('Escribe el motivo del ajuste');
  if (!rows.length || rows.length > 100) throw new Error('Agrega entre 1 y 100 productos');
  const selected = new Set<string>();
  const items = rows.map((row, index) => {
    if (!row.productId) throw new Error(`Selecciona el producto de la fila ${index + 1}`);
    if (selected.has(row.productId)) throw new Error('Cada producto debe aparecer una sola vez');
    selected.add(row.productId);
    const preview = adjustmentPreview(row);
    if (!preview?.valid) throw new Error(`Revisa la cantidad de la fila ${index + 1}. El stock final no puede ser negativo.`);
    return {
      productId: row.productId, type: row.type, quantity: Number(row.quantity), expectedQuantity: preview.current,
      ...(preview.difference > 0 && row.lotNumber.trim() ? { lotNumber: row.lotNumber.trim() } : {}),
      ...(preview.difference > 0 && row.expirationDate ? { expirationDate: row.expirationDate } : {}),
    };
  });
  if (rows.every(row => adjustmentPreview(row)?.difference === 0)) throw new Error('Las cantidades ya coinciden con el stock actual');
  return { companyId, reason: reason.trim(), requestId, items };
}
