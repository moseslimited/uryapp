import { call } from './frappe-sdk';

export interface WarehouseOption {
  name: string;
  warehouse_name: string;
}

export function getWarehousesForTransfer(company?: string): Promise<WarehouseOption[]> {
  return call
    .get('ury.ury_pos.api.get_warehouses_for_transfer', { company })
    .then((r: { message?: WarehouseOption[] } | WarehouseOption[]) => (Array.isArray(r) ? r : (r as { message?: WarehouseOption[] }).message ?? []));
}

export function createStockTransfer(params: {
  from_warehouse: string;
  to_warehouse: string;
  items: Array<{ item_code: string; qty: number }>;
  company?: string;
}): Promise<{ stock_entry: string; message: string }> {
  return call
    .post('ury.ury_pos.api.create_stock_transfer', {
      from_warehouse: params.from_warehouse,
      to_warehouse: params.to_warehouse,
      items: params.items,
      company: params.company,
    })
    .then((r: { message?: { stock_entry: string; message: string } }) => r.message!);
}
