import { call } from './frappe-sdk';

export interface POSInvoiceItem {
  name: string;
  item_code: string;
  item_name: string;
  description: string;
  item_group: string;
  image: string;
  qty: number;
  comment: string;
  rate: number;
  amount: number;
  discount_percentage: number;
  discount_amount: number;
  custom_ury_line_kind?: 'Normal' | 'Included' | 'Giveaway' | string;
}

export interface POSInvoice {
  name: string;
  title: string;
  customer: string;
  customer_name: string;
  mobile_number: string;
  customer_group: string;
  territory: string;
  posting_date: string;
  posting_time: string;
  order_type: string;
  restaurant_table: string;
  custom_restaurant_room: string;
  status: string;
  total: number;
  grand_total: number;
  items: POSInvoiceItem[];
}

export interface TableOrder {
  message: POSInvoice | null;
}

/**
 * Fetches the current active order/invoice for a table if any exists (single order - for backward compatibility).
 * Prefer getTableOrders + getOrderByInvoiceId for multiple orders per table.
 */
export async function getTableOrder(table_no: string): Promise<TableOrder> {
  const { call } = await import('./frappe-sdk');
  try {
    const res = await call.get('ury.ury.doctype.ury_order.ury_order.get_order_invoice', {
      table: table_no
    });
    return res as TableOrder;
  } catch (error) {
    console.error('Error fetching table order:', error);
    return { message: null };
  }
}

/** List of draft orders at a table (multiple orders per table). */
export interface TableOrderSummary {
  name: string;
  customer: string;
  customer_name: string;
  grand_total: number;
  rounded_total: number;
  posting_date: string;
  posting_time: string;
  modified: string;
  status?: string;
}

export async function getTableOrders(table_name: string): Promise<TableOrderSummary[]> {
  const { call } = await import('./frappe-sdk');
  try {
    const res = await call.get<{ message?: TableOrderSummary[] } | TableOrderSummary[]>('ury.ury_pos.api.get_table_orders', {
      table_name
    });
    if (Array.isArray(res)) return res;
    return res?.message ?? [];
  } catch (error) {
    console.error('Error fetching table orders:', error);
    return [];
  }
}

/** Fetch one order by invoice name for loading into POS cart. */
export async function getOrderByInvoiceId(invoice_name: string): Promise<POSInvoice | null> {
  const { call } = await import('./frappe-sdk');
  try {
    const res = await call.get<{ message?: POSInvoice | null }>('ury.ury_pos.api.get_order_for_pos', {
      invoice_name
    });
    return res?.message ?? null;
  } catch (error) {
    console.error('Error fetching order by id:', error);
    return null;
  }
} 

export interface SyncOrderRequest {
  table?: string;
  customer?: string;
  items: Array<{
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    comment?: string;
    /** Zero-rated line; stock still moves via BOM when applicable */
    is_giveaway?: boolean;
    /** Extra invoice rows at rate 0 for included menu choices */
    included_modifiers?: Array<{
      item: string;
      item_name: string;
      qty_factor?: number;
      group_id?: string;
      group_label?: string;
    }>;
  }>;
  no_of_pax: number;
  mode_of_payment?: string;
  cashier?: string;
  owner?: string;
  waiter?: string;
  pos_profile: string;
  invoice: string | null;
  aggregator_id?: string | null;
  order_type: string;
  last_invoice: string | null;
  comments?: string | null;
  room?: string;
  staff_code?: string;
  staff_user?: string;
  staff_name?: string;
  last_modified_time?: string | null;
}

export interface SyncOrderResponse {
  status?: string;
  name?: string;
  [key: string]: unknown;
}

export const syncOrder = async (data: SyncOrderRequest): Promise<SyncOrderResponse> => {
  const res = await call.post<{ message?: SyncOrderResponse } | SyncOrderResponse>(
    'ury.ury.doctype.ury_order.ury_order.sync_order',
    data
  );
  const out = (res as { message?: SyncOrderResponse }).message ?? (res as SyncOrderResponse);
  if (out?.status === 'Failure') {
    throw new Error('Order could not be updated. It may have been modified elsewhere or you may not have permission.');
  }
  return out;
}; 