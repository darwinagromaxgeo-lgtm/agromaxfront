import type { CashRegister } from '../../../shared/types';
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

export function CashOverview({ register }: { register: CashRegister }) {
  const summary = summarizeCash(register.openingBalance, register.entries);
  const metrics = [
    { label: 'Efectivo esperado', value: summary.expectedCash, help: `Apertura ${money(register.openingBalance)} + efectivo recibido − efectivo pagado`, primary: true },
    { label: 'Ingresos cobrados', value: summary.income, help: 'Todos los métodos de pago' },
    { label: 'Egresos registrados', value: summary.expense, help: 'Gastos, compras, retiros y otros' },
    { label: 'Saldo general', value: summary.balance, help: 'Apertura + ingresos − egresos de todos los métodos' },
  ];
  return <section className="mb-6 space-y-4" aria-label="Resumen de caja">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <div key={metric.label} className={`rounded-2xl border p-5 ${metric.primary ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
      <p className={`text-sm font-semibold ${metric.primary ? 'text-white' : 'text-gray-600'}`}>{metric.label}</p>
      <p className="my-2 text-2xl font-bold tabular-nums">{money(metric.value)}</p>
      <p className={`text-xs leading-5 ${metric.primary ? 'text-primary-50' : 'text-gray-500'}`}>{metric.help}</p>
    </div>)}</div>
    {summary.unclassifiedCount > 0 && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay {summary.unclassifiedCount} movimiento(s) sin método identificado. Revisa su método antes de usar el efectivo esperado para cerrar.</p>}
    <div className="grid gap-3 text-sm sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-gray-600">Cobros de ventas</p><p className="mt-1 text-lg font-bold text-gray-900">{money(summary.sources.sales)}</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-gray-600">Abonos de créditos</p><p className="mt-1 text-lg font-bold text-gray-900">{money(summary.sources.creditPayments)}</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-gray-600">Aportes y otros ingresos</p><p className="mt-1 text-lg font-bold text-gray-900">{money(summary.sources.otherIncome)}</p></div>
    </div>
    <CashMethodBreakdown methods={summary.methods} />
    <CashCountResult register={register} />
  </section>;
}
