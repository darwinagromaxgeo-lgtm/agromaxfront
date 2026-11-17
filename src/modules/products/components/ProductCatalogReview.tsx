import type { Product } from '../../../shared/types';

export function ProductCatalogReview({ product }: { product: Product }) {
  const source = product.catalogImport;
  if (!source) return null;
  if (source.format === 'SAUSAL_EXPORT') return <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 space-y-2">
    <p className="font-semibold">Catálogo de {source.branchName} · SKU {source.sourceSku}</p>
    <p>Presentación de venta: {source.presentation}. Unidad fiscal del archivo: NIU. Una unidad corresponde a esta presentación, sin conversión automática de cajas o sobres.</p>
    <p>IGV registrado según el Excel: {product.taxType === 'EXONERADO' ? 'exonerado' : 'gravado'}.</p>
    <p>Precio de venta del archivo: S/ {(source.baseSalePrice || 0).toFixed(2)}.</p>
    {source.offerActive && <p>Oferta de origen: S/ {(source.offerSalePrice || 0).toFixed(2)}, conservada como referencia. No se aplica como descuento automático.</p>}
    {product.catalogStatus === 'PENDING_REVIEW' && <p className="font-medium text-amber-800">Completa un precio de venta válido para habilitar este producto en el POS.</p>}
    {(source.stockStatus === 'IMPORTED' || source.stockStatus === 'IMPORTED_INACTIVE') && <p>Saldo inicial importado en Sausal: {source.sourceStock} unidades de esta presentación. Confirmado el {source.sourceDate.split('-').reverse().join('/')}. Consulta Stock para ver el saldo después de nuevos movimientos.</p>}
    {source.stockStatus === 'IMPORTED_INACTIVE' && <p>El producto figura de baja. Se conservó su saldo en inventario y permanece inactivo para ventas.</p>}
    {source.stockStatus === 'PENDING_NEGATIVE' && <p className="font-medium text-amber-800">El archivo registra un saldo negativo ({source.sourceStock}). Quedó pendiente de revisión y no se cargó como stock disponible.</p>}
    {source.stockStatus === 'INACTIVE_SOURCE' && <p>El producto figura de baja en el archivo. Se conservó inactivo, sin cargar existencias.</p>}
    {!!source.reviewNotes.length && <details><summary className="cursor-pointer font-medium">Observaciones</summary><ul className="list-disc pl-5 mt-2 space-y-1">{source.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
    {source.originalExportRow && <details><summary className="cursor-pointer font-medium">Ver datos originales · {source.sources.join(', ')}</summary><dl className="mt-2 space-y-1">{Object.entries(source.originalExportRow).map(([label, value]) => <div key={label}><dt className="inline font-medium">{label}: </dt><dd className="inline break-words">{value === '' ? '—' : String(value)}</dd></div>)}</dl></details>}
  </aside>;
  return <aside className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 space-y-2">
    <p className="font-semibold">Catálogo importado de {source.branchName}</p>
    {product.catalogStatus === 'PENDING_REVIEW' && <p>Completa el precio, la unidad de venta, la categoría y el IGV para habilitar este producto en el punto de venta.</p>}
    <p>Presentación original: {source.presentation}. Conteo físico: {source.sourceDate.split('-').reverse().join('/')}.</p>
    {source.taxConfiguration === 'PROVISIONAL_GRAVADO' && <p className="font-medium">IGV temporal: gravado al 18%. Revisa la afectación correspondiente antes de emitir comprobantes reales.</p>}
    {source.taxProposal && <p>Propuesta de la revisión inicial: {source.taxProposal.toLowerCase()}.</p>}
    <p>El conteo del Excel se conserva como referencia; todavía no se ha agregado al stock disponible.</p>
    {!!source.reviewNotes.length && <details><summary className="cursor-pointer font-medium">Observaciones de la importación</summary><ul className="list-disc pl-5 mt-2 space-y-1">{source.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
    <details><summary className="cursor-pointer font-medium">Ver filas originales ({source.originalRows.length})</summary><ul className="mt-2 space-y-2">{source.originalRows.map(row => <li key={row.source} className="border-t border-amber-200 pt-2"><p>{row.source} · Cantidad: {row.quantity} · Estado: {row.state}</p><p>Lote: {row.lot || 'sin dato'} · Vencimiento: {row.expiration || 'sin dato'}</p>{row.notes && <p>{row.notes}</p>}</li>)}</ul></details>
  </aside>;
}
