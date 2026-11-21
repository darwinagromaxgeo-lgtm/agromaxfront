import { api } from '../../../shared/services/api';
import type { StockAdjustmentBatchInput } from '../utils/stockAdjustment';
import type { StockAdjustment } from '../../../shared/types';
export interface StockAdjustmentBatchResult { requestId: string; adjustments: StockAdjustment[]; unchangedProductIds: string[]; }
export const stockAdjustmentService = {
  getAll: (params?: any) => api.get('/stock-adjustments', { params }).then((r) => r.data.data),
  create: (data: any) => api.post('/stock-adjustments', data).then((r) => r.data.data),
  createBatch: (data: StockAdjustmentBatchInput): Promise<StockAdjustmentBatchResult> => api.post('/stock-adjustments/batch', data).then((r) => r.data.data),
};
