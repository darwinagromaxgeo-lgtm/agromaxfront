import type { CashRegisterEntry } from '../../../shared/types';
import * as XLSX from 'xlsx';
import { cashMethodKey, entryPaymentMethod } from './cashSummary';

export function filterCashEntries(entries: CashRegisterEntry[], filters: { search: string; type: string; category: string; method: string; showDeleted: boolean }) {
  const search = filters.search.trim().toLocaleLowerCase('es');
  return entries.filter(e => (filters.showDeleted || !e.isDeleted)
    && (!filters.type || e.type === filters.type)
    && (!filters.category || e.category === filters.category)
    && (!filters.method || (cashMethodKey(entryPaymentMethod(e)) || '__unknown') === filters.method)
    && (!search || [e.description, e.referenceId, e.voucherSeries, e.voucherNumber, entryPaymentMethod(e), e.deleteReason].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(search)));
}

export function movementsWorkbook(entries: CashRegisterEntry[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Fecha y hora (Lima)', 'Tipo', 'Categoría', 'Descripción', 'Método', 'Monto S/', 'Estado', 'Referencia', 'Comprobante'],
    ...entries.map(e => [e.createdAt ? new Date(e.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '', e.type === 'INCOME' ? 'Ingreso' : 'Egreso', e.category, e.description, entryPaymentMethod(e) || 'Sin identificar', e.amount, e.isDeleted ? 'Anulado' : 'Activo', e.referenceId || '', [e.voucherSeries, e.voucherNumber].filter(Boolean).join('-')]),
  ]);
  sheet['!cols'] = [22, 12, 23, 60, 22, 16, 12, 28, 24].map(wch => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref']! };
  entries.forEach((_, index) => { sheet[`F${index + 2}`].z = '#,##0.00'; });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Movimientos');
  return workbook;
}

export function downloadMovements(entries: CashRegisterEntry[], date: string) {
  XLSX.writeFile(movementsWorkbook(entries), `Caja-${date}.xlsx`, { bookType: 'xlsx', compression: true });
}
