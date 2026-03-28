import { call } from './frappe-sdk';

export interface WaiterOption {
  name: string;
  full_name: string;
}

export async function getWaiters(): Promise<WaiterOption[]> {
  const res = await call.get<{ message?: WaiterOption[] } | WaiterOption[]>(
    'ury.ury_pos.api.get_waiters'
  );
  const data = (res as { message?: WaiterOption[] }).message ?? res;
  return Array.isArray(data) ? data : [];
}
