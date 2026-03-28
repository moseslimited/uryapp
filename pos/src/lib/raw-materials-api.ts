import { call } from './frappe-sdk';

export interface RawMaterialRemainingRow {
  item_code: string;
  item_name: string;
  actual_qty: number;
  stock_uom: string;
}

export async function getRawMaterialsRemaining(
  posProfile: string | null
): Promise<RawMaterialRemainingRow[]> {
  const res = await call.get<RawMaterialRemainingRow[] | { message: RawMaterialRemainingRow[] }>(
    'ury.ury_pos.api.get_raw_materials_remaining',
    { pos_profile: posProfile ?? undefined }
  );
  if (Array.isArray(res)) return res;
  return (res as { message: RawMaterialRemainingRow[] }).message ?? [];
}
