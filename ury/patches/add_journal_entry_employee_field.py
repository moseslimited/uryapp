"""Patch: add Employee (Paid) field to Journal Entry for tracking salary payments from POS."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields({
		"Journal Entry": [
			{
				"fieldname": "ury_employee",
				"fieldtype": "Link",
				"options": "Employee",
				"label": "Employee (Paid)",
				"insert_after": "user_remark",
				"description": "Employee paid when recording salary expense from POS. Used for salary payment reports.",
			},
		],
	})
