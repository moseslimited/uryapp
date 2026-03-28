"""Patch: update Customer Is Restaurant Guest field – label and make editable (for existing sites)."""

import frappe


def execute():
    name = "Customer-custom_is_restaurant_customer"
    if not frappe.db.exists("Custom Field", name):
        return
    frappe.db.set_value(
        "Custom Field",
        name,
        {
            "label": "Is Restaurant Guest",
            "read_only": 0,
            "description": "Show in restaurant POS guest list. Can be set when adding a guest (e.g. first-time or conference sign-in) or is set automatically on first submitted POS Invoice.",
        },
    )
