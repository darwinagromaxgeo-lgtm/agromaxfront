import { api } from '../../../shared/services/api';
import type { PaginatedResponse, Stock } from '../../../shared/types';
export const stockService = {
  getByCompany: (companyId: string, params?: any) => api.get(`/stock/company/${companyId}`, { params }).then((r) => r.data.data),
  getAdjustmentSnapshot: async (companyId: string): Promise<PaginatedResponse<Stock>> => {
    const data: Stock[] = [];
    let total = 0;
    for (let page = 1; ; page++) {
      const response = await api.get(`/stock/company/${companyId}`, { params: { page, limit: 1000 } });
      const result: PaginatedResponse<Stock> = response.data.data;
      data.push(...result.data);
      total = result.total;
      if (data.length >= total) return { data, total };
      if (!result.data.length) throw new Error('No se pudo cargar todo el inventario');
    }
  },
  transfer: (data: any) => api.post('/stock/transfer', data).then((r) => r.data.data),
  getAlerts: (companyId: string, threshold?: number) => api.get(`/stock/alerts/${companyId}`, { params: { threshold } }).then((r) => r.data.data),
};
