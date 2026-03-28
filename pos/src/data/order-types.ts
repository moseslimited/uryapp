import { Globe, Phone, ShoppingBag, Truck, Utensils } from "lucide-react";

export type OrderType = "Dine In" | "Take Away" | "Delivery" | "Phone In" | "Aggregators";

export type OrderTypes= {
    label: string;
    value: OrderType;
    icon: React.ElementType;
}

export const ORDER_TYPES: OrderTypes[] = [
    {
        label: "Dine In",
        value: "Dine In",
        icon: Utensils
    },
    {
        label: "Take Away",
        value: "Take Away",
        icon: ShoppingBag
    },
    {
        label: "Delivery",
        value: "Delivery",
        icon: Truck
    },
    {
        label: "Phone In",
        value: "Phone In",
        icon: Phone
    },
    {
        label: "Aggregators",
        value: "Aggregators",
        icon: Globe
    }
]

export const DINE_IN="Dine In"
export const DEFAULT_ORDER_TYPE="Take Away"

export type OrderStatusType = "Draft" | "Recently Paid" | "Paid" | "Pay Later" | "Consolidated" | "Return";

// Base status types that are always available
// "Unpaid" = Draft invoices (not yet paid).
export const BASE_ORDER_STATUS_TYPES = [
    {
        label: "Unpaid",
        value: "Draft"
    },
    {
        label: "Paid",
        value: "Paid"
    },
    {
        label: "Pay Later",
        value: "Pay Later"
    },
    {
        label: "Consolidated",
        value: "Consolidated"
    }
];

// Recently Paid status that appears when paid_limit > 0
export const RECENTLY_PAID_STATUS_TYPE = [
    {
        label: "Recently Paid",
        value: "Recently Paid"
    }
];

// Extended status types that are only available when view_all_status is enabled (Paid is now in base)
export const EXTENDED_ORDER_STATUS_TYPES = [
    {
        label: "Return",
        value: "Return"
    }
];

// Function to get order status types based on POS profile settings
export const getOrderStatusTypes = (viewAllStatus?: number, paidLimit?: number) => {
    let statusTypes = [...BASE_ORDER_STATUS_TYPES];
    
    // Add Recently Paid if paid_limit > 0
    if (paidLimit && paidLimit > 0) {
        statusTypes.push(...RECENTLY_PAID_STATUS_TYPE);
    }
    
    // Add extended statuses if view_all_status is enabled (Consolidated, Return)
    if (viewAllStatus === 1) {
        statusTypes.push(...EXTENDED_ORDER_STATUS_TYPES);
    }
    
    return statusTypes;
};

// Legacy export for backward compatibility
export const ORDER_STATUS_TYPES = BASE_ORDER_STATUS_TYPES;