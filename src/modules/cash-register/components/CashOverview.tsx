import type { CashRegister } from '../../../shared/types';
import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Scale, Wallet } from 'lucide-react';
import { summarizeCash, type CashSummary } from '../utils/cashSummary';

export const cashCategoryLabels: Record<string, string> = {
  SALE: 'Cobro de venta', CREDIT_PAYMENT: 'Abono de crédito', PURCHASE: 'Compra',
  ADJUSTMENT: 'Ajuste', OTHER: 'Otro', OPERATING_EXPENSE: 'Gasto operativo',
  WITHDRAWAL: 'Retiro', CAPITAL_CONTRIBUTION: 'Aporte a caja',
};
export const money = (value: number) => `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CashMethodBreakdown({ methods }: { methods: CashSummary['methods'] }) {
  return <div className="overflow-x-auto rounded-xl border border-gray-200">
    <table className="w-full text-sm">
      <caption className="sr-only">Movimientos por método de pago, sin incluir el saldo de apertura</caption>
      <thead className="bg-gray-50 text-gray-600"><tr>
        <th className="px-4 py-3 text-left">Método</th><th className="px-4 py-3 text-right">Ingresos</th>
        <th className="px-4 py-3 text-right">Egresos</th><th className="px-4 py-3 text-right">Movimiento neto</th>
      </tr></thead>
      <tbody className="divide-y divide-gray-100">{methods.map(method => <tr key={method.key}>
        <td className="px-4 py-3 font-semibold text-gray-800">{method.name}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right text-primary-700">{money(method.income)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right text-red-700">{money(method.expense)}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">{money(method.net)}</td>
      </tr>)}</tbody>
    </table>
    {methods.length === 0 && <p className="p-4 text-sm text-gray-500">Todavía no hay movimientos.</p>}
  </div>;
}

export function CashCountResult({ register }: { register: CashRegister }) {
  if (register.status !== 'CLOSED') return null;
  const count = register.cashCount;
  if (!count) return <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Cierre anterior sin arqueo de efectivo registrado.</p>;
  return <section className={`rounded-xl border p-4 ${count.difference === 0 ? 'border-primary-200 bg-primary-50' : 'border-amber-200 bg-amber-50'}`}>
    <h3 className="mb-3 font-bold text-gray-900">Arqueo de efectivo registrado</h3>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-gray-600">Esperado al cerrar</dt><dd className="mt-1 font-bold text-gray-900">{money(count.expectedAmount)}</dd></div>
      <div><dt className="text-gray-600">Efectivo contado</dt><dd className="mt-1 font-bold text-gray-900">{money(count.countedAmount)}</dd></div>
      <div><dt className="text-gray-600">{count.difference < 0 ? 'Faltante' : count.difference > 0 ? 'Sobrante' : 'Sin diferencia'}</dt><dd className="mt-1 font-bold text-gray-900">{money(Math.abs(count.difference))}</dd></div>
    </dl>
    {register.notes && <p className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-700">Observación: {register.notes}</p>}
  </section>;
}

export function CashMetric({ label, value, help, tone = 'neutral', icon = 'wallet' }: {
  label: string; value: number; help: string; tone?: 'neutral' | 'income' | 'expense' | 'balance'; icon?: 'wallet' | 'income' | 'expense' | 'opening';
}) {
  const Icon = icon === 'income' ? ArrowUpRight : icon === 'expense' ? ArrowDownLeft : icon === 'opening' ? Scale : Wallet;
  const color = tone === 'income' ? 'text-primary-700 bg-primary-50' : tone === 'expense' ? 'text-rose-700 bg-rose-50' : tone === 'balance' ? 'text-blue-700 bg-blue-50' : 'text-gray-700 bg-gray-100';
  return <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex items-center gap-2"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={16} /></span><p className="text-xs font-bold text-gray-600 sm:text-sm">{label}</p></div>
    <p className={`break-words text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${color.split(' ')[0]}`}>{money(value)}</p>
    <p className="mt-1.5 text-xs leading-5 text-gray-500">{help}</p>
  </div>;
}

export function CashOverview({ register, actions }: { register: CashRegister; actions?: ReactNode }) {
  const summary = summarizeCash(register.openingBalance, register.entries);
  const activeCount = register.entries.filter(entry => !entry.isDeleted).length;
  const closed = register.status === 'CLOSED';
  const date = new Date(register.date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return <section className="space-y-5" aria-label="Resumen de caja">
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-sm sm:p-6 ${closed ? 'bg-gradient-to-br from-gray-700 to-gray-950' : 'bg-gradient-to-br from-primary-600 via-primary-700 to-emerald-800'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-60 w-60 rounded-full border-[30px] border-white/10" />
      <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold"><span className={`h-1.5 w-1.5 rounded-full ${closed ? 'bg-gray-200' : 'bg-lime-300'}`} />{closed ? 'Cerrada' : 'Abierta'}</span><span className="text-xs font-medium capitalize text-white/90">{date}</span></div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white/90"><Banknote size={17} />Efectivo esperado</p>
          <p className="my-2 break-words text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{money(summary.expectedCash)}</p>
          <p className="text-xs leading-5 text-white/90">Apertura {money(register.openingBalance)} + cobros en efectivo − pagos en efectivo.</p>
          <p className="mt-2 text-xs text-white/80">{activeCount} movimiento{activeCount === 1 ? '' : 's'} activo{activeCount === 1 ? '' : 's'} · Yape, tarjetas y transferencias se detallan por separado.</p>
        </div>
        {actions && <div className="shrink-0 xl:max-w-sm">{actions}</div>}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <CashMetric label="Apertura" value={register.openingBalance} help="Efectivo inicial de la caja" icon="opening" />
      <CashMetric label="Ingresos cobrados" value={summary.income} help="Todos los métodos de pago" tone="income" icon="income" />
      <CashMetric label="Egresos registrados" value={summary.expense} help="Gastos, compras, retiros y otros" tone="expense" icon="expense" />
      <CashMetric label="Saldo general" value={summary.balance} help="Apertura + ingresos − egresos de todos los métodos" tone="balance" />
    </div>
    {summary.unclassifiedCount > 0 && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay {summary.unclassifiedCount} movimiento(s) sin método identificado. Revisa su método antes de usar el efectivo esperado para cerrar.</p>}
    <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm sm:grid-cols-3 sm:divide-x sm:divide-gray-100">
      <div className="sm:px-2"><p className="text-gray-600">Cobros de ventas</p><p className="mt-1 text-lg font-bold text-gray-950">{money(summary.sources.sales)}</p></div>
      <div className="sm:px-4"><p className="text-gray-600">Abonos de créditos</p><p className="mt-1 text-lg font-bold text-gray-950">{money(summary.sources.creditPayments)}</p></div>
      <div className="sm:px-4"><p className="text-gray-600">Aportes y otros ingresos</p><p className="mt-1 text-lg font-bold text-gray-950">{money(summary.sources.otherIncome)}</p></div>
    </div>
    {summary.methods.length > 0 && <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-bold text-gray-900">Movimientos por método de pago</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.methods.map(method => {
        const Icon = method.isCash ? Banknote : CreditCard;
        return <div key={method.key || '__unknown'} className={`rounded-xl border p-3 ${method.isCash ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Icon size={15} /><span>{method.name}</span></div>
          <p className="mt-2 text-lg font-bold tabular-nums text-gray-950">{money(method.net)}</p>
          <p className="mt-1 text-xs text-gray-600">Cobrado {money(method.income)} · Pagado {money(method.expense)}</p>
          <p className="mt-1 text-xs font-medium text-gray-500">Movimiento neto · sin apertura</p>
        </div>;
      })}</div>
      <details className="mt-4 border-t border-gray-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-primary-700">Ver desglose de ingresos y egresos</summary><div className="mt-3"><CashMethodBreakdown methods={summary.methods} /></div></details>
    </div>}
    <CashCountResult register={register} />
  </section>;
}
