"""Patch: add Issue / Wastage Reason field to Stock Entry for Material Issue (wastage reporting)."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields({
        "Stock Entry": [
            {
                "fieldname": "custom_issue_reason",
                "fieldtype": "Select",
                "label": "Issue / Wastage Reason",
                "insert_after": "purpose",
                "options": "\nSpoilage\nBreakage\nTheft\nExpired\nDamaged\nSample\nDonation\nOther",
                "description": "For Material Issue: reason for issue/wastage (used in wastage reports)",
                "depends_on": "eval:doc.purpose==\"Material Issue\"",
            },
        ],
    })
