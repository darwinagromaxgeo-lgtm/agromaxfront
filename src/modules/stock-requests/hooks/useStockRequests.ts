import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  stockRequestService,
  type CreateStockRequestPayload,
  type StockRequestFilters,
} from '../services/stockRequestService';

function errorMessage(error: any, fallback: string) {
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message[0] : message || fallback;
}

export function useStockAvailability(productId: string, companyId: string) {
  return useQuery({
    queryKey: ['stock-availability', productId, companyId],
    queryFn: () => stockRequestService.getAvailability(productId, companyId),
    enabled: Boolean(productId && companyId),
  });
}

export function useStockRequests(filters?: StockRequestFilters) {
  return useQuery({
    queryKey: ['stock-requests', filters],
    queryFn: () => stockRequestService.getAll(filters),
  });
}

function useRequestMutation<T>(
  mutationFn: (payload: T) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests'] });
      queryClient.invalidateQueries({ queryKey: ['stock-availability'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['product-lots'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success(successMessage);
    },
    onError: (error: any) => toast.error(errorMessage(error, 'No se pudo completar la operación')),
  });
}

export function useCreateStockRequest() {
  return useRequestMutation<CreateStockRequestPayload>(
    stockRequestService.create,
    'Solicitud enviada',
  );
}

export function useApproveStockRequest() {
  return useRequestMutation<{ id: string; notes?: string }>(
    ({ id, notes }) => stockRequestService.approve(id, notes),
    'Solicitud aprobada',
  );
}

export function useRejectStockRequest() {
  return useRequestMutation<{ id: string; reason: string }>(
    ({ id, reason }) => stockRequestService.reject(id, reason),
    'Solicitud rechazada',
  );
}

export function useDispatchStockRequest() {
  return useRequestMutation<string>(
    stockRequestService.dispatch,
    'Productos despachados',
  );
}

export function useReceiveStockRequest() {
  return useRequestMutation<string>(
    stockRequestService.receive,
    'Recepción confirmada',
  );
}

export function useCancelStockRequest() {
  return useRequestMutation<string>(
    stockRequestService.cancel,
    'Solicitud cancelada',
  );
}
