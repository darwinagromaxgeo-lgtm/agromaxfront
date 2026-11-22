import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchTransferService, type BranchTransferPayload } from '../services/branchTransferService';

export function useBranchTransfers(branchId: string, page: number) {
  return useQuery({ queryKey: ['branch-transfers', branchId, page], queryFn: () => branchTransferService.list(branchId, page) });
}
export function useCreateBranchTransfer() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ payload, checkFirst }: { payload: BranchTransferPayload; checkFirst: boolean }) => {
    const existing = checkFirst ? await branchTransferService.findByRequest(payload.requestId) : null;
    return existing || branchTransferService.create(payload);
  }, onSuccess: () => {
    for (const key of ['branch-transfers', 'stock', 'stock-availability', 'stock-movements', 'product-lots']) client.invalidateQueries({ queryKey: [key] });
  }, onError: () => { client.invalidateQueries({ queryKey: ['stock-availability'] }); } });
}
