import { BrandLogo } from '../../../shared/components/BrandLogo';
import { commercialPaymentTotals } from '../../../shared/branding/commercialDocumentPdf';
import { numberToWords } from '../../quotes/utils/numberToWords';
import { billingMoney, billingQuantity } from '../utils/documentPresentation';
import type { SaleNotePrintDocument } from '../utils/printTypes';

/** Commercial A4 preview follows the same sections and historical amounts as the downloaded PDF. */
export function SaleNotePaper({ document }: { document: SaleNotePrintDocument }) {
  const payments = commercialPaymentTotals(document.total, document.payments);
  const accounts = (document.issuerBankAccounts || []).filter(account => account.isActive);
  const date = new Date(document.saleDate).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
  return <article className="billing-sheet sale-note-paper" aria-label="Hoja A4: NOTA DE VENTA">
    <header className="sale-note-header">
      <BrandLogo variant="compact" className="sale-note-logo" />
      <div className="sale-note-company"><h3>{document.issuer.name}</h3>{document.issuer.address && <p>Dirección: {document.issuer.address}</p>}{document.issuerPhone && <p>Teléfono: {document.issuerPhone}</p>}</div>
      <div className="sale-note-reference"><p>R.U.C. {document.issuer.documentNumber || '—'}</p><h2>NOTA DE VENTA</h2><strong>{document.internalReference}</strong></div>
    </header>
    {document.status === 'DISCARDED' && <p className="sale-note-cancelled">VENTA ANULADA</p>}
    <h4>DATOS DEL CLIENTE</h4>
    <dl className="sale-note-client"><div className="sale-note-wide"><dt>Cliente</dt><dd>{document.receiver.name}</dd></div><div className="sale-note-wide"><dt>R.U.C. / D.N.I.</dt><dd>{document.receiver.documentNumber || '—'}</dd></div><div><dt>Dirección</dt><dd>{document.receiver.address || '—'}</dd></div><div><dt>Moneda</dt><dd>PEN — Soles</dd></div><div><dt>Fecha Emisión</dt><dd>{date}</dd></div><div><dt>Condición de venta</dt><dd>{document.paymentCondition === 'CREDITO' ? 'CRÉDITO' : 'CONTADO'}</dd></div></dl>
    <h4>DETALLE DE LA VENTA</h4>
    <table className="sale-note-items"><thead><tr><th>ÍTEM</th><th>DESCRIPCIÓN</th><th>CANT.</th><th>U.M.</th><th>P. UNIT.</th><th>IMPORTE</th></tr></thead><tbody>
      {document.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td>{index + 1}</td><td>{item.description}</td><td>{billingQuantity(item.quantity)}</td><td>{item.unit}</td><td>{item.unitPrice.toFixed(2)}</td><td>{item.total.toFixed(2)}</td></tr>)}
      {Array.from({ length: Math.max(0, 6 - document.items.length) }, (_, index) => <tr aria-hidden="true" key={`blank-${index}`} className="sale-note-blank"><td>&nbsp;</td><td /><td /><td /><td /><td /></tr>)}
    </tbody></table>
    <p className="sale-note-words"><b>SON: </b>{numberToWords(document.total, 'PEN')}</p>
    <div className="sale-note-bottom">
      <section><h4>CONDICIÓN Y PAGOS REGISTRADOS</h4><dl className="sale-note-payments"><div className="sale-note-payment-title"><dt>Condición de venta</dt><dd>{document.paymentCondition === 'CREDITO' ? 'CRÉDITO' : 'CONTADO'}</dd></div>{document.payments?.map((payment, index) => <div key={index}><dt>{payment.paymentMethodName}</dt><dd>{billingMoney(payment.amount)}</dd></div>)}{document.paymentCondition === 'CREDITO' && <><div><dt>Abono inicial</dt><dd>{billingMoney(payments.paid)}</dd></div><div className="sale-note-pending"><dt>Saldo inicial</dt><dd>{billingMoney(payments.pending)}</dd></div></>}</dl>{document.paymentCondition === 'CREDITO' && <p className="sale-note-credit-help">Los abonos posteriores y el saldo actual se consultan en Créditos.</p>}</section>
      <dl className="sale-note-totals"><div><dt>OP. GRAVADAS</dt><dd>{billingMoney(document.taxableAmount)}</dd></div><div><dt>OP. EXONERADAS</dt><dd>{billingMoney(document.exemptAmount)}</dd></div>{document.unaffectedAmount > 0 && <div><dt>OP. INAFECTAS</dt><dd>{billingMoney(document.unaffectedAmount)}</dd></div>}<div><dt>I.G.V.</dt><dd>{billingMoney(document.taxAmount)}</dd></div><div className="sale-note-total"><dt>IMPORTE TOTAL</dt><dd>{billingMoney(document.total)}</dd></div></dl>
    </div>
    {accounts.length > 0 && <section className="sale-note-accounts"><h4>FORMAS DE PAGO</h4><table><thead><tr><th>Banco</th><th>Cuenta</th><th>CCI</th><th>Titular</th></tr></thead><tbody>{accounts.map((account, index) => <tr key={index}><td>{account.bank} ({account.currency})</td><td>{account.accountNumber}</td><td>{account.cci || '—'}</td><td>{account.holder}</td></tr>)}</tbody></table></section>}
    <footer className="sale-note-footer"><p>Nota de venta interna. Sin validez tributaria. No sustituye el comprobante electrónico.</p><p>Agromax · Innovando la agricultura</p></footer>
  </article>;
}
