import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreateClient } from '../../clients/hooks/useClients';
import { clientService } from '../../clients/services/clientService';
import { useDniLookup, useRucLookup } from '../../../shared/hooks/useLookup';
import type { Client } from '../../../shared/types';

export function CheckoutClientForm({ onSelect, onCancel }: { onSelect: (client: Client) => void; onCancel: () => void }) {
  const createClient = useCreateClient();
  const dniLookup = useDniLookup();
  const rucLookup = useRucLookup();
  const [docType, setDocType] = useState('DNI');
  const [form, setForm] = useState({ name: '', documentNumber: '', phone: '', email: '', address: '' });
  const [lookingUp, setLookingUp] = useState(false);
  const saving = useRef(false);
  const busy = lookingUp || createClient.isPending;
  const validDocument = docType === 'NONE' || new RegExp(`^\\d{${docType === 'DNI' ? 8 : 11}}$`).test(form.documentNumber);

  const existingClient = async () => {
    if (!form.documentNumber) return undefined;
    const result = await clientService.getAll({ search: form.documentNumber, limit: 100 });
    return (Array.isArray(result) ? result : result.data || []).find((client: Client) => client.documentNumber === form.documentNumber) as Client | undefined;
  };
  const selectExisting = (client: Client) => {
    if (!client.isActive) { toast.error('Este cliente está inactivo. Actívalo desde Clientes antes de seleccionarlo.'); return; }
    toast.success('Cliente existente seleccionado');
    onSelect(client);
  };
  const lookup = async () => {
    setLookingUp(true);
    try {
      const existing = await existingClient();
      if (existing) { selectExisting(existing); return; }
      if (docType === 'DNI') {
        const result = await dniLookup.mutateAsync(form.documentNumber);
        setForm(previous => ({ ...previous, name: `${result.apellidoPaterno} ${result.apellidoMaterno}, ${result.nombre}` }));
      } else {
        const result = await rucLookup.mutateAsync(form.documentNumber);
        setForm(previous => ({ ...previous, name: result.razonSocial, address: result.direccion || previous.address }));
      }
    } catch { /* Lookup hooks report the error; manual entry remains available. */ }
    finally { setLookingUp(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || busy) return;
    if (!form.name.trim() || !validDocument) { toast.error('Completa el nombre y un documento válido'); return; }
    saving.current = true;
    setLookingUp(true);
    let creating = false;
    try {
      const existing = await existingClient();
      if (existing) { selectExisting(existing); return; }
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
      creating = true;
      const client: Client = await createClient.mutateAsync(payload);
      onSelect(client);
    } catch (error: any) {
      if (!creating) {
        const message = error?.response?.data?.message;
        toast.error(Array.isArray(message) ? message.join(' ') : message || 'No se pudo comprobar el cliente. Revisa la conexión e intenta nuevamente.');
      }
    } finally { saving.current = false; setLookingUp(false); }
  };
  return <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-primary-200 bg-primary-50/50 p-4" aria-label="Nuevo cliente sin salir del cobro">
    <p className="text-sm font-bold text-primary-900">Nuevo cliente</p>
    <p className="text-xs text-gray-600">Se guardará en esta sucursal y quedará seleccionado. Tu carrito se conserva.</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Tipo de documento
        <select value={docType} onChange={event => { setDocType(event.target.value); setForm(previous => ({ ...previous, documentNumber: '' })); }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
          <option value="DNI">DNI</option><option value="RUC">RUC</option><option value="NONE">Sin documento</option>
        </select>
      </label>
      {docType !== 'NONE' && <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-medium text-gray-700">{docType}
          <input autoFocus inputMode="numeric" value={form.documentNumber} onChange={event => setForm(previous => ({ ...previous, documentNumber: event.target.value.replace(/\D/g, '').slice(0, docType === 'DNI' ? 8 : 11) }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required />
        </label>
        <button type="button" onClick={lookup} disabled={!validDocument} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{lookingUp ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar</button>
      </div>}
      <label className="block text-sm font-medium text-gray-700">Nombre o razón social
        <input value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Teléfono <span className="text-xs font-normal">(opcional)</span><input type="tel" value={form.phone} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-gray-700">Correo <span className="text-xs font-normal">(opcional)</span><input type="email" value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
      </div>
      <label className="block text-sm font-medium text-gray-700">Dirección <span className="text-xs font-normal">(opcional)</span><input value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button type="submit" disabled={busy} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Procesando…' : 'Guardar y seleccionar'}</button>
      <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancelar</button>
    </div>
  </form>;
}
