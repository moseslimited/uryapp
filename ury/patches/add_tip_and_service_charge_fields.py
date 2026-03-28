"""Patch: add Tip and Service Charge fields for restaurant POS."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields({
        "POS Invoice": [
            {
                "fieldname": "custom_tip_amount",
                "fieldtype": "Currency",
                "label": "Tip Amount",
                "insert_after": "total_spend_time",
                "description": "Optional tip (for reporting)",
            },
            {
                "fieldname": "custom_service_charge_amount",
                "fieldtype": "Currency",
                "label": "Service Charge Amount",
                "insert_after": "custom_tip_amount",
                "description": "Service charge added at payment",
            },
        ],
        "POS Profile": [
            {
                "fieldname": "custom_service_charge_percentage",
                "fieldtype": "Percent",
                "label": "Service Charge %",
                "insert_after": "qz_host",
                "description": "Optional service charge applied at payment (e.g. 10)",
            },
        ],
    })
