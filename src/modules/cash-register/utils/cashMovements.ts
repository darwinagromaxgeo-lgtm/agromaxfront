import type { CashRegisterEntry } from '../../../shared/types';
import { cashMethodKey, entryPaymentMethod } from './cashSummary';

export function filterCashEntries(entries: CashRegisterEntry[], filters: { search: string; type: string; category: string; method: string; showDeleted: boolean }) {
  const search = filters.search.trim().toLocaleLowerCase('es');
  return entries.filter(e => (filters.showDeleted || !e.isDeleted)
    && (!filters.type || e.type === filters.type)
    && (!filters.category || e.category === filters.category)
    && (!filters.method || (cashMethodKey(entryPaymentMethod(e)) || '__unknown') === filters.method)
    && (!search || [e.description, e.referenceId, e.voucherSeries, e.voucherNumber, entryPaymentMethod(e), e.deleteReason].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(search)));
}

export function movementsCsv(entries: CashRegisterEntry[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s\uFEFF]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [
    ['Fecha y hora (Lima)', 'Tipo', 'Categoría', 'Descripción', 'Método', 'Monto S/', 'Estado', 'Referencia', 'Comprobante'],
    ...entries.map(e => [e.createdAt ? new Date(e.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '', e.type === 'INCOME' ? 'Ingreso' : 'Egreso', e.category, e.description, entryPaymentMethod(e) || 'Sin identificar', e.amount.toFixed(2), e.isDeleted ? 'Anulado' : 'Activo', e.referenceId, [e.voucherSeries, e.voucherNumber].filter(Boolean).join('-')]),
  ].map(row => row.map(cell).join(';')).join('\r\n');
}

export function downloadMovements(entries: CashRegisterEntry[], date: string) {
  const url = URL.createObjectURL(new Blob([movementsCsv(entries)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `Caja-${date}.csv`; link.click();
  URL.revokeObjectURL(url);
}
