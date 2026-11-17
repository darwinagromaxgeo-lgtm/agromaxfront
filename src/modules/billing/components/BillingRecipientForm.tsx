import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { lookupService } from '../../../shared/services/lookupService';
import type { BillingDocumentType } from '../types';
import { recipientDocumentType, recipientFormError, recipientModes, type RecipientFormState, type RecipientMode } from '../utils/recipientForm';

const input = 'mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
export function BillingRecipientForm({ value, onChange, total, documentType, disabled = false, heading = '¿Qué comprobante necesita el cliente?' }: {
  value: RecipientFormState; onChange: (value: RecipientFormState) => void; total: number; documentType?: BillingDocumentType; disabled?: boolean; heading?: string;
}) {
  const [looking, setLooking] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const current = useRef(value); current.current = value;
  const requestVersion = useRef(0);
  const groupId = useId();
  useEffect(() => () => { requestVersion.current++; }, []);
  const simple = value.mode === 'BOLETA_SIMPLE';
  const dni = value.mode === 'BOLETA_DNI';
  const error = recipientFormError(value, total);
  const change = (next: RecipientFormState) => { requestVersion.current++; setLookupMessage(''); setLooking(false); onChange(next); };
  const changeMode = (mode: RecipientMode) => change({ ...value, mode,
    number: mode === 'BOLETA_SIMPLE' || (mode === 'BOLETA_DNI') !== dni ? '' : value.number,
    name: mode === 'BOLETA_SIMPLE' ? '' : value.name,
  });
  const lookup = async () => {
    const request = ++requestVersion.current;
    const key = `${value.mode}:${value.number}`;
    setLooking(true); setLookupMessage('');
    try {
      const result = dni ? await lookupService.searchByDni(value.number) : await lookupService.searchByRuc(value.number);
      if (request !== requestVersion.current || `${current.current.mode}:${current.current.number}` !== key) return;
      const name = 'nombreCompleto' in result ? result.nombreCompleto : result.razonSocial;
      onChange({ ...current.current, name, address: 'direccion' in result ? result.direccion || '' : current.current.address });
      setLookupMessage('Datos consultados. Revisa el nombre antes de continuar.');
    } catch (error: any) {
      if (request !== requestVersion.current) return;
      setLookupMessage(typeof error?.response?.data?.message === 'string' ? error.response.data.message : 'Consulta no disponible. Puedes completar los datos manualmente.');
    } finally { if (request === requestVersion.current) setLooking(false); }
  };
  return <section className="space-y-4" aria-label="Datos del receptor">
    <fieldset disabled={disabled}><legend className="mb-2 text-sm font-semibold text-slate-800">{heading}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{recipientModes.filter(mode => !documentType || recipientDocumentType(mode.value) === documentType).map(mode => <label key={mode.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${value.mode === mode.value ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'}`}>
        <input type="radio" name={`recipient-mode-${groupId}`} value={mode.value} checked={value.mode === mode.value} onChange={() => changeMode(mode.value)} className="accent-primary-600" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{mode.label}</span><span className="text-xs text-slate-500">{mode.detail}</span></span>{value.mode === mode.value && <Check className="text-primary-600" size={16} />}
      </label>)}</div>
    </fieldset>
    {simple ? <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600"><strong className="block text-slate-800">CONSUMIDOR FINAL</strong><p className="mt-1">Boleta sin DNI ni RUC, hasta S/700. Si el cliente solicita identificación, elige DNI o RUC.</p></div> : <fieldset disabled={disabled} className="space-y-3">
      <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-xs font-medium text-slate-600">{dni ? 'DNI' : 'RUC'}<input inputMode="numeric" autoComplete="off" maxLength={dni ? 8 : 11} value={value.number} onChange={event => change({ ...value, number: event.target.value.replace(/\D/g, ''), name: '', address: '' })} className={input} placeholder={dni ? '8 dígitos' : value.mode === 'FACTURA_RUC20' ? '20XXXXXXXXX' : '10XXXXXXXXX'} /></label><button type="button" disabled={looking || !(dni ? /^\d{8}$/.test(value.number) : /^(10|20)\d{9}$/.test(value.number))} onClick={lookup} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-primary-700 disabled:opacity-50">{looking ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Consultar</button></div>
      {lookupMessage && <p role="status" className="text-xs text-slate-500">{lookupMessage}</p>}
      <label className="block text-xs font-medium text-slate-600">{dni ? 'Nombres y apellidos' : 'Nombre o razón social'}<input value={value.name} maxLength={250} onChange={event => change({ ...value, name: event.target.value })} className={input} placeholder="Nombre del receptor" /></label>
      <label className="block text-xs font-medium text-slate-600">Dirección<input value={value.address} maxLength={500} onChange={event => change({ ...value, address: event.target.value })} className={input} placeholder="Dirección del receptor" /></label>
      <label className="block text-xs font-medium text-slate-600">Correo de contacto (opcional)<input type="email" value={value.email} onChange={event => change({ ...value, email: event.target.value })} className={input} placeholder="correo@ejemplo.com" /></label>
      <p className="text-xs text-slate-400">Se guardará en este comprobante. La ficha del cliente y la venta de origen se mantienen.</p>
    </fieldset>}
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
  </section>;
}
