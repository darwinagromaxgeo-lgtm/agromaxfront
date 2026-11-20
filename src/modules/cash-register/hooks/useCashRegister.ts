import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashRegisterService } from '../services/cashRegisterService';
import toast from 'react-hot-toast';

export function useCashRegisterToday() {
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  return useQuery({
    queryKey: ['cash-register-today', todayKey],
    queryFn: () => cashRegisterService.getToday(),
    refetchInterval: 30 * 1000,
  });
}
export function useOpenCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: any) => cashRegisterService.open(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); toast.success('Caja abierta'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error al abrir caja'),
  });
}
export function useCashRegisters(params?: any) {
  return useQuery({ queryKey: ['cash-registers', params], queryFn: () => cashRegisterService.getAll(params) });
}
export function useCashRegisterById(id: string) {
  return useQuery({ queryKey: ['cash-register', id], queryFn: () => cashRegisterService.getById(id), enabled: !!id });
}
export function useAddCashEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registerId, data }: { registerId: string; data: any }) => cashRegisterService.addEntry(registerId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Movimiento registrado'); },
    onError: (err: any) => { if (err.response?.status === 409) { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); } toast.error(err.response?.data?.message || 'Error'); },
  });
}
export function useEditCashEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registerId, entryId, data }: { registerId: string; entryId: string; data: any }) => cashRegisterService.editEntry(registerId, entryId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Movimiento actualizado'); },
    onError: (err: any) => { if (err.response?.status === 409) { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); } toast.error(err.response?.data?.message || 'Error'); },
  });
}
export function useDeleteCashEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registerId, entryId, data }: { registerId: string; entryId: string; data: any }) => cashRegisterService.deleteEntry(registerId, entryId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-register-today'] });
      qc.invalidateQueries({ queryKey: ['cash-registers'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Movimiento anulado');
    },
    onError: (err: any) => { if (err.response?.status === 409) { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); } toast.error(err.response?.data?.message || 'Error'); },
  });
}
export function useCloseCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registerId, data }: { registerId: string; data?: any }) => cashRegisterService.close(registerId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Caja cerrada'); },
    onError: (err: any) => { if (err.response?.status === 409) { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); } toast.error(err.response?.data?.message || 'Error'); },
  });
}
export function useAdjustOpeningBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registerId, data }: { registerId: string; data: { openingBalance: number; reason: string } }) =>
      cashRegisterService.adjustOpening(registerId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); qc.invalidateQueries({ queryKey: ['cash-register'] }); toast.success('Apertura ajustada'); },
    onError: (err: any) => { if (err.response?.status === 409) { qc.invalidateQueries({ queryKey: ['cash-register-today'] }); qc.invalidateQueries({ queryKey: ['cash-registers'] }); } toast.error(err.response?.data?.message || 'Error'); },
  });
}
