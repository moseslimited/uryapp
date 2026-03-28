import { call } from './frappe-sdk';

const get = (method: string, params: Record<string, unknown> = {}) =>
  call.get<{ message?: unknown }>(method, params).then((r) => (r.message !== undefined ? r.message : r));

export interface WastageReasonOption {
  value: string;
  label: string;
}

export async function getWastageReasons(): Promise<WastageReasonOption[]> {
  const list = await get('ury.ury_pos.api.get_wastage_reasons');
  return Array.isArray(list) ? (list as WastageReasonOption[]) : [];
}

export async function createWastageEntry(
  posProfile: string,
  itemCode: string,
  qty: number,
  reason: string
): Promise<{ name: string; message: string }> {
  const res = await call.post<{ message?: { name: string; message: string } } | { name: string; message: string }>(
    'ury.ury_pos.api.create_wastage_entry',
    {
    pos_profile: posProfile,
    item_code: itemCode,
    qty,
    reason: reason || 'Other',
    }
  );
  return (res as { message?: { name: string; message: string } }).message ?? (res as { name: string; message: string });
}
