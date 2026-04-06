import { parseFrappeErrorMessage, type FrappeErrorPayload } from './parse-frappe-error';

export interface StaffMember {
  code: string;
  user: string;
  full_name: string;
  branch: string;
  room?: string | null;
}

interface StaffResponse {
  message: StaffMember;
}

export const validateStaffCode = async (staffCode: string): Promise<StaffMember> => {
  const trimmed = staffCode.trim();
  if (!trimmed) {
    throw new Error('Please enter a staff code.');
  }

  // If we're in a browser, use fetch to avoid axios Expect header issues
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    const url = new URL('/api/method/ury.ury_pos.api.validate_staff_code', window.location.origin);
    url.searchParams.set('staff_code', trimmed);

    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });

    let payload: StaffResponse | { message?: string; exc?: string } = { message: undefined };
    try {
      payload = (await response.json()) as StaffResponse;
    } catch (error) {
      console.error('Failed to parse staff validation response', error);
    }

    if (!response.ok) {
      const errMessage = parseFrappeErrorMessage(
        payload as FrappeErrorPayload,
        `Failed to validate staff code (HTTP ${response.status}).`
      );
      throw new Error(errMessage);
    }

    if (!payload.message) {
      throw new Error('Invalid staff code response from server.');
    }

    return payload.message;
  }

  // Fallback to frappe-js-sdk (SSR / tests)
  const { call } = await import('./frappe-sdk');
  const response = await call.get<StaffResponse>('ury.ury_pos.api.validate_staff_code', {
    staff_code: trimmed,
  });
  return response.message;
};

