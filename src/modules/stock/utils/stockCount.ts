import type { Category, Product } from '../../../shared/types';
import { adjustmentPreview, type StockAdjustmentRow } from './stockAdjustment';

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function stockCountGroups(products: Product[], categories: Category[], search: string) {
  const names = new Map(categories.map(category => [category.id, category.name]));
  const groups = new Map<string, { id: string; name: string; products: Product[] }>();
  const terms = searchable(search).split(/\s+/).filter(Boolean);
  for (const product of products) {
    if (!product.isActive) continue;
    const category = names.get(product.categoryId) || 'Sin categoría';
    const haystack = searchable([product.name, product.supplier, product.activeIngredient, ...(product.activeIngredients || []).map(item => item.name), category].filter(Boolean).join(' '));
    if (!terms.every(term => haystack.includes(term))) continue;
    const id = names.has(product.categoryId) ? product.categoryId : '__uncategorized';
    if (!groups.has(id)) groups.set(id, { id, name: category, products: [] });
    groups.get(id)!.products.push(product);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(group => ({ ...group, products: group.products.sort((a, b) => a.name.localeCompare(b.name, 'es')) }));
}

export function updateStockCount(rows: StockAdjustmentRow[], productId: string, quantity: string, currentQuantity: number): StockAdjustmentRow[] {
  if (!quantity.trim()) return rows.filter(row => row.productId !== productId);
  const existing = rows.find(row => row.productId === productId);
  if (existing) return rows.map(row => row.productId === productId ? { ...row, quantity } : row);
  return [...rows, { id: productId, productId, type: 'SET', movementKind: 'COUNT', quantity, expectedQuantity: currentQuantity, lotNumber: '', expirationDate: '' }];
}

export function stockCountSummary(rows: StockAdjustmentRow[]) {
  return { counted: rows.length, changed: rows.filter(row => { const preview = adjustmentPreview(row); return preview?.valid && preview.difference !== 0; }).length, valid: rows.length > 0 && rows.every(row => adjustmentPreview(row)?.valid) };
}
