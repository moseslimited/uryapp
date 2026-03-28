import { DOCTYPES } from '../data/doctypes';
import { db, call } from './frappe-sdk';

export interface Customer {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: number;
  idx: number;
  naming_series: string;
  customer_name: string;
  customer_type: string;
  mobile_number: string;
  customer_group: string;
  territory: string;
  is_internal_customer: number;
  language: string;
  default_commission_rate: number;
  so_required: number;
  dn_required: number;
  is_frozen: number;
  disabled: number;
  doctype: string;
  companies: any[];
  credit_limits: any[];
  accounts: any[];
  sales_team: any[];
  portal_users: any[];
}

export interface CreateCustomerData {
  customer_name: string;
  mobile_number: string;
  customer_group?: string;
  territory?: string;
  /** Set true so guest appears in POS list (first-time or e.g. conference sign-in). */
  custom_is_restaurant_customer?: boolean;
}

export interface CreateCustomerResponse {
  data: Customer;
  _server_messages?: string;
}

export async function getCustomerGroups() {
  const groups = await db.getDocList(DOCTYPES.CUSTOMER_GROUP, {
    fields: ['name'],
    limit: "*" as unknown as number,
    orderBy: {
      field: 'name',
      order: 'asc',
    },
  });
  return groups;
}

export async function getCustomerTerritories() {
  const territories = await db.getDocList(DOCTYPES.CUSTOMER_TERRITORY, {
    fields: ['name'],
    limit: "*" as unknown as number,
    orderBy: {
      field: 'name',
      order: 'asc',
    },
  });
  return territories;
}

export async function addCustomer(customerData: CreateCustomerData): Promise<CreateCustomerResponse> {
  try {
    const data = await call.post<{ message?: Customer }>(
      'ury.ury_pos.api.create_restaurant_customer',
      {
        customer_name: customerData.customer_name,
        mobile_number: customerData.mobile_number,
        customer_group: customerData.customer_group || undefined,
        territory: customerData.territory || undefined,
        custom_is_restaurant_customer: customerData.custom_is_restaurant_customer,
      }
    );
    const created = data?.message ?? data;
    if (!created) throw new Error('No customer returned');
    return { data: created as Customer };
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
}

/** Map restaurant customer API row to search result shape. */
function toSearchResult(c: { name: string; customer_name?: string; mobile_no?: string; mobile_number?: string }) {
  const mobile = (c as { mobile_number?: string }).mobile_number ?? c.mobile_no ?? '';
  return {
    name: c.name,
    content: `Customer Name : ${c.customer_name || c.name} | Mobile Number : ${mobile}`,
  };
}

/**
 * Get recent restaurant customers (have at least one submitted POS Invoice).
 */
export async function getRecentCustomers(limit = 10) {
  try {
    const list = await call.get<{ message?: Array<{ name: string; customer_name?: string; mobile_no?: string; mobile_number?: string }> }>(
      'ury.ury_pos.api.get_restaurant_customers',
      { limit }
    );
    const customers = list.message ?? [];
    return customers.map(toSearchResult);
  } catch (error) {
    console.error('Error fetching recent customers:', error);
    throw error;
  }
}

/**
 * Search restaurant customers (name/mobile) with deduplication.
 */
export async function searchCustomers(search: string, limit = 10) {
  try {
    const res = await call.get<{ message?: Array<{ name: string; customer_name?: string; mobile_no?: string; mobile_number?: string }> }>(
      'ury.ury_pos.api.get_restaurant_customers',
      { search: search?.trim() || undefined, limit: limit * 2 }
    );
    const list = res.message ?? [];
    const results = list.map(toSearchResult);

    const seen = new Set<string>();
    const deduplicated: typeof results = [];
    for (const customer of results) {
      const name = customer.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || customer.name;
      const phone = customer.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '';
      const key = `${name.toLowerCase().trim()}|${phone.trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(customer);
        if (deduplicated.length >= limit) break;
      }
    }
    return deduplicated;
  } catch (error) {
    console.error('Customer search error:', error);
    throw error;
  }
}