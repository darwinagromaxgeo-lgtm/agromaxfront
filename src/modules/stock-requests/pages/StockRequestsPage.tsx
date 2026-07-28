import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  Check,
  Clock3,
  PackageCheck,
  PackageSearch,
  Send,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '../../../app/providers/AuthProvider';
import { Modal } from '../../../shared/components/Modal';
import { SearchableSelect } from '../../../shared/components/SearchableSelect';
import type {
  BranchAvailability,
  Company,
  PriceTier,
  Product,
  StockRequest,
  StockRequestStatus,
} from '../../../shared/types';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { usePriceTiers } from '../../price-tiers/hooks/usePriceTiers';
import { useProducts } from '../../products/hooks/useProducts';
import {
  useApproveStockRequest,
  useCancelStockRequest,
  useCreateStockRequest,
  useDispatchStockRequest,
  useReceiveStockRequest,
  useRejectStockRequest,
  useStockAvailability,
  useStockRequests,
} from '../hooks/useStockRequests';

type MainTab = 'availability' | 'requests';
type DirectionFilter = 'all' | 'incoming' | 'outgoing';

const STATUS_LABELS: Record<StockRequestStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  DISPATCHING: 'Procesando despacho',
  IN_TRANSIT: 'En tránsito',
  RECEIVING: 'Procesando recepción',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
};

const STATUS_STYLES: Record<StockRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED: 'bg-blue-100 text-blue-800 border-blue-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  DISPATCHING: 'bg-blue-100 text-blue-800 border-blue-200',
  IN_TRANSIT: 'bg-violet-100 text-violet-800 border-violet-200',
  RECEIVING: 'bg-violet-100 text-violet-800 border-violet-200',
  RECEIVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-gray-100 text-gray-600 border-gray-200',
};

function formatDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StockRequestsPage() {
  const { user, selectedBranch } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>('availability');
  const [companyId, setCompanyId] = useState('');
  const [productId, setProductId] = useState('');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [status, setStatus] = useState<StockRequestStatus | ''>('');
  const [requestSource, setRequestSource] = useState<BranchAvailability | null>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const { data: companiesData } = useCompanies();
  const { data: productsData, isLoading: productsLoading } = useProducts({ page: 1, limit: 1000 });
  const { data: tiersData } = usePriceTiers();
  const companies: Company[] = Array.isArray(companiesData) ? companiesData : [];
  const products: Product[] = productsData?.data || [];
  const tiers: PriceTier[] = Array.isArray(tiersData) ? tiersData : [];

  const branchCompanies = useMemo(() => {
    const allowedIds = selectedBranch?.companyIds || [];
    return companies.filter((company) =>
      company.isActive && (allowedIds.length === 0 || allowedIds.includes(company.id)),
    );
  }, [companies, selectedBranch]);

  useEffect(() => {
    if (companyId && branchCompanies.some((company) => company.id === companyId)) return;
    const preferred = branchCompanies.find(
      (company) => company.id === selectedBranch?.defaultCompanyId,
    );
    setCompanyId(preferred?.id || branchCompanies[0]?.id || '');
  }, [branchCompanies, companyId, selectedBranch]);

  const availability = useStockAvailability(productId, companyId);
  const requests = useStockRequests({
    direction: direction === 'all' ? undefined : direction,
    status: status || undefined,
    page: 1,
    limit: 100,
  });

  const createRequest = useCreateStockRequest();
  const approveRequest = useApproveStockRequest();
  const rejectRequest = useRejectStockRequest();
  const dispatchRequest = useDispatchStockRequest();
  const receiveRequest = useReceiveStockRequest();
  const cancelRequest = useCancelStockRequest();

  const branchAssignment = user?.branchAssignments?.find(
    (assignment) => assignment.branchId === selectedBranch?.id,
  );
  const effectiveRole = user?.role === 'ADMIN'
    ? 'ADMIN'
    : branchAssignment?.role || user?.role;
  const canManage = effectiveRole === 'ADMIN' || effectiveRole === 'ALMACENERO';
  const isMutating = approveRequest.isPending
    || rejectRequest.isPending
    || dispatchRequest.isPending
    || receiveRequest.isPending
    || cancelRequest.isPending;

  const productOptions = products
    .filter((product) => product.isActive)
    .map((product) => ({
      value: product.id,
      label: product.name,
      sublabel: product.activeIngredient || product.unit,
    }));

  const selectedProduct = products.find((product) => product.id === productId);

  const openRequest = (branch: BranchAvailability) => {
    setRequestSource(branch);
    setQuantity('');
    setNotes('');
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestSource || !productId || !companyId) return;
    const parsedQuantity = Number(quantity);
    if (parsedQuantity <= 0 || parsedQuantity > requestSource.quantity) return;
    await createRequest.mutateAsync({
      sourceBranchId: requestSource.branchId,
      companyId,
      items: [{ productId, quantity: parsedQuantity }],
      notes: notes.trim() || undefined,
    });
    setRequestSource(null);
    setMainTab('requests');
    setDirection('outgoing');
  };

  const reject = (request: StockRequest) => {
    const reason = window.prompt('Motivo del rechazo');
    if (!reason?.trim()) return;
    rejectRequest.mutate({ id: request.id, reason: reason.trim() });
  };

  const cancel = (request: StockRequest) => {
    if (!window.confirm('¿Cancelar esta solicitud pendiente?')) return;
    cancelRequest.mutate(request.id);
  };

  const priceTierName = (tierId: string) =>
    tiers.find((tier) => tier.id === tierId)?.name || 'Precio';

  if (!selectedBranch) {
    return (
      <div className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 rounded-lg">
        Selecciona una sucursal para consultar y solicitar productos.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100">
            <PackageSearch size={20} className="text-primary-600" />
          </span>
          Stock entre sucursales
        </h1>
        <p className="ml-11 mt-0.5 text-sm text-gray-500">
          Sucursal actual: <span className="font-medium text-gray-700">{selectedBranch.name}</span>
        </p>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200">
        <button
          onClick={() => setMainTab('availability')}
          className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${
            mainTab === 'availability'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500'
          }`}
        >
          <PackageSearch size={16} /> Disponibilidad
        </button>
        <button
          onClick={() => setMainTab('requests')}
          className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${
            mainTab === 'requests'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500'
          }`}
        >
          <Send size={16} /> Solicitudes
        </button>
      </div>

      {mainTab === 'availability' && (
        <div>
          <div className="mb-5 grid gap-4 border-b border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2 rounded-lg">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Empresa</span>
              <select
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              >
                {branchCompanies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Producto</span>
              <SearchableSelect
                value={productId}
                onChange={setProductId}
                options={productOptions}
                placeholder={productsLoading ? 'Cargando productos...' : 'Buscar producto'}
                minChars={0}
              />
            </label>
          </div>

          {!productId && (
            <div className="border border-dashed border-gray-300 bg-white px-5 py-12 text-center rounded-lg">
              <PackageSearch size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Selecciona un producto</p>
              <p className="mt-1 text-xs text-gray-400">Verás su stock y precio en cada sucursal.</p>
            </div>
          )}

          {availability.isLoading && (
            <div className="py-12 text-center text-sm text-gray-500">Consultando sucursales...</div>
          )}

          {availability.isError && (
            <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700 rounded-lg">
              No se pudo consultar la disponibilidad del producto.
            </div>
          )}

          {availability.data && (
            <div className="overflow-hidden border border-gray-200 bg-white shadow-sm rounded-lg">
              <div className="flex flex-col gap-1 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-gray-800">{availability.data.productName}</div>
                  <div className="text-xs text-gray-500">Unidad: {availability.data.unit}</div>
                </div>
                <div className="text-xs text-gray-500">
                  {availability.data.branches.filter((branch) => branch.quantity > 0).length} sucursales con stock
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {availability.data.branches.map((branch) => (
                  <div
                    key={branch.branchId}
                    className={`grid gap-3 px-4 py-4 md:grid-cols-[minmax(180px,1fr)_120px_minmax(180px,1fr)_120px] md:items-center ${
                      branch.isCurrent ? 'bg-primary-50/60' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="flex-shrink-0 text-gray-400" />
                        <span className="truncate font-medium text-gray-800">{branch.branchName}</span>
                        {branch.isCurrent && (
                          <span className="whitespace-nowrap rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                            Actual
                          </span>
                        )}
                      </div>
                      <div className="ml-6 text-xs text-gray-400">{branch.branchCode}</div>
                    </div>

                    <div>
                      <div className={`text-lg font-bold ${branch.quantity > 0 ? 'text-gray-800' : 'text-red-600'}`}>
                        {branch.quantity.toLocaleString('es-PE')}
                      </div>
                      <div className="text-xs text-gray-400">{availability.data.unit}</div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {branch.prices.length > 0 ? branch.prices.map((price) => (
                        <div key={price.priceTierId} className="text-sm">
                          <span className="text-xs text-gray-500">{priceTierName(price.priceTierId)}:</span>{' '}
                          <span className="font-semibold text-gray-800">S/ {price.price.toFixed(2)}</span>
                        </div>
                      )) : (
                        <span className="text-xs text-amber-700">Sin precio configurado</span>
                      )}
                    </div>

                    <div className="md:text-right">
                      {!branch.isCurrent && branch.quantity > 0 ? (
                        <button
                          onClick={() => openRequest(branch)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 md:w-auto"
                        >
                          <Send size={15} /> Solicitar
                        </button>
                      ) : !branch.isCurrent ? (
                        <span className="text-xs text-gray-400">Sin disponibilidad</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mainTab === 'requests' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 bg-white p-4 shadow-sm sm:flex-row sm:items-end rounded-lg">
            <label className="block flex-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Dirección</span>
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as DirectionFilter)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">Todas</option>
                <option value="outgoing">Solicitadas por esta tienda</option>
                <option value="incoming">Solicitadas a esta tienda</option>
              </select>
            </label>
            <label className="block flex-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Estado</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StockRequestStatus | '')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {requests.isLoading && (
            <div className="py-12 text-center text-sm text-gray-500">Cargando solicitudes...</div>
          )}

          {!requests.isLoading && (requests.data?.data.length || 0) === 0 && (
            <div className="border border-dashed border-gray-300 bg-white px-5 py-12 text-center rounded-lg">
              <Send size={30} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No hay solicitudes con estos filtros</p>
            </div>
          )}

          <div className="space-y-3">
            {requests.data?.data.map((request) => {
              const incoming = request.sourceBranchId === selectedBranch.id;
              const otherBranch = incoming
                ? request.requestingBranchName
                : request.sourceBranchName;
              return (
                <article key={request.id} className="border border-gray-200 bg-white shadow-sm rounded-lg">
                  <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        incoming ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
                      }`}>
                        {incoming ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-800">
                          {incoming ? 'Solicitud recibida de' : 'Solicitud enviada a'} {otherBranch || 'otra sucursal'}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {request.requestedByName || 'Usuario'} · {
                            companies.find((company) => company.id === request.companyId)?.name || 'Empresa'
                          } · {formatDate(request.createdAt)}
                        </div>
                      </div>
                    </div>
                    <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[request.status]}`}>
                      {STATUS_LABELS[request.status]}
                    </span>
                  </div>

                  <div className="px-4 py-3">
                    <div className="space-y-2">
                      {request.items.map((item) => (
                        <div key={item.productId} className="flex items-center justify-between gap-4 text-sm">
                          <span className="min-w-0 truncate font-medium text-gray-700">
                            {item.productName || item.productId}
                          </span>
                          <span className="whitespace-nowrap text-gray-600">
                            Cant. {(item.approvedQuantity ?? item.requestedQuantity).toLocaleString('es-PE')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {request.notes && (
                      <div className="mt-3 border-l-2 border-gray-200 pl-3 text-xs text-gray-500 whitespace-pre-line">
                        {request.notes}
                      </div>
                    )}
                    {request.rejectionReason && (
                      <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        Motivo: {request.rejectionReason}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                      {incoming && canManage && request.status === 'PENDING' && (
                        <>
                          <button
                            disabled={isMutating}
                            onClick={() => approveRequest.mutate({ id: request.id })}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            <Check size={14} /> Aprobar
                          </button>
                          <button
                            disabled={isMutating}
                            onClick={() => reject(request)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            <X size={14} /> Rechazar
                          </button>
                        </>
                      )}
                      {incoming && canManage && request.status === 'APPROVED' && (
                        <button
                          disabled={isMutating}
                          onClick={() => dispatchRequest.mutate(request.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Truck size={14} /> Confirmar despacho
                        </button>
                      )}
                      {!incoming && canManage && request.status === 'IN_TRANSIT' && (
                        <button
                          disabled={isMutating}
                          onClick={() => receiveRequest.mutate(request.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          <PackageCheck size={14} /> Confirmar recepción
                        </button>
                      )}
                      {!incoming && request.status === 'PENDING' && (
                        <button
                          disabled={isMutating}
                          onClick={() => cancel(request)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <X size={14} /> Cancelar
                        </button>
                      )}
                      {request.status === 'IN_TRANSIT' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-violet-700">
                          <Truck size={14} /> Despachada {formatDate(request.dispatchedAt)}
                        </span>
                      )}
                      {request.status === 'RECEIVED' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                          <PackageCheck size={14} /> Recibida {formatDate(request.receivedAt)}
                        </span>
                      )}
                      {request.status === 'PENDING' && !incoming && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <Clock3 size={13} /> Esperando respuesta
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(requestSource)}
        onClose={() => setRequestSource(null)}
        title="Solicitar producto"
      >
        <form onSubmit={submitRequest} className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="font-semibold text-gray-800">{selectedProduct?.name}</div>
            <div className="mt-1 text-sm text-gray-600">
              Desde {requestSource?.branchName} · Disponible: {requestSource?.quantity.toLocaleString('es-PE')} {selectedProduct?.unit}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Cantidad</span>
            <input
              autoFocus
              type="number"
              min="0.0001"
              max={requestSource?.quantity}
              step="0.0001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Nota opcional</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Urgencia, referencia o detalle del pedido"
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setRequestSource(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createRequest.isPending || Number(quantity) <= 0 || Number(quantity) > (requestSource?.quantity || 0)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={15} /> {createRequest.isPending ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
