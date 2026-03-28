import { call } from './frappe-sdk';

const get = (method: string, params: Record<string, unknown> = {}) =>
  call.get<{ message?: unknown }>(method, params).then((r) => (r.message !== undefined ? r.message : r));

export interface TodaySummary {
  total_invoices: number;
  net_total: number;
  taxes: number;
  grand_total: number;
}

export interface DaywiseRow {
  date: string;
  total_invoices: number;
  grand_total: number;
}

export interface ItemWiseRow {
  item_code: string;
  item_name: string;
  qty: number;
  amount: number;
}

export interface TimeWiseRow {
  time_interval: string;
  order: number;
  sales: number;
  bills: number;
}

export interface LowStockRow {
  item_code: string;
  item_name: string;
  actual_qty: number;
  reorder_level: number;
}

export interface PaymentSummaryRow {
  mode_of_payment: string;
  invoices: number;
  amount: number;
}

export interface ProductionSaleVarianceRow {
  item_code: string;
  item_name: string;
  produced_qty: number;
  sold_qty: number;
  current_stock: number;
  variance: number;
  variance_pct: number;
}

export interface WastageByReasonRow {
  reason: string;
  item_code?: string;
  item_name?: string;
  qty: number;
  amount?: number;
}

export interface WastageByReasonSummary {
  reason: string;
  entries: number;
  total_qty: number;
  total_amount: number;
}

export interface StaffPerformanceRow {
  staff_name: string;
  total_invoices: number;
  total_amount: number;
}

export interface TableOccupancyRow {
  table_name: string;
  room_name: string;
  num_bills: number;
  total_minutes: number;
  avg_minutes: number;
}

export interface POSClosingEntryRow {
  name: string;
  posting_date: string;
  posting_time: string | null;
  period_start_date: string | null;
  period_end_date: string | null;
  pos_profile: string | null;
  user: string | null;
  status: string | null;
  total_quantity: number;
  net_total: number;
  total_taxes_and_charges: number;
  grand_total: number;
}

export async function getPOSClosingEntriesList(
  fromDate: string,
  toDate: string,
  branch?: string,
  limit?: number
): Promise<POSClosingEntryRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_closing_entries_list', {
    from_date: fromDate,
    to_date: toDate,
    limit: limit ?? 100,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as POSClosingEntryRow[]) : [];
}

export async function getReportTodaySummary(branch?: string): Promise<TodaySummary> {
  return get('ury.ury_pos.api.get_pos_report_today_summary', branch ? { branch } : {}) as Promise<TodaySummary>;
}

export async function getReportDaywiseSales(
  fromDate: string,
  toDate: string,
  branch?: string
): Promise<DaywiseRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_daywise_sales', {
    from_date: fromDate,
    to_date: toDate,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as DaywiseRow[]) : [];
}

export async function getReportItemWiseSales(
  fromDate: string,
  toDate: string,
  limit?: number,
  branch?: string,
  sortBy: 'both' | 'qty' | 'sales' = 'both'
): Promise<ItemWiseRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_item_wise_sales', {
    from_date: fromDate,
    to_date: toDate,
    limit: limit ?? 30,
    sort_by: sortBy,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as ItemWiseRow[]) : [];
}

export async function getReportTimeWiseSales(date: string, branch?: string): Promise<TimeWiseRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_time_wise_sales', {
    date,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as TimeWiseRow[]) : [];
}

export async function getReportLowStock(posProfile: string): Promise<LowStockRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_low_stock', { pos_profile: posProfile });
  return Array.isArray(list) ? (list as LowStockRow[]) : [];
}

export async function getReportPaymentSummary(
  fromDate: string,
  toDate: string,
  branch?: string
): Promise<PaymentSummaryRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_payment_summary', {
    from_date: fromDate,
    to_date: toDate,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as PaymentSummaryRow[]) : [];
}

export async function getProductionSaleVarianceReport(
  fromDate: string,
  toDate: string,
  branch?: string,
  posProfile?: string
): Promise<ProductionSaleVarianceRow[]> {
  const list = await get('ury.ury_pos.api.get_production_sale_variance_report', {
    from_date: fromDate,
    to_date: toDate,
    ...(branch ? { branch } : {}),
    ...(posProfile ? { pos_profile: posProfile } : {}),
  });
  return Array.isArray(list) ? (list as ProductionSaleVarianceRow[]) : [];
}

export interface WastageByReasonReportResult {
  by_item: WastageByReasonRow[];
  by_reason: WastageByReasonSummary[];
  total_wastage_amount?: number;
  from_date?: string;
  to_date?: string;
}

export async function getWastageByReasonReport(
  fromDate: string,
  toDate: string,
  reason?: string
): Promise<WastageByReasonReportResult> {
  const res = await get('ury.ury_pos.api.get_wastage_by_reason_report', {
    from_date: fromDate,
    to_date: toDate,
    ...(reason ? { reason } : {}),
  }) as WastageByReasonReportResult & { by_item?: WastageByReasonRow[]; by_reason?: WastageByReasonSummary[] };
  return {
    by_item: Array.isArray(res?.by_item) ? res.by_item : [],
    by_reason: Array.isArray(res?.by_reason) ? res.by_reason : [],
    total_wastage_amount: res?.total_wastage_amount ?? 0,
    from_date: res?.from_date,
    to_date: res?.to_date,
  };
}

export async function getReportSalesByStaff(
  fromDate: string,
  toDate: string,
  branch?: string
): Promise<StaffPerformanceRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_sales_by_staff', {
    from_date: fromDate,
    to_date: toDate,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as StaffPerformanceRow[]) : [];
}

export async function getReportTableOccupancy(
  fromDate: string,
  toDate: string,
  branch?: string
): Promise<TableOccupancyRow[]> {
  const list = await get('ury.ury_pos.api.get_pos_report_table_occupancy', {
    from_date: fromDate,
    to_date: toDate,
    ...(branch ? { branch } : {}),
  });
  return Array.isArray(list) ? (list as TableOccupancyRow[]) : [];
}
