import { call } from './frappe-sdk';

export interface PartySummaryRow {
  name: string;
  customer_name?: string;
  supplier_name?: string;
  unpaid_total: number;
}

export interface PayLaterInvoiceRow {
  name: string;
  posting_date: string;
  amount: number;
}

export interface CustomerPayLaterRow {
  name: string;
  customer_name: string;
  total: number;
  invoices: PayLaterInvoiceRow[];
}

export interface PartiesUnpaidResponse {
  customers: PartySummaryRow[];
  suppliers: PartySummaryRow[];
  customer_pay_later?: CustomerPayLaterRow[];
}

export async function getCustomersSuppliersUnpaid(): Promise<PartiesUnpaidResponse> {
  const res = await call.get<PartiesUnpaidResponse | { message?: PartiesUnpaidResponse }>(
    'ury.ury_pos.api.get_customers_suppliers_unpaid'
  );
  if (typeof (res as { message?: PartiesUnpaidResponse }).message !== 'undefined') {
    return (res as { message?: PartiesUnpaidResponse }).message || { customers: [], suppliers: [] };
  }
  return (res as PartiesUnpaidResponse) || { customers: [], suppliers: [] };
}

export interface UnpaidInvoiceRow {
  name: string;
  posting_date: string;
  outstanding_amount: number;
  grand_total: number;
  status?: string;
  doc_type: string;
  currency?: string;
  supplier?: string;
  supplier_name?: string;
  purchase_receipt?: string | null;
}

export async function getUnpaidInvoicesForParty(
  partyType: 'Customer' | 'Supplier',
  party: string
): Promise<UnpaidInvoiceRow[]> {
  const res = await call.get<UnpaidInvoiceRow[] | { message?: UnpaidInvoiceRow[] }>(
    'ury.ury_pos.api.get_unpaid_invoices_for_party',
    { party_type: partyType, party }
  );
  const msg = (res as { message?: UnpaidInvoiceRow[] }).message;
  if (Array.isArray(msg)) return msg;
  if (Array.isArray(res)) return res as UnpaidInvoiceRow[];
  return [];
}

export interface CustomerUnpaidLine {
  line_kind: 'sales_invoice' | 'pay_later';
  customer: string;
  customer_name: string;
  document: string;
  posting_date: string;
  amount: number;
  outstanding: number;
  grand_total: number;
  status: string;
}

export interface SupplierUnpaidLine {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string;
  outstanding_amount: number;
  grand_total: number;
  status: string;
  currency: string;
  purchase_receipt?: string | null;
}

export interface UnpaidPartyLinesResponse {
  customer_lines: CustomerUnpaidLine[];
  supplier_lines: SupplierUnpaidLine[];
}

export async function getUnpaidPartyLines(): Promise<UnpaidPartyLinesResponse> {
  const res = await call.get<UnpaidPartyLinesResponse | { message?: UnpaidPartyLinesResponse }>(
    'ury.ury_pos.api.get_unpaid_party_lines'
  );
  const msg = (res as { message?: UnpaidPartyLinesResponse }).message;
  if (msg && typeof msg === 'object' && 'customer_lines' in msg) return msg;
  if (res && typeof res === 'object' && 'customer_lines' in (res as object)) {
    return res as UnpaidPartyLinesResponse;
  }
  return { customer_lines: [], supplier_lines: [] };
}

