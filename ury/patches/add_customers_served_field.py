"""Patch: add Customers Served field to POS Invoice for existing sites."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields({
        "POS Invoice": [
            {
                "fieldname": "customers_served",
                "fieldtype": "Check",
                "label": "Customers Served",
                "insert_after": "invoice_printed",
                "read_only": 0,
                "description": "Mark when food has been served to customers at this table",
            },
        ],
    })
