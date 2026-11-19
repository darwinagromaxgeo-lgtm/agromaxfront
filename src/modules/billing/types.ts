export type BillingDocumentType = 'FACTURA' | 'BOLETA';
export type BillingTaxType = 'GRAVADO' | 'EXONERADO' | 'INAFECTO';
export type BillingStatus = 'DRAFT' | 'SENDING' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN' | 'DISCARDED';

export interface BillingParty {
  name: string;
  documentType: 'RUC' | 'DNI' | 'UNIDENTIFIED';
  documentNumber?: string;
  address?: string;
  establishmentCode?: string;
  email?: string;
}

export interface BillingItem {
  productId: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxType: BillingTaxType;
  taxRate: number;
  baseAmount: number;
  taxAmount: number;
  total: number;
}

export interface BillingDocument {
  id: string;
  branchId: string;
  companyId: string;
  saleId: string;
  documentType: BillingDocumentType;
  taxType: BillingTaxType;
  status: BillingStatus;
  currency: 'PEN';
  issuer: BillingParty;
  receiver: BillingParty;
  receiverRevision?: number;
  items: BillingItem[];
  taxableAmount: number;
  exemptAmount: number;
  unaffectedAmount: number;
  taxAmount: number;
  total: number;
  paymentCondition: 'CONTADO' | 'CREDITO';
  saleDate: string;
  createdAt?: string;
  submittedAt?: string;
  hash?: string;
  legacyTaxData: boolean;
  warnings: string[];
  series?: string;
  number?: number;
  environment?: 'beta' | 'production';
  ticket?: string;
  sunatCode?: string;
  sunatDescription?: string;
  hasPdf?: boolean;
  hasXml?: boolean;
  hasCdr?: boolean;
  discardReason?: string;
  cancelledByCreditNoteId?:string;
  cancelledAt?:string;
  cancellationReason?:string;
  replacesDocumentId?:string;
  reissueAfterCreditNoteId?:string;
  replacementDocumentId?:string;
}

export interface BillingProviderStatus {
  configured: boolean;
  ready: boolean;
  environment?: 'simulation' | 'beta' | 'production';
  simulationReady?: boolean;
  issuerRuc?: string;
  issuerName?: string;
  issuerAddress?: string;
  boletaSubmissionMode?: 'individual' | 'summary';
  series?: { FACTURA: string; BOLETA: string };
  supportedDocumentTypes: BillingDocumentType[];
  creditNotes?: { ready:boolean; cancellationReady?:boolean; series:{ FACTURA:string; BOLETA:string }; message:string };
  message: string;
}

export interface BillingGroup { companyId: string; companyName: string; taxType: BillingTaxType; total: number; items: number; }
export interface BillingDraftInput { saleId: string; companyId: string; documentType: BillingDocumentType; taxType: BillingTaxType; legacyTaxConfirmed?: boolean; receiver?: BillingParty; replacesDocumentId?:string; }
export interface BillingFilters { page: number; limit: number; companyId?: string; saleId?: string; saleIds?: string[]; documentType?: BillingDocumentType; status?: BillingStatus; startDate?: string; endDate?: string; }
export interface BillingSimulation {
  simulation: true;
  status: 'SIMULATED';
  document: BillingDocument;
  checks: { label: string; passed: boolean; detail: string }[];
  dataReady: boolean;
  message: string;
  service?: { verified: boolean; message: string; pdfBase64?: string; xmlBase64?: string };
}

export interface BillingCreditNote extends Omit<BillingDocument,'documentType'|'items'> {
  documentType:'NOTA_CREDITO';
  originalDocumentId:string;
  originalDocumentType:BillingDocumentType;
  originalSeries:string;
  originalNumber:number;
  originalIssuedAt:string;
  reasonCode:'01'|'06'|'07';
  reasonDescription:string;
  items:(BillingItem & { originalItemIndex:number })[];
}
export interface CreditNoteInput {
  originalDocumentId:string;
  returnType:'CANCEL'|'TOTAL'|'PARTIAL';
  reason:string;
  items?:{ itemIndex:number; quantity:number }[];
}
export interface CreditNoteAvailability {
  original:BillingDocument;
  items:(BillingItem & { itemIndex:number; creditedQuantity:number; availableQuantity:number; availableAmount:number })[];
  notes:BillingCreditNote[];
}
