"""Patch: add Wastage Expense Account on POS Profile and Employee Consumption to wastage reasons."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields({
        "POS Profile": [
            {
                "fieldname": "custom_wastage_expense_account",
                "fieldtype": "Link",
                "label": "Wastage / Material Issue Expense Account",
                "options": "Account",
                "insert_after": "warehouse",
                "description": "Account debited when recording wastage (Material Issue). Create an account under Expenses e.g. 'Stock Wastage' or 'Material Issue Expense'. If not set, company default expense account is used.",
            },
        ],
    })
    # Update Stock Entry custom_issue_reason options to include Employee Consumption
    cf = frappe.db.get_value(
        "Custom Field",
        {"dt": "Stock Entry", "fieldname": "custom_issue_reason"},
        ["name", "options"],
        as_dict=True,
    )
    if cf and (cf.options or "").strip() and "Employee Consumption" not in (cf.options or ""):
        new_options = (cf.options or "").strip()
        new_options = new_options + "\nEmployee Consumption"
        frappe.db.set_value("Custom Field", cf.name, "options", new_options)
        frappe.db.commit()
