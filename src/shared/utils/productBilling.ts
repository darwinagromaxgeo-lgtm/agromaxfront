/** Missing legacy values remain enabled; explicit restrictions survive spreadsheet imports. */
export function parseBillingEnabled(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const text = String(value).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['SI', 'TRUE', '1'].includes(text)) return true;
  if (['NO', 'FALSE', '0'].includes(text)) return false;
  throw new Error('Boletas_Facturas debe contener SI o NO');
}

export function restrictedBillingProducts<T extends { productId: string; name: string; billingEnabled?: boolean }>(items: T[], products: { id: string; billingEnabled?: boolean }[]): T[] {
  return items.filter(item => (products.find(product => product.id === item.productId)?.billingEnabled ?? item.billingEnabled) === false);
}
