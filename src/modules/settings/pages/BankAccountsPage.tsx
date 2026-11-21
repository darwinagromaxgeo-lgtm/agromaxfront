import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { companyService } from '../../companies/services/companyService';
import type { Company, CompanyBankAccount } from '../../../shared/types';

const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
export function BankAccountsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useCompanies();
  const companies: Company[] = Array.isArray(data) ? data : [];
  const [companyId, setCompanyId] = useState('');
  const currentCompany = useRef(companyId); currentCompany.current = companyId;
  const [loadedId, setLoadedId] = useState('');
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
  const [revision, setRevision] = useState(0);
  const [baseline, setBaseline] = useState('[]');
  const [error, setError] = useState('');
  const company = companies.find(item => item.id === companyId);
  const load = (item: Company) => {
    const values = (item.bankAccounts || []).map(account => ({ ...account, cci: account.cci || '' }));
    setAccounts(values); setBaseline(JSON.stringify(values)); setRevision(item.bankAccountsRevision || 0); setLoadedId(item.id); setError('');
  };
  useEffect(() => { if (!companyId && companies.length) setCompanyId(companies.find(item => item.isActive)?.id || companies[0].id); }, [companyId, companies]);
  useEffect(() => { if (company && company.id !== loadedId) load(company); }, [company, loadedId]);
  const save = useMutation({
    mutationFn: ({ id, values, expectedRevision }: { id: string; values: CompanyBankAccount[]; expectedRevision: number }) => companyService.saveBankAccounts(id, values.map(account => ({ ...account, cci: account.cci?.trim() || undefined })), expectedRevision),
    onSuccess: (result: Company) => {
      queryClient.setQueryData<Company[]>(['companies'], previous => previous?.map(item => item.id === result.id ? result : item));
      if (currentCompany.current === result.id) load(result);
      toast.success('Cuentas bancarias guardadas');
    },
    onError: (failure: any) => { const message = failure.response?.data?.message; setError(Array.isArray(message) ? message.join('. ') : message || 'No se pudieron guardar las cuentas. Tus cambios se conservan'); },
  });
  const dirty = JSON.stringify(accounts) !== baseline;
  const edit = (index: number, patch: Partial<CompanyBankAccount>) => setAccounts(previous => previous.map((account, position) => position === index ? { ...account, ...patch } : account));
  const reload = async () => { const result = await refetch(); const latest = result.data?.find((item: Company) => item.id === currentCompany.current); if (latest) load(latest); };
  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800"><Landmark size={25} /> Cuentas bancarias</h1><p className="mt-2 text-sm text-gray-500">Configura las cuentas de cada empresa. Las cuentas activas aparecerán automáticamente en sus cotizaciones.</p></div>
    {isError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">No se pudieron cargar las empresas. <button className="font-semibold underline" onClick={() => refetch()}>Volver a intentar</button></div> : <>
    <div className="rounded-xl border bg-white p-4"><label className="text-sm font-semibold text-gray-700">Empresa emisora<select aria-label="Empresa emisora" className={field} value={companyId} disabled={isLoading || save.isPending} onChange={event => setCompanyId(event.target.value)}><option value="">{isLoading ? 'Cargando empresas…' : 'Selecciona una empresa'}</option>{companies.map(item => <option key={item.id} value={item.id}>{item.name} · RUC {item.ruc}{item.isActive ? '' : ' · Inactiva'}</option>)}</select></label></div>
    {company && loadedId === company.id && <form onSubmit={event => { event.preventDefault(); setError(''); save.mutate({ id: company.id, values: accounts, expectedRevision: revision }); }} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-gray-800">Cuentas de {company.name}</h2><button type="button" disabled={accounts.length >= 20 || save.isPending} onClick={() => setAccounts(previous => [...previous, { bank: '', currency: 'PEN', accountNumber: '', cci: '', holder: company.name, isActive: true }])} className="inline-flex items-center gap-2 rounded-lg border border-primary-300 px-3 py-2 text-sm font-semibold text-primary-700 disabled:opacity-50"><Plus size={17} /> Agregar cuenta</button></div>
      {!accounts.length && <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">Esta empresa todavía no tiene cuentas bancarias configuradas.</div>}
      {accounts.map((account, index) => <fieldset key={`${company.id}:${index}`} disabled={save.isPending} className="rounded-xl border border-gray-200 bg-white p-4">
        <legend className="px-2 text-sm font-semibold text-gray-700">Cuenta {index + 1}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-gray-600">Banco<input aria-label={`Banco ${index + 1}`} className={field} value={account.bank} maxLength={80} required placeholder="Nombre del banco" onChange={event => edit(index, { bank: event.target.value })} /></label>
          <label className="text-sm text-gray-600">Moneda<select aria-label={`Moneda ${index + 1}`} className={field} value={account.currency} onChange={event => edit(index, { currency: event.target.value as 'PEN' | 'USD' })}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></label>
          <label className="text-sm text-gray-600">Número de cuenta<input aria-label={`Número de cuenta ${index + 1}`} className={field} inputMode="numeric" pattern="[0-9]{6,34}" minLength={6} maxLength={34} required value={account.accountNumber} onChange={event => edit(index, { accountNumber: event.target.value.replace(/[\s-]/g, '') })} /></label>
          <label className="text-sm text-gray-600">CCI (opcional)<input aria-label={`CCI ${index + 1}`} className={field} inputMode="numeric" pattern="[0-9]{20}" maxLength={20} value={account.cci || ''} placeholder="20 dígitos" onChange={event => edit(index, { cci: event.target.value.replace(/[\s-]/g, '') })} /></label>
          <label className="text-sm text-gray-600 sm:col-span-2">Titular<input aria-label={`Titular ${index + 1}`} className={field} value={account.holder} required maxLength={160} onChange={event => edit(index, { holder: event.target.value })} /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="inline-flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={account.isActive} onChange={event => edit(index, { isActive: event.target.checked })} /> Incluir en cotizaciones</label><button type="button" aria-label={`Eliminar cuenta bancaria ${index + 1}`} className="inline-flex items-center gap-1.5 text-sm text-red-600" onClick={() => setAccounts(previous => previous.filter((_, position) => position !== index))}><Trash2 size={15} /> Eliminar</button></div>
      </fieldset>)}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={save.isPending || isFetching} onClick={reload} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} /> Volver a cargar</button><button type="submit" disabled={!dirty || save.isPending || isFetching} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} /> {save.isPending ? 'Guardando…' : 'Guardar cuentas'}</button></div>
    </form>}
    </>}
  </div>;
}
