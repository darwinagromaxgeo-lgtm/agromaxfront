export interface CashSummaryEntry {
  type: string;
  amount: number;
  description: string;
  category?: string;
  isDeleted?: boolean;
  paymentMethodName?: string;
}

export function entryPaymentMethod(entry: CashSummaryEntry): string {
  return entry.paymentMethodName?.trim() || entry.description.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim() || '';
}

export function cashMethodKey(name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  return ['efectivo', 'cash'].includes(normalized) ? 'efectivo' : normalized;
}

/** Opening money belongs to the physical drawer; digital receipts never do. */
export function summarizeCash(openingBalance: number, entries: CashSummaryEntry[]) {
  const methods = new Map<string, { key: string; name: string; income: number; expense: number; net: number; isCash: boolean }>();
  let income = 0, expense = 0, unclassifiedCount = 0;
  const sources = { sales: 0, creditPayments: 0, otherIncome: 0 };
  for (const entry of entries.filter(e => !e.isDeleted)) {
    const cents = Math.round(entry.amount * 100);
    const name = entryPaymentMethod(entry);
    const key = cashMethodKey(name);
    if (!name) unclassifiedCount++;
    const method = methods.get(key) || { key, name: key === 'efectivo' ? 'Efectivo' : name || 'Sin identificar', income: 0, expense: 0, net: 0, isCash: key === 'efectivo' };
    if (entry.type === 'INCOME') {
      income += cents; method.income += cents;
      sources[entry.category === 'SALE' ? 'sales' : entry.category === 'CREDIT_PAYMENT' ? 'creditPayments' : 'otherIncome'] += cents;
    } else { expense += cents; method.expense += cents; }
    methods.set(key, method);
  }
  const opening = Math.round(openingBalance * 100);
  const cash = methods.get('efectivo');
  return {
    income: income / 100, expense: expense / 100,
    balance: (opening + income - expense) / 100,
    expectedCash: (opening + (cash?.income || 0) - (cash?.expense || 0)) / 100,
    unclassifiedCount,
    sources: { sales: sources.sales / 100, creditPayments: sources.creditPayments / 100, otherIncome: sources.otherIncome / 100 },
    methods: [...methods.values()].map(m => ({ ...m, income: m.income / 100, expense: m.expense / 100, net: (m.income - m.expense) / 100 })).sort((a, b) => Number(b.isCash) - Number(a.isCash) || a.name.localeCompare(b.name)),
  };
}

export type CashSummary = ReturnType<typeof summarizeCash>;
