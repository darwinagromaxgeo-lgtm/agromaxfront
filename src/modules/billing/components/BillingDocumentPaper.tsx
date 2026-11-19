import { BrandLogo } from '../../../shared/components/BrandLogo';
import type { BillingPrintDocument } from '../utils/printTypes';
import { billingMoney, billingPresentation, billingQuantity, type BillingPreviewOptions, type BillingPrintFormat } from '../utils/documentPresentation';
import './billingPreview.css';

export function BillingDocumentPaper({ document, format, options = {} }: {
  document: BillingPrintDocument; format: BillingPrintFormat; options?: BillingPreviewOptions;
}) {
  const view = billingPresentation(document, options);
  const ticket = format === 'TICKET';
  return <article className={`billing-sheet ${ticket ? 'billing-sheet-ticket' : 'billing-sheet-a4'}`} aria-label={`${ticket ? 'Ticket de 80 mm' : 'Hoja A4'}: ${view.title}`}>
    <header className="billing-sheet-header">
      <div className="billing-sheet-brand"><BrandLogo variant="compact" className="billing-sheet-logo" /><h3>{document.issuer.name}</h3><p className="billing-sheet-ruc">{view.issuerIdentity}</p><p>{view.issuerAddress}</p></div>
      <div className="billing-sheet-reference"><p>{view.title}</p><strong>{view.reference}</strong><span>{view.label}</span></div>
    </header>
    <section className="billing-sheet-customer">
      <div><p className="billing-sheet-caption">CLIENTE</p><strong>{document.receiver.name}</strong><p>{document.receiver.documentType === 'UNIDENTIFIED' ? 'Documento' : document.receiver.documentType}: {document.receiver.documentNumber || 'Sin identificación'}</p>{document.receiver.address && <p>{document.receiver.address}</p>}</div>
      <div className="billing-sheet-meta"><p><span>Fecha</span><b>{view.date}</b></p><p><span>Condición de pago</span><b>{view.payment}</b></p><p><span>Afectación</span><b>{view.tax}</b></p></div>
    </section>
    {document.documentType === 'NOTA_CREDITO' && <section className="billing-sheet-customer"><div><p>Comprobante afectado: <strong>{document.originalSeries}-{String(document.originalNumber).padStart(8,'0')}</strong></p><p>Motivo {document.reasonCode}: {document.reasonDescription}</p></div></section>}
    <table className="billing-sheet-items">
      <thead><tr><th>{ticket ? 'DETALLE' : 'DESCRIPCIÓN'}</th>{!ticket && <><th>CANT.</th><th>UND.</th><th>P. UNIT.</th></>}<th>IMPORTE</th></tr></thead>
      <tbody>{document.items.map((item, index) => <tr key={`${item.productId}-${index}`}>
        <td><strong>{item.description}</strong>{ticket && <small>{billingQuantity(item.quantity)} {item.unit} × {billingMoney(item.unitPrice)}</small>}</td>
        {!ticket && <><td>{billingQuantity(item.quantity)}</td><td>{item.unit}</td><td>{billingMoney(item.unitPrice)}</td></>}
        <td>{billingMoney(item.total)}</td>
      </tr>)}</tbody>
    </table>
    <section className="billing-sheet-totals">
      {(!ticket || document.taxableAmount > 0) && <p><span>Op. gravadas</span><b>{billingMoney(document.taxableAmount)}</b></p>}
      {(!ticket || document.exemptAmount > 0) && <p><span>Op. exoneradas</span><b>{billingMoney(document.exemptAmount)}</b></p>}
      {(!ticket || document.unaffectedAmount > 0) && <p><span>Op. inafectas</span><b>{billingMoney(document.unaffectedAmount)}</b></p>}
      <p><span>IGV</span><b>{billingMoney(document.taxAmount)}</b></p>
      <p className="billing-sheet-grand-total"><span>{document.documentType === 'NOTA_CREDITO' ? 'TOTAL A ACREDITAR' : 'TOTAL A PAGAR'}</span><b>{billingMoney(document.total)}</b></p>
    </section>
    <footer className="billing-sheet-footer"><p className={view.nonFiscal ? 'billing-sheet-notice' : ''}>{view.notice}</p>{!view.nonFiscal && document.hash && <p className="billing-sheet-hash">Hash: {document.hash}</p>}<p className="billing-sheet-thanks">Gracias por tu compra</p><p>Agromax · Innovando la agricultura</p></footer>
  </article>;
}
