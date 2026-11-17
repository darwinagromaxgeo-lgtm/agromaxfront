import type { BillingDocumentType, BillingParty } from '../types';

export type RecipientMode = 'BOLETA_SIMPLE' | 'BOLETA_DNI' | 'BOLETA_RUC' | 'FACTURA_RUC10' | 'FACTURA_RUC20';
export interface RecipientFormState { mode: RecipientMode; number: string; name: string; address: string; email: string; }
export const recipientModes: { value: RecipientMode; label: string; detail: string }[] = [
  { value: 'BOLETA_SIMPLE', label: 'Boleta simple', detail: 'Consumidor final' },
  { value: 'BOLETA_DNI', label: 'Boleta con DNI', detail: 'DNI de 8 dígitos' },
  { value: 'BOLETA_RUC', label: 'Boleta con RUC', detail: 'RUC de 11 dígitos' },
  { value: 'FACTURA_RUC10', label: 'Factura · RUC 10', detail: 'Persona natural con RUC' },
  { value: 'FACTURA_RUC20', label: 'Factura · RUC 20', detail: 'Persona jurídica' },
];
export const recipientDocumentType = (mode: RecipientMode): BillingDocumentType => mode.startsWith('FACTURA') ? 'FACTURA' : 'BOLETA';
export function recipientFormFromParty(party?: BillingParty, type: BillingDocumentType = 'BOLETA'): RecipientFormState {
  return { mode: type === 'FACTURA' ? party?.documentNumber?.startsWith('10') ? 'FACTURA_RUC10' : 'FACTURA_RUC20'
    : party?.documentType === 'DNI' ? 'BOLETA_DNI' : party?.documentType === 'RUC' ? 'BOLETA_RUC' : 'BOLETA_SIMPLE',
  number: party?.documentNumber || '', name: party?.documentType === 'UNIDENTIFIED' ? '' : party?.name || '', address: party?.address || '', email: party?.email || '' };
}
export function recipientFormError(form: RecipientFormState, total: number): string | undefined {
  if (form.mode === 'BOLETA_SIMPLE') return Math.round(total * 100) > 70_000 ? 'Las boletas mayores de S/700 requieren DNI o RUC.' : undefined;
  if (form.mode === 'BOLETA_DNI') { if (!/^\d{8}$/.test(form.number)) return 'Ingresa un DNI de 8 dígitos.'; }
  else {
    if (!/^(10|20)\d{9}$/.test(form.number)) return 'Ingresa un RUC de 11 dígitos que comience con 10 o 20.';
    if (form.mode === 'FACTURA_RUC10' && !form.number.startsWith('10')) return 'Esta opción requiere un RUC que comience con 10.';
    if (form.mode === 'FACTURA_RUC20' && !form.number.startsWith('20')) return 'Esta opción requiere un RUC que comience con 20.';
  }
  if (!form.name.trim()) return 'Completa el nombre o razón social del receptor.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Revisa el correo electrónico.';
}
export function recipientParty(form: RecipientFormState): BillingParty {
  if (form.mode === 'BOLETA_SIMPLE') return { name: 'CONSUMIDOR FINAL', documentType: 'UNIDENTIFIED' };
  return { name: form.name.trim(), documentType: form.mode === 'BOLETA_DNI' ? 'DNI' : 'RUC', documentNumber: form.number, address: form.address.trim() || undefined, email: form.email.trim() || undefined };
}
