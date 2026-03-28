"""Add URY line kind on POS Invoice Item for Included / Giveaway zero-rate stock lines."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields({
		"POS Invoice Item": [
			{
				"fieldname": "custom_ury_line_kind",
				"fieldtype": "Select",
				"label": "URY Line Kind",
				"options": "Normal\nIncluded\nGiveaway",
				"default": "Normal",
				"insert_after": "description",
			},
		],
	})
