import { call } from './frappe-sdk';

/** Menu-driven included choices (sides, sauces, tea/coffee) — stored on URY Menu Item as JSON. */
export interface ModifierGroup {
  group_id: string;
  label: string;
  min?: number;
  max?: number;
  items: string[];
}

export interface MenuItem {
  item: string;
  item_name: string;
  item_image: string | null;
  rate: number | string;
  course: string;
  /** Stock quantity in POS warehouse (undefined if not a stock item or no warehouse) */
  actual_qty?: number | null;
  /** True when item has an active BOM (make-to-order in POS). */
  has_bom?: boolean;
  trending?: boolean;
  popular?: boolean;
  recommended?: boolean;
  description?: string;
  special_dish?: 1 | 0;
  /** Parsed from modifier_groups_json on the menu row */
  modifier_groups?: ModifierGroup[];
}

export interface GetMenuResponse {
  message: {
    items: MenuItem[];
  };
}

export interface GetAggregatorMenuResponse {
  message: MenuItem[];
}

export const getRestaurantMenu = async (posProfile: string, room: string | null, order_type: string | null) => {
  try {
    const response = await call.get<GetMenuResponse>(
      'ury.ury_pos.api.getRestaurantMenu',
      {
        pos_profile: posProfile,
        room: room,
        order_type: order_type
      }
    );
    return response.message.items;
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
};

export const getAggregatorMenu = async (aggregator: string) => {
  try {
    const response = await call.get<GetAggregatorMenuResponse>(
      'ury.ury_pos.api.getAggregatorItem',
      {
        aggregator
      }
    );
    return response.message;
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
}; 