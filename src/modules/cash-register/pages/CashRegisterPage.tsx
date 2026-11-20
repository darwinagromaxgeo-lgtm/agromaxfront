import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCashRegisterToday, useOpenCashRegister, useAddCashEntry, useEditCashEntry, useDeleteCashEntry, useCloseCashRegister, useAdjustOpeningBalance } from '../hooks/useCashRegister';
import { usePaymentMethods } from '../../payment-methods/hooks/usePaymentMethods';
import { useRucLookup } from '../../../shared/hooks/useLookup';
import { useSupplierByRuc, useCreateSupplier } from '../../suppliers/hooks/useSuppliers';
import { Modal } from '../../../shared/components/Modal';
import { Wallet, TrendingUp, TrendingDown, Edit2, Trash2, Lock, History, ChevronDown, ChevronRight, Layers, Search, Loader2, SlidersHorizontal, Receipt, RefreshCw, Download } from 'lucide-react';
import type { CashRegister, CashRegisterEntry, PaymentMethod } from '../../../shared/types';
import { groupEntries } from '../utils/groupEntries';
import { CashOverview, cashCategoryLabels } from '../components/CashOverview';
import { CashCloseForm } from '../components/CashCloseForm';
import { entryPaymentMethod, cashMethodKey, summarizeCash } from '../utils/cashSummary';
import { filterCashEntries, downloadMovements } from '../utils/cashMovements';

export function CashRegisterPage() {
  const { data: register, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useCashRegisterToday();
  const openCashRegister = useOpenCashRegister();
  const addEntry = useAddCashEntry();
  const editEntry = useEditCashEntry();
  const deleteEntryMutation = useDeleteCashEntry();
  const closeRegister = useCloseCashRegister();
  const adjustOpening = useAdjustOpeningBalance();

  const [openingAmount, setOpeningAmount] = useState(0);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ openingBalance: 0, reason: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashRegister | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CashRegisterEntry | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: methodsData } = usePaymentMethods();
  const paymentMethods: PaymentMethod[] = methodsData || [];
  const rucLookup = useRucLookup();
  const supplierByRuc = useSupplierByRuc();
  const createSupplier = useCreateSupplier();

  const [addForm, setAddForm] = useState({ type: 'INCOME' as string, category: 'OTHER' as string, description: '', amount: 0, voucherType: 'NONE' as string, voucherSeries: '', voucherNumber: '', paymentMethodId: '', remisionSerie: '', remisionCorrelativo: '', remisionFecha: '' });
  const [editForm, setEditForm] = useState({ amount: 0, reason: '', paymentMethodId: '', voucherType: 'NONE' as string, voucherSeries: '', voucherNumber: '' });
  const [deleteReason, setDeleteReason] = useState('');
  const [filters, setFilters] = useState({ search: '', type: '', category: '', method: '', showDeleted: false });
  const [rucInput, setRucInput] = useState('');
  const [rucFound, setRucFound] = useState('');
  const [rucLoading, setRucLoading] = useState(false);

  const isClosed = register?.status === 'CLOSED';
  const entries: CashRegisterEntry[] = register?.entries || [];
  const activeEntries = entries.filter(e => !e.isDeleted);
  const summary = summarizeCash(register?.openingBalance || 0, entries);
  const netBalance = summary.balance;
  const filteredEntries = filterCashEntries(entries, filters);

  const openAddIncome = () => { setAddForm({ type: 'INCOME', category: 'OTHER', description: '', amount: 0, voucherType: 'NONE', voucherSeries: '', voucherNumber: '', paymentMethodId: '', remisionSerie: '', remisionCorrelativo: '', remisionFecha: '' }); setShowAddModal(true); };
  const openAddExpense = () => { setAddForm({ type: 'EXPENSE', category: 'OPERATING_EXPENSE', description: '', amount: 0, voucherType: 'NONE', voucherSeries: '', voucherNumber: '', paymentMethodId: paymentMethods.find(pm => cashMethodKey(pm.name) === 'efectivo' && pm.isActive)?.id || '', remisionSerie: '', remisionCorrelativo: '', remisionFecha: '' }); setRucInput(''); setRucFound(''); setShowAddModal(true); };
  const openEdit = (entry: CashRegisterEntry) => { setSelectedEntry(entry); setEditForm({ amount: entry.amount, reason: '', paymentMethodId: entry.paymentMethodId || '', voucherType: entry.voucherType || 'NONE', voucherSeries: entry.voucherSeries || '', voucherNumber: entry.voucherNumber || '' }); setShowEditModal(true); };
  const openDelete = (entry: CashRegisterEntry) => { setSelectedEntry(entry); setDeleteReason(''); setShowDeleteModal(true); };

  const handleRucLookup = async () => {
    const ruc = rucInput.trim();
    if (ruc.length !== 11) return;
    setRucLoading(true);
    try {
      const local = await supplierByRuc.mutateAsync(ruc);
      if (local) { setRucFound(local.businessName); setAddForm((prev) => ({ ...prev, description: local.businessName })); setRucLoading(false); return; }
    } catch { /* not found locally */ }
    try {
      const result = await rucLookup.mutateAsync(ruc);
      if (result?.razonSocial) {
        await createSupplier.mutateAsync({ ruc, businessName: result.razonSocial, address: result.direccion || '' });
        setRucFound(result.razonSocial);
        setAddForm((prev) => ({ ...prev, description: result.razonSocial }));
      }
    } catch { } finally { setRucLoading(false); }
  };

  const handleOpen = async (e: React.FormEvent) => { e.preventDefault(); await openCashRegister.mutateAsync({ openingBalance: openingAmount }); };
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { remisionSerie, remisionCorrelativo, remisionFecha, ...rest } = addForm;
    const hasRemision = addForm.type === 'EXPENSE' && addForm.voucherType === 'FACTURA' && remisionSerie && remisionCorrelativo && remisionFecha;
    await addEntry.mutateAsync({ registerId: register.id, data: { ...rest, description: rest.description.trim(), ...(hasRemision ? { remisionGuia: { serie: remisionSerie, correlativo: remisionCorrelativo, fecha: remisionFecha } } : {}) } });
    setShowAddModal(false);
  };
  const handleEdit = async (e: React.FormEvent) => { e.preventDefault(); await editEntry.mutateAsync({ registerId: register.id, entryId: selectedEntry!.id, data: { ...editForm, paymentMethodId: editForm.paymentMethodId || undefined } }); setShowEditModal(false); };
  const handleDelete = async (e: React.FormEvent) => { e.preventDefault(); await deleteEntryMutation.mutateAsync({ registerId: register.id, entryId: selectedEntry!.id, data: { reason: deleteReason } }); setShowDeleteModal(false); };
  const categoryLabels = cashCategoryLabels;
  const groupedRows = useMemo(() => groupEntries([...filteredEntries].reverse()), [entries, filters]);

  // ── Entry row ──────────────────────────────────────────────────────────────
  const renderEntryRow = (entry: CashRegisterEntry, nested: boolean, key: React.Key) => (
    <tr key={key} className={`border-b border-gray-50 transition-colors
      ${entry.isDeleted ? 'opacity-40 bg-red-50/30' : entry.type === 'INCOME' ? 'hover:bg-primary-50/40' : 'hover:bg-red-50/40'}
      ${nested ? 'bg-gray-50/40' : ''}`}>
      <td className={`px-4 py-3 ${nested ? 'pl-10' : ''}`}>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
          ${entry.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
          {entry.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {entry.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
        </span>
        {entry.createdAt && (
          <div className="text-[10px] text-gray-400 mt-1 font-mono">
            {new Date(entry.createdAt).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
          {categoryLabels[entry.category] || entry.category}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-700 leading-snug">
          {entry.description.replace(/\s*\[.*?\]\s*$/, '')}
          {entry.referenceId && <div className="mt-1 text-xs text-gray-500">Referencia: <span className="font-mono" title={entry.referenceId}>{entry.referenceId.slice(-8)}</span> · <Link className="font-semibold text-primary-700 hover:underline" to={entry.referenceType === 'Sale' ? '/sales' : '/credits'}>{entry.referenceType === 'Sale' ? 'Ver ventas' : 'Ver créditos'}</Link></div>}
        </div>
        {entry.isDeleted && <div className="text-xs text-red-500 mt-0.5 font-medium">✕ Anulado: {entry.deleteReason}</div>}
        {!entry.isDeleted && entry.editHistory?.length > 0 && (
          <div className="text-[10px] text-blue-500 mt-0.5">Editado {entry.editHistory.length}×</div>
        )}
      </td>
      <td className="px-4 py-3">
        {(() => {
          const method = entryPaymentMethod(entry);
          return method
            ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{method}</span>
            : <span className="text-amber-700 text-xs">Sin identificar</span>;
        })()}
      </td>
      <td className={`px-4 py-3 text-right font-bold ${entry.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
        <span className="text-xs font-normal opacity-60 mr-0.5">{entry.type === 'INCOME' ? '+' : '−'}</span>
        S/ {entry.amount.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-center">
        {entry.voucherType === 'BOLETA' ? (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100 text-primary-700">Boleta</span>
            {entry.voucherSeries && entry.voucherNumber && <span className="text-[10px] text-gray-400 font-mono">{entry.voucherSeries}-{entry.voucherNumber}</span>}
          </div>
        ) : entry.voucherType === 'FACTURA' ? (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">Factura</span>
            {entry.voucherSeries && entry.voucherNumber && <span className="text-[10px] text-gray-400 font-mono">{entry.voucherSeries}-{entry.voucherNumber}</span>}
            {entry.remisionGuia && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5 font-medium">
                G.R. {entry.remisionGuia.serie}-{entry.remisionGuia.correlativo}
              </span>
            )}
          </div>
        ) : <span className="text-gray-300 text-xs">—</span>}
      </td>
      {!isClosed && (
        <td className="px-4 py-3">
          {!entry.isDeleted && !nested && (
            <div className="flex gap-1 justify-center">
              <button onClick={() => openEdit(entry)} title="Editar"
                className="p-1.5 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                <Edit2 size={13} />
              </button>
              <button disabled={!!entry.referenceId} onClick={() => openDelete(entry)} title={entry.referenceId ? 'Revisa este cobro desde Ventas o Créditos' : 'Anular movimiento manual'}
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );

  // ── Mobile entry card ─────────────────────────────────────────────────────
  const renderEntryCard = (entry: CashRegisterEntry, nested: boolean, key: React.Key) => (
    <div key={key} className={`px-4 py-3.5 transition-colors
      ${entry.isDeleted ? 'opacity-40 bg-red-50/30' : entry.type === 'INCOME' ? 'hover:bg-primary-50/30' : 'hover:bg-red-50/30'}
      ${nested ? 'border-l-4 border-gray-200 bg-gray-50/50 pl-5' : ''}`}>
      {/* Tipo + categoría + hora + monto */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
            ${entry.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
            {entry.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {entry.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
          </span>
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
            {categoryLabels[entry.category] || entry.category}
          </span>
          {entry.createdAt && (
            <span className="text-[10px] text-gray-400 font-mono">
              {new Date(entry.createdAt).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${entry.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
          <span className="text-xs font-normal opacity-60 mr-0.5">{entry.type === 'INCOME' ? '+' : '−'}</span>
          S/ {entry.amount.toFixed(2)}
        </span>
      </div>
      {/* Descripción */}
      <div className="text-sm text-gray-700 leading-snug mb-2">
        {entry.description.replace(/\s*\[.*?\]\s*$/, '')}
          {entry.referenceId && <div className="mt-1 text-xs text-gray-500">Referencia: <span className="font-mono" title={entry.referenceId}>{entry.referenceId.slice(-8)}</span> · <Link className="font-semibold text-primary-700 hover:underline" to={entry.referenceType === 'Sale' ? '/sales' : '/credits'}>{entry.referenceType === 'Sale' ? 'Ver ventas' : 'Ver créditos'}</Link></div>}
        {entry.isDeleted && <span className="text-xs text-red-500 ml-1.5 font-medium">✕ {entry.deleteReason}</span>}
        {!entry.isDeleted && entry.editHistory?.length > 0 && (
          <span className="text-[10px] text-blue-500 ml-1.5">Editado {entry.editHistory.length}×</span>
        )}
      </div>
      {/* Método + comprobante + acciones */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(() => { const method = entryPaymentMethod(entry); return method ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{method}</span> : null; })()}
          {entry.voucherType === 'BOLETA' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100 text-primary-700">
              Boleta{entry.voucherSeries && entry.voucherNumber ? ` ${entry.voucherSeries}-${entry.voucherNumber}` : ''}
            </span>
          )}
          {entry.voucherType === 'FACTURA' && (
            <>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                Factura{entry.voucherSeries && entry.voucherNumber ? ` ${entry.voucherSeries}-${entry.voucherNumber}` : ''}
              </span>
              {entry.remisionGuia && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
                  G.R. {entry.remisionGuia.serie}-{entry.remisionGuia.correlativo}
                </span>
              )}
            </>
          )}
        </div>
        {!isClosed && !entry.isDeleted && !nested && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => openEdit(entry)}
              className="p-2 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
              <Edit2 size={14} />
            </button>
            <button disabled={!!entry.referenceId} title={entry.referenceId ? 'Revisa este cobro desde Ventas o Créditos' : 'Anular movimiento manual'} onClick={() => openDelete(entry)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  if (isError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">No se pudo cargar Caja. <button onClick={() => void refetch()} className="font-bold underline">Volver a intentar</button></div>;

  // ── Sin caja ───────────────────────────────────────────────────────────────
  if (!register) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-50 rounded-2xl mb-5">
            <Wallet size={32} className="text-primary-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">No hay caja abierta</h2>
          <p className="text-sm text-gray-500 mb-6">Ingresa el monto inicial para abrir la caja del día</p>
          <form onSubmit={handleOpen} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Monto inicial (S/)</label>
              <input
                type="number" min="0" step="0.01"
                value={openingAmount || ''}
                onChange={e => setOpeningAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl font-bold text-gray-800 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                placeholder="0.00"
              />
            </div>
            <button type="submit" disabled={openCashRegister.isPending}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-semibold disabled:opacity-50 transition-colors shadow-sm shadow-primary-200">
              <Wallet size={18} />
              {openCashRegister.isPending ? 'Abriendo...' : 'Abrir Caja'}
            </button>
          </form>
          <Link to="/cash-register/history"
            className="inline-flex items-center gap-1.5 mt-5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <History size={14} /> Ver historial de cajas
          </Link>
        </div>
      </div>
    );
  }

  // ── Caja abierta / cerrada ─────────────────────────────────────────────────
  const formattedDate = new Date(register.date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet size={22} className="text-primary-600" /> Caja del Día
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm text-gray-500 capitalize">{formattedDate}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${isClosed ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}`}>
              {isClosed ? '● CERRADA' : '● ABIERTA'}
            </span>
          </div>
        </div>
        {!isClosed && (
          <>
            {/* Mobile: grid 2×2 */}
            <div className="grid grid-cols-2 gap-2 sm:hidden">
              <button onClick={openAddIncome}
                className="flex items-center justify-center gap-2 py-3.5 bg-primary-600 text-white rounded-xl text-sm font-semibold shadow-sm shadow-primary-200 active:scale-[0.97] transition-all">
                <TrendingUp size={17} /> Ingreso
              </button>
              <button onClick={openAddExpense}
                className="flex items-center justify-center gap-2 py-3.5 bg-red-500 text-white rounded-xl text-sm font-semibold shadow-sm shadow-red-200 active:scale-[0.97] transition-all">
                <TrendingDown size={17} /> Egreso
              </button>
              <button onClick={() => { setAdjustForm({ openingBalance: register?.openingBalance || 0, reason: '' }); setShowAdjustModal(true); }}
                className="flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold shadow-sm shadow-amber-200 active:scale-[0.97] transition-all">
                <SlidersHorizontal size={15} /> Ajuste
              </button>
              <button onClick={() => { setCloseTarget(register); setShowCloseModal(true); }}
                className="flex items-center justify-center gap-2 py-2.5 bg-gray-700 text-white rounded-xl text-sm font-semibold active:scale-[0.97] transition-all">
                <Lock size={15} /> Cerrar Caja
              </button>
            </div>
            {/* Tablet / Desktop: fila */}
            <div className="hidden sm:flex flex-wrap gap-2">
              <button onClick={openAddIncome}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-semibold shadow-sm shadow-primary-200 transition-colors">
                <TrendingUp size={15} /> Ingreso
              </button>
              <button onClick={openAddExpense}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-semibold shadow-sm shadow-red-200 transition-colors">
                <TrendingDown size={15} /> Egreso
              </button>
              <button onClick={() => { setAdjustForm({ openingBalance: register?.openingBalance || 0, reason: '' }); setShowAdjustModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 text-sm font-semibold shadow-sm shadow-amber-200 transition-colors">
                <SlidersHorizontal size={15} /> Ajuste
              </button>
              <button onClick={() => { setCloseTarget(register); setShowCloseModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-800 text-sm font-semibold transition-colors">
                <Lock size={15} /> Cerrar Caja
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nav tabs */}
      <div className="flex gap-2 mb-6">
        <span className="px-4 py-2 bg-primary-600 text-white rounded-full text-sm font-semibold shadow-sm shadow-primary-200">
          Hoy
        </span>
        <Link to="/cash-register/history"
          className="flex items-center gap-1.5 px-4 py-2 text-gray-500 hover:text-gray-700 rounded-full text-sm font-medium border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">
          <History size={14} /> Historial de Cajas
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>Actualizado: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-PE', { timeZone: 'America/Lima' }) : '—'} · Se actualiza automáticamente</span>
        <button onClick={() => void refetch()} disabled={isFetching} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"><RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Actualizar</button>
      </div>
      <CashOverview register={register} />
      <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-gray-600">Buscar movimiento<input value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="Producto, descripción, referencia…" className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-normal" /></label>
          <label className="text-xs font-semibold text-gray-600">Tipo<select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-normal"><option value="">Ingresos y egresos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Egresos</option></select></label>
          <label className="text-xs font-semibold text-gray-600">Origen / categoría<select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-normal"><option value="">Todos</option>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-600">Método de pago<select value={filters.method} onChange={e => setFilters({ ...filters, method: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-normal"><option value="">Todos</option>{summary.methods.map(method => <option key={method.key} value={method.key || '__unknown'}>{method.name}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={filters.showDeleted} onChange={e => setFilters({ ...filters, showDeleted: e.target.checked })} /> Mostrar anulados</label>
          <span className="text-xs text-gray-500">{filteredEntries.length} de {entries.length} movimientos · El resumen superior incluye todos los activos.</span>
          <button onClick={() => downloadMovements(filteredEntries, register.date)} disabled={!filteredEntries.length} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"><Download size={15} /> Exportar CSV</button>
        </div>
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-2">
            <Receipt size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-600">Movimientos</span>
            {activeEntries.length > 0 && (
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[11px] font-semibold rounded-full">{activeEntries.length}</span>
            )}
          </div>
          {entries.some(e => e.isDeleted) && (
            <span className="text-[11px] text-red-400 font-medium">{entries.filter(e => e.isDeleted).length} anulado(s)</span>
          )}
        </div>

        {/* ── Mobile: tarjetas ───────────────────────────────────────────── */}
        <div className="lg:hidden divide-y divide-gray-100">
          {filteredEntries.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Receipt size={36} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">No hay movimientos que coincidan</p>
              {!isClosed && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button onClick={openAddIncome} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700">+ Ingreso</button>
                  <button onClick={openAddExpense} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">+ Egreso</button>
                </div>
              )}
            </div>
          ) : groupedRows.map((group, gi) => {
            const isGroup = !!group.groupId && group.entries.length > 1;
            if (!isGroup) return renderEntryCard(group.entries[0], false, gi);

            const isOpen = expandedGroups.has(group.groupId!);
            const first = group.entries[0];
            const total = group.total ?? group.entries.reduce((s, e) => s + e.amount, 0);
            const baseDesc = first.description.replace(/\s*\(\d+ de \d+\)\s*$/, '').replace(/\s*\[.*?\]\s*$/, '');
            const methodMatch = first.description.match(/\[(.+?)\]/);
            const toggle = () => setExpandedGroups(prev => { const next = new Set(prev); next.has(group.groupId!) ? next.delete(group.groupId!) : next.add(group.groupId!); return next; });

            return (
              <React.Fragment key={group.groupId}>
                <div
                  onClick={toggle}
                  className={`px-4 py-3.5 cursor-pointer transition-colors ${first.type === 'INCOME' ? 'bg-primary-50/40 active:bg-primary-50/70' : 'bg-red-50/40 active:bg-red-50/70'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
                        ${first.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
                        {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        {first.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {first.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                      </span>
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                        {categoryLabels[first.category] || first.category}
                      </span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${first.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                      <span className="text-xs font-normal opacity-60 mr-0.5">{first.type === 'INCOME' ? '+' : '−'}</span>
                      S/ {total.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[11px] font-semibold">
                      <Layers size={10} /> Grupo · {group.entries.length} cuentas
                    </span>
                    <span className="text-sm text-gray-700 truncate">{baseDesc}</span>
                  </div>
                  {methodMatch && (
                    <div className="mt-1.5">
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{methodMatch[1]}</span>
                    </div>
                  )}
                </div>
                {isOpen && group.entries.map((e) => renderEntryCard(e, true, `${group.groupId}-${e.id}`))}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Desktop: tabla ─────────────────────────────────────────────── */}
        <div className="hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Categoría</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Descripción</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Método</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Monto</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Comprobante</th>
                {!isClosed && <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group, gi) => {
                const isGroup = !!group.groupId && group.entries.length > 1;
                if (!isGroup) return renderEntryRow(group.entries[0], false, gi);

                const isOpen = expandedGroups.has(group.groupId!);
                const first = group.entries[0];
                const total = group.total ?? group.entries.reduce((s, e) => s + e.amount, 0);
                const baseDesc = first.description.replace(/\s*\(\d+ de \d+\)\s*$/, '').replace(/\s*\[.*?\]\s*$/, '');
                const methodMatch = first.description.match(/\[(.+?)\]/);

                return (
                  <React.Fragment key={group.groupId}>
                    <tr
                      onClick={() => setExpandedGroups(prev => { const next = new Set(prev); next.has(group.groupId!) ? next.delete(group.groupId!) : next.add(group.groupId!); return next; })}
                      className={`cursor-pointer border-b border-gray-50 transition-colors ${first.type === 'INCOME' ? 'bg-primary-50/30 hover:bg-primary-50/60' : 'bg-red-50/30 hover:bg-red-50/60'}`}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${first.type === 'INCOME' ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'}`}>
                            {first.type === 'INCOME' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {first.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                          {categoryLabels[first.category] || first.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[11px] font-semibold mr-2">
                          <Layers size={10} /> Grupo · {group.entries.length} cuentas
                        </span>
                        <span className="text-sm text-gray-700">{baseDesc}</span>
                      </td>
                      <td className="px-4 py-3">
                        {methodMatch ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{methodMatch[1]}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-sm ${first.type === 'INCOME' ? 'text-primary-700' : 'text-red-600'}`}>
                        <span className="text-xs font-normal opacity-60 mr-0.5">{first.type === 'INCOME' ? '+' : '−'}</span>
                        S/ {total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center"><span className="text-gray-300 text-xs">—</span></td>
                      {!isClosed && <td className="px-4 py-3" />}
                    </tr>
                    {isOpen && group.entries.map((e) => renderEntryRow(e, true, `${group.groupId}-${e.id}`))}
                  </React.Fragment>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={isClosed ? 6 : 7} className="px-4 py-16 text-center">
                    <Receipt size={36} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-sm text-gray-400">No hay movimientos que coincidan</p>
                    {!isClosed && (
                      <div className="flex items-center justify-center gap-2 mt-3">
                        <button onClick={openAddIncome} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700">+ Ingreso</button>
                        <button onClick={openAddExpense} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">+ Egreso</button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ── */}

      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setRucInput(''); setRucFound(''); }}
        title={addForm.type === 'INCOME' ? 'Nuevo Ingreso' : 'Nuevo Egreso'}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold ${addForm.type === 'INCOME' ? 'bg-primary-50 text-primary-700 border border-primary-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
            {addForm.type === 'INCOME' ? <><TrendingUp size={15} /> Registrando un ingreso</> : <><TrendingDown size={15} /> Registrando un egreso</>}
          </div>
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Motivo del movimiento</label>
            <select value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {(addForm.type === 'INCOME' ? ['OTHER', 'CAPITAL_CONTRIBUTION'] : ['OPERATING_EXPENSE', 'WITHDRAWAL', 'PURCHASE', 'OTHER']).map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500">Registra las ventas en POS y los abonos en Créditos para mantener sus saldos vinculados.</p>
          </div>
          {addForm.type === 'EXPENSE' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa por RUC <span className="text-gray-400 font-normal text-xs">(opcional)</span></label>
              <div className="flex gap-2">
                <input value={rucInput} onChange={e => { setRucInput(e.target.value.replace(/\D/g, '').slice(0, 11)); setRucFound(''); }}
                  className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="RUC (11 dígitos)" maxLength={11} />
                <button type="button" onClick={handleRucLookup} disabled={rucInput.length !== 11 || rucLoading}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-sm font-medium">
                  {rucLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
                </button>
                {rucFound && <div className="flex-1 min-w-0 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800 font-medium truncate">{rucFound}</div>}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante</label>
            <div className="flex gap-2">
              {[{ value: 'NONE', label: 'Ninguno' }, { value: 'BOLETA', label: 'Boleta' }, { value: 'FACTURA', label: 'Factura' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => setAddForm({ ...addForm, voucherType: opt.value, voucherSeries: '', voucherNumber: '' })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${addForm.voucherType === opt.value
                    ? opt.value === 'BOLETA' ? 'bg-primary-600 text-white border-primary-600'
                      : opt.value === 'FACTURA' ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-600 text-white border-gray-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {(addForm.voucherType === 'BOLETA' || addForm.voucherType === 'FACTURA') && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                <input value={addForm.voucherSeries} onChange={e => setAddForm({ ...addForm, voucherSeries: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="B001" maxLength={4} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
                <input value={addForm.voucherNumber} onChange={e => setAddForm({ ...addForm, voucherNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="00000001" required /></div>
            </div>
          )}
          {addForm.type === 'EXPENSE' && addForm.voucherType === 'FACTURA' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-700 mb-2">Guía de Remisión <span className="font-normal text-amber-500">(opcional)</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
                  <input value={addForm.remisionSerie} onChange={e => setAddForm({ ...addForm, remisionSerie: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white" placeholder="T001" maxLength={4} /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Correlativo</label>
                  <input value={addForm.remisionCorrelativo} onChange={e => setAddForm({ ...addForm, remisionCorrelativo: e.target.value.replace(/\D/g, '').slice(0, 8) })} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white" placeholder="00000001" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input type="date" value={addForm.remisionFecha} onChange={e => setAddForm({ ...addForm, remisionFecha: e.target.value })} className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white" /></div>
            </div>
          )}
          {(
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago (obligatorio)</label>
              {paymentMethods.length === 0 ? <p className="text-sm text-gray-400">Cargando...</p> : (
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.filter(pm => pm.isActive).map((pm: { id: string; name: string }) => (
                    <button key={pm.id} type="button" onClick={() => setAddForm({ ...addForm, paymentMethodId: pm.id })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${addForm.paymentMethodId === pm.id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}>
                      {pm.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div><label htmlFor="cash-entry-description" className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <input id="cash-entry-description" value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
          <div><label htmlFor="cash-entry-amount" className="block text-sm font-medium text-gray-700 mb-1">Monto (S/)</label>
            <input id="cash-entry-amount" type="number" min="0.01" step="0.01" value={addForm.amount || ''} onChange={e => setAddForm({ ...addForm, amount: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
          <button type="submit" disabled={addEntry.isPending || !addForm.paymentMethodId || !addForm.description.trim()}
            className={`w-full py-2.5 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors ${addForm.type === 'INCOME' ? 'bg-primary-600 hover:bg-primary-700' : 'bg-red-500 hover:bg-red-600'}`}>
            {addEntry.isPending ? 'Registrando...' : addForm.type === 'INCOME' ? 'Registrar Ingreso' : 'Registrar Egreso'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Movimiento">
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
            Monto actual: <span className="font-bold text-gray-800">S/ {selectedEntry?.amount.toFixed(2)}</span>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nuevo monto (S/)</label>
            <input type="number" disabled={!!selectedEntry?.referenceId} min="0.01" step="0.01" value={editForm.amount || ''} onChange={e => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" required /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante</label>
            <div className="flex gap-2">
              {[{ value: 'NONE', label: 'Ninguno' }, { value: 'BOLETA', label: 'Boleta' }, { value: 'FACTURA', label: 'Factura' }].map(opt => (
                <button key={opt.value} type="button" onClick={() => setEditForm({ ...editForm, voucherType: opt.value, voucherSeries: '', voucherNumber: '' })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${editForm.voucherType === opt.value
                    ? opt.value === 'BOLETA' ? 'bg-primary-600 text-white border-primary-600' : opt.value === 'FACTURA' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-600 text-white border-gray-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {(editForm.voucherType === 'BOLETA' || editForm.voucherType === 'FACTURA') && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Serie</label>
                <input value={editForm.voucherSeries} onChange={e => setEditForm({ ...editForm, voucherSeries: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="B001" maxLength={4} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Correlativo</label>
                <input value={editForm.voucherNumber} onChange={e => setEditForm({ ...editForm, voucherNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="00000001" /></div>
            </div>
          )}
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Método de pago</label>
            {selectedEntry?.referenceId && entryPaymentMethod(selectedEntry) ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{entryPaymentMethod(selectedEntry)} · Vinculado a la operación original</p> : <select value={editForm.paymentMethodId} onChange={e => setEditForm({ ...editForm, paymentMethodId: e.target.value })} className="w-full rounded-lg border border-gray-200 p-2 text-sm"><option value="">{selectedEntry ? entryPaymentMethod(selectedEntry) || 'Seleccionar método' : 'Seleccionar método'}</option>{paymentMethods.filter(pm => pm.isActive).map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}</select>}
            {!!selectedEntry?.referenceId && <p className="mt-1 text-xs text-gray-500">El importe se conserva porque pertenece a una venta o abono.</p>}
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Razón del cambio <span className="text-red-500">*</span></label>
            <textarea minLength={5} value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} required /></div>
          <button type="submit" disabled={editEntry.isPending} className="w-full py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold transition-colors">
            {editEntry.isPending ? 'Guardando...' : 'Guardar cambio'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Anular Movimiento">
        <form onSubmit={handleDelete} className="space-y-4">
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
            Esta acción marcará el movimiento como anulado. No se puede deshacer.
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Razón de anulación <span className="text-red-500">*</span></label>
            <textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} required /></div>
          <button type="submit" disabled={deleteEntryMutation.isPending} className="w-full py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 font-semibold transition-colors">
            {deleteEntryMutation.isPending ? 'Anulando...' : 'Confirmar anulación'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Ajuste de Caja">
        <form onSubmit={async (e) => { e.preventDefault(); await adjustOpening.mutateAsync({ registerId: register.id, data: adjustForm }); setShowAdjustModal(false); }} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <SlidersHorizontal size={15} className="mt-0.5 flex-shrink-0" />
            <span>Ajusta el saldo de apertura. Útil cuando la caja se abrió automáticamente por una venta sin saldo inicial.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Apertura actual</div>
              <div className="text-lg font-bold text-gray-700">S/ {(register?.openingBalance || 0).toFixed(2)}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <div className="text-[11px] text-amber-500 mb-1 uppercase tracking-wide font-semibold">Balance neto</div>
              <div className="text-lg font-bold text-amber-700">S/ {netBalance.toFixed(2)}</div>
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Nuevo saldo de apertura (S/)</label>
            <input type="number" min="0" step="0.01" value={adjustForm.openingBalance || ''} onChange={e => setAdjustForm({ ...adjustForm, openingBalance: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-lg text-center font-bold" placeholder="0.00" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Motivo del ajuste <span className="text-red-500">*</span></label>
            <textarea value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} placeholder="Ej: Caja abierta por venta, saldo inicial era S/ 150.00" required minLength={5} /></div>
          <button type="submit" disabled={adjustOpening.isPending || !adjustForm.reason.trim() || adjustForm.openingBalance === (register?.openingBalance || 0)}
            className="w-full py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 font-semibold transition-colors">
            {adjustOpening.isPending ? 'Ajustando...' : 'Confirmar ajuste'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} title="Cerrar caja con arqueo">
        {closeTarget && <CashCloseForm register={closeTarget} pending={closeRegister.isPending} onSubmit={async data => { await closeRegister.mutateAsync({ registerId: closeTarget.id, data }); setShowCloseModal(false); }} />}
      </Modal>
    </div>
  );
}
