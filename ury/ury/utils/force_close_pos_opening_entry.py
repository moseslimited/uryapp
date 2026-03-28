"""
Force close an open POS Opening Entry (set status to Closed without a POS Closing Entry).

Use when you cannot complete the normal Close POS flow (e.g. stock/valuation errors)
and need to free the session so you can open a new one.

Run:
  bench --site amadeus_restaurant_pos execute ury.ury.utils.force_close_pos_opening_entry.run --kwargs "{'name':'POS-OPE-2026-00005'}"
Or to force close the current open entry for a POS Profile:
  bench --site amadeus_restaurant_pos execute ury.ury.utils.force_close_pos_opening_entry.run --kwargs "{'pos_profile':'Amadeus Restaurant'}"
"""

from __future__ import annotations

import frappe


def run(name: str | None = None, pos_profile: str | None = None):
	if name:
		opening_name = name
	elif pos_profile:
		opening_name = frappe.db.get_value(
			"POS Opening Entry",
			{"pos_profile": pos_profile, "status": "Open"},
			"name",
		)
		if not opening_name:
			return {"ok": False, "message": f"No open POS Opening Entry found for POS Profile '{pos_profile}'."}
	else:
		return {"ok": False, "message": "Provide name or pos_profile."}

	if not frappe.db.exists("POS Opening Entry", opening_name):
		return {"ok": False, "message": f"POS Opening Entry '{opening_name}' not found."}

	doc = frappe.get_doc("POS Opening Entry", opening_name)
	if doc.status != "Open":
		return {"ok": True, "message": f"Entry {opening_name} is already {doc.status}.", "name": opening_name}

	# Mark as force-closed: set pos_closing_entry so status becomes "Closed" per status_updater
	frappe.db.set_value(
		"POS Opening Entry",
		opening_name,
		{"pos_closing_entry": "Force Closed", "status": "Closed"},
		update_modified=True,
	)
	frappe.db.commit()

	return {"ok": True, "message": f"POS Opening Entry {opening_name} force-closed.", "name": opening_name}
