export function creditCheckout(total: number, hasDeposit: boolean, amount: string, paymentMethodId: string) {
  if (!hasDeposit) return { payments: [], deposit: 0, pending: total, error: undefined };
  const deposit = Number(amount);
  if (!amount.trim() || !Number.isFinite(deposit) || deposit <= 0 || Math.abs(deposit * 100 - Math.round(deposit * 100)) > 0.000001) {
    return { payments: [], deposit: 0, pending: total, error: 'Ingresa un abono mayor a cero con un máximo de dos decimales' };
  }
  const cents = Math.round(deposit * 100);
  if (cents >= Math.round(total * 100)) return { payments: [], deposit, pending: 0, error: 'El abono debe ser menor al total. Si paga todo, selecciona Pago inmediato' };
  if (!paymentMethodId) return { payments: [], deposit, pending: (Math.round(total * 100) - cents) / 100, error: 'Selecciona el método del abono inicial' };
  return { payments: [{ paymentMethodId, amount: cents / 100 }], deposit: cents / 100, pending: (Math.round(total * 100) - cents) / 100, error: undefined };
}
