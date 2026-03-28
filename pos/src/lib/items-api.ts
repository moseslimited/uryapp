import { call } from './frappe-sdk';

export interface SellableItemRow {
  item_code: string;
  item_name: string;
  rate: number;
  actual_qty: number;
  stock_value: number;
  unit_cost?: number;
  recent_sale_price?: number;
  has_bom: number;
}

export interface BOMItemRow {
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  current_stock: number;
  recent_price: number;
  amount: number;
}

export interface WarehouseBreakdownRow {
  warehouse: string;
  actual_qty: number;
  valuation_rate: number;
  stock_value: number;
}

export interface ItemInventoryDetail {
  item_code: string;
  item_name: string;
  stock_uom: string;
  is_stock_item: number;
  actual_qty: number;
  valuation_rate: number;
  stock_value: number;
  /** Per-warehouse stock (all warehouses where item has qty). */
  warehouse_breakdown?: WarehouseBreakdownRow[];
  bom: {
    name: string;
    quantity: number;
    raw_material_cost: number;
    unit_cost: number;
    items: BOMItemRow[];
  } | null;
  unit_cost: number | null;
  /** Most recent selling price (last POS sale for this item). */
  recent_sale_price?: number | null;
}

export async function getSellableItemsForItemsTab(posProfile: string): Promise<SellableItemRow[]> {
  const res = await call.get<SellableItemRow[] | { message: SellableItemRow[] }>(
    'ury.ury_pos.api.get_sellable_items_for_items_tab',
    { pos_profile: posProfile }
  );
  if (Array.isArray(res)) return res;
  return (res as { message: SellableItemRow[] }).message ?? [];
}

export async function getItemInventoryDetail(
  itemCode: string,
  posProfile: string
): Promise<ItemInventoryDetail | null> {
  const res = await call.get<ItemInventoryDetail | { message: ItemInventoryDetail } | null>(
    'ury.ury_pos.api.get_item_inventory_detail',
    { item_code: itemCode, pos_profile: posProfile }
  );
  if (res == null) return null;
  if (typeof (res as { message?: ItemInventoryDetail }).message !== 'undefined')
    return (res as { message: ItemInventoryDetail }).message;
  return res as ItemInventoryDetail;
}
