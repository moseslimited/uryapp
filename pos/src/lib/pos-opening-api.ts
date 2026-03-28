import { call } from './frappe-sdk';

export interface POSOpeningResponse {
  message: number;
}

export interface POSCloseValidationResponse {
  message: string;
}

export const checkPOSOpening = async (): Promise<POSOpeningResponse> => {
  try {
    const response = await call.get<POSOpeningResponse>(
      'ury.ury_pos.api.posOpening'
    );
    
    return response;
  } catch (error) {
    console.error('Error checking POS opening status:', error);
    throw error;
  }
};

export const validatePOSClose = async (posProfile: string): Promise<POSCloseValidationResponse> => {
  try {
    const response = await call.get<POSCloseValidationResponse>(
      'ury.ury_pos.api.validate_pos_close',
      {
        pos_profile: posProfile
      }
    );
    
    return response;
  } catch (error) {
    console.error('Error validating POS close status:', error);
    throw error;
  }
};

export interface PreparePOSClosingEntryResult {
  name: string;
  /** Draft POS Invoices still open for this profile (not in closing totals; payable later per customer). */
  draftPosInvoicesRemaining: number;
}

export const preparePOSClosingEntry = async (): Promise<PreparePOSClosingEntryResult> => {
  try {
    const response = await call.get<{
      message: { name: string; draft_pos_invoices_remaining?: number };
    }>('ury.ury_pos.api.prepare_pos_closing_entry');
    const m = response.message;
    return {
      name: m.name,
      draftPosInvoicesRemaining: Number(m.draft_pos_invoices_remaining ?? 0),
    };
  } catch (error) {
    console.error('Error preparing POS closing entry:', error);
    throw error;
  }
};

export const preparePOSOpeningEntry = async (): Promise<string> => {
  try {
    // Use backend API to create draft POS Opening Entry with proper fields
    const response = await call.get<{ message: { name: string } }>(
      'ury.ury_pos.api.prepare_pos_opening_entry'
    );
    return response.message.name;
  } catch (error) {
    console.error('Error preparing POS opening entry:', error);
    throw error;
  }
};

export const prepareSubPOSClosing = async (): Promise<string> => {
  try {
    const response = await call.get<{ message: { name: string } }>(
      'ury.ury_pos.api.prepare_sub_pos_closing'
    );
    return response.message.name;
  } catch (error) {
    console.error('Error preparing Sub POS Closing:', error);
    throw error;
  }
};