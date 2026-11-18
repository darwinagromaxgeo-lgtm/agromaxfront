import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quoteService } from '../services/quoteService';
import toast from 'react-hot-toast';

export function useQuotes(params?: any) {
  return useQuery({ queryKey: ['quotes', params], queryFn: () => quoteService.getAll(params) });
}

export function useQuote(id: string | undefined) {
  return useQuery({ queryKey: ['quote', id], queryFn: () => quoteService.getById(id!), enabled: !!id });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quoteService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast.success('Cotización creada'); },
    onError: (err: any) => toast.error(err.response?.data?.message?.[0] || err.response?.data?.message || 'Error al crear cotización'),
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quoteService.setStatus,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast.success('Estado actualizado'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error'),
  });
}

export function useConvertQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quoteService.convert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['credits'] });
      qc.invalidateQueries({ queryKey: ['credit'] });
      qc.invalidateQueries({ queryKey: ['cash-register-today'] });
      qc.invalidateQueries({ queryKey: ['product-lots'] });
      qc.invalidateQueries({ queryKey: ['kardex'] });
      toast.success('Cotización convertida en venta');
    },
    onError: (err: any) => toast.error(err.response?.data?.message?.[0] || err.response?.data?.message || 'Error al convertir'),
  });
}
