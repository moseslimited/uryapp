"""
Dev helper: seed stock into a target warehouse for all sellable menu items.

Creates a Stock Entry (Material Receipt) with a non-zero basic rate so valuation is valid.

Run:
bench --site amadeus_restaurant_pos execute ury.ury.utils.dev_seed_stock_for_menu.run --kwargs "{'warehouse':'Finished Goods - ML','qty':50,'basic_rate':1}"
"""

from __future__ import annotations

import frappe


def run(warehouse: str = "Finished Goods - ML", qty: float = 50, basic_rate: float = 1):
	if not frappe.db.exists("Warehouse", warehouse):
		raise frappe.ValidationError(f"Warehouse '{warehouse}' not found.")

	# collect all menu items across menus
	item_codes = frappe.get_all(
		"URY Menu Item",
		filters={"disabled": 0},
		pluck="item",
	)
	item_codes = sorted({c for c in item_codes if c})
	if not item_codes:
		return {"ok": False, "message": "No enabled URY Menu Items found."}

	# keep only stock items
	stock_item_codes = []
	for code in item_codes:
		try:
			if frappe.db.get_value("Item", code, "is_stock_item"):
				stock_item_codes.append(code)
		except Exception:
			# item might have been deleted; skip
			pass

	if not stock_item_codes:
		return {"ok": False, "message": "No stock items found in URY Menu Items."}

	company = None
	pos_profiles = frappe.get_all("POS Profile", fields=["company"], limit=1)
	if pos_profiles:
		company = pos_profiles[0].company

	se = frappe.new_doc("Stock Entry")
	se.stock_entry_type = "Material Receipt"
	if company:
		se.company = company

	for code in stock_item_codes:
		se.append(
			"items",
			{
				"item_code": code,
				"qty": qty,
				"t_warehouse": warehouse,
				"basic_rate": basic_rate,
				"set_basic_rate_manually": 1,
			},
		)

	se.flags.ignore_permissions = True
	se.insert(ignore_mandatory=True)
	se.submit()

	return {"ok": True, "stock_entry": se.name, "warehouse": warehouse, "items": len(stock_item_codes)}

