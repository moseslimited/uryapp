"""Patch: add Is Restaurant Guest field to Customer for POS guest list and segmentation."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields({
        "Customer": [
            {
                "fieldname": "custom_is_restaurant_customer",
                "fieldtype": "Check",
                "label": "Is Restaurant Guest",
                "insert_after": "customer_type",
                "read_only": 0,
                "description": "Show in restaurant POS guest list. Can be set when adding a guest (e.g. first-time or conference sign-in) or is set automatically on first submitted POS Invoice.",
            },
        ],
    })
