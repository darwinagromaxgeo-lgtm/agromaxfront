import { useQuery } from '@tanstack/react-query';
import { stockService } from '../../stock/services/stockService';

export function usePOSStock(companyId: string, branchId: string | undefined) {
  return useQuery({
    queryKey: ['stock', companyId, branchId],
    queryFn: () => stockService.getAdjustmentSnapshot(companyId),
    enabled: !!companyId && !!branchId,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
  });
}
