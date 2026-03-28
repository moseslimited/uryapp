# Copyright (c) 2025, URY and contributors
# Zero COGS for BOM/manufactured items so P&L reflects:
# - Raw material costs in purchases
# - Only buy-and-sell items (e.g. soda) driving COGS

from __future__ import unicode_literals

import frappe
from frappe.utils import flt


def _item_has_bom(item_code):
	if not item_code:
		return False
	return frappe.db.exists("BOM", {"item": item_code, "docstatus": 1})


def _apply_zero_cogs_for_bom_sles(controller, sle_map):
	"""Mutate sle_map so outbound BOM items have stock_value_difference = 0."""
	if controller.doctype not in ("Sales Invoice", "Delivery Note", "POS Invoice"):
		return
	for detail_no, sle_list in sle_map.items():
		for sle in sle_list:
			item_code = sle.get("item_code")
			if not item_code:
				continue
			# Only zero outbound (sales) value so COGS is not posted for manufactured items
			if _item_has_bom(item_code) and flt(sle.get("stock_value_difference")) < 0:
				sle["stock_value_difference"] = 0


def apply_patch():
	from erpnext.controllers.stock_controller import StockController

	original_get_stock_ledger_details = StockController.get_stock_ledger_details

	def patched_get_stock_ledger_details(self):
		sle_map = original_get_stock_ledger_details(self)
		_apply_zero_cogs_for_bom_sles(self, sle_map)
		return sle_map

	StockController.get_stock_ledger_details = patched_get_stock_ledger_details
