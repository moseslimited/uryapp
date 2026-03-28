"""Sync URY Menu Item DocType so `modifier_groups_json` exists in the database (child table)."""

import frappe


def execute():
	frappe.reload_doctype("URY Menu Item", force=True)
