import { api } from '../../../shared/services/api';
import type {
  PaginatedResponse,
  StockAvailability,
  StockRequest,
  StockRequestStatus,
} from '../../../shared/types';

export interface StockRequestFilters {
  status?: StockRequestStatus;
  direction?: 'incoming' | 'outgoing';
  page?: number;
  limit?: number;
}

export interface CreateStockRequestPayload {
  sourceBranchId: string;
  companyId: string;
  items: Array<{ productId: string; quantity: number }>;
  notes?: string;
}

export const stockRequestService = {
  getAvailability: (productId: string, companyId: string) =>
    api.get(`/stock/availability/${productId}`, { params: { companyId } })
      .then((response) => response.data.data as StockAvailability),

  getAll: (filters?: StockRequestFilters) =>
    api.get('/stock-requests', { params: filters })
      .then((response) => response.data.data as PaginatedResponse<StockRequest>),

  create: (payload: CreateStockRequestPayload) =>
    api.post('/stock-requests', payload)
      .then((response) => response.data.data as StockRequest),

  approve: (id: string, notes?: string) =>
    api.patch(`/stock-requests/${id}/approve`, { notes })
      .then((response) => response.data.data as StockRequest),

  reject: (id: string, reason: string) =>
    api.patch(`/stock-requests/${id}/reject`, { reason })
      .then((response) => response.data.data as StockRequest),

  dispatch: (id: string) =>
    api.patch(`/stock-requests/${id}/dispatch`)
      .then((response) => response.data.data as StockRequest),

  receive: (id: string) =>
    api.patch(`/stock-requests/${id}/receive`)
      .then((response) => response.data.data as StockRequest),

  cancel: (id: string) =>
    api.patch(`/stock-requests/${id}/cancel`)
      .then((response) => response.data.data as StockRequest),
};
