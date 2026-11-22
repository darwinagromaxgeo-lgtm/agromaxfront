import { api } from '../../../shared/services/api';

export interface BranchTransferPayload {
  requestId: string;
  fromBranchId: string;
  toBranchId: string;
  companyId: string;
  items: { productId: string; quantity: number }[];
  notes?: string;
}
export interface BranchTransfer {
  id: string; reference: string; fromBranchId: string; fromBranchName: string; toBranchId: string; toBranchName: string;
  companyId: string; companyName: string; status: 'COMPLETED'; notes?: string; transferredBy: string; transferredByName: string; createdAt: string;
  items: { productId: string; productName: string; unit: string; quantity: number; sourcePrevious: number; sourceCurrent: number; destinationPrevious: number; destinationCurrent: number; lots: { lotNumber: string; quantity: number; expirationDate?: string }[] }[];
}
export const branchTransferService = {
  findByRequest: (requestId: string) => api.get(`/stock/branch-transfers/request/${requestId}`).then(response => response.data.data as BranchTransfer | null),
  list: (branchId: string, page: number) => api.get('/stock/branch-transfers', { params: { branchId: branchId || undefined, page, limit: 20 } }).then(response => response.data.data as { data: BranchTransfer[]; total: number }),
  create: (payload: BranchTransferPayload) => api.post('/stock/branch-transfers', payload).then(response => response.data.data as BranchTransfer),
};
