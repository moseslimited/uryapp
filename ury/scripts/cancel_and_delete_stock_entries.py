"""
One-off script: Cancel all submitted Stock Entries, then delete all Stock Entries.
Run: bench --site amadeus_restaurant_pos execute ury.ury.scripts.cancel_and_delete_stock_entries.run
"""
from __future__ import unicode_literals

import frappe


def run():
	names = frappe.get_all(
		"Stock Entry",
		filters={},
		pluck="name",
		order_by="creation asc",
	)
	if not names:
		print("No Stock Entries found.")
		return

	print("Found {} Stock Entry/ies: {}".format(len(names), names))

	# 1) Cancel submitted (docstatus == 1)
	for name in names:
		doc = frappe.get_doc("Stock Entry", name)
		if doc.docstatus == 1:
			try:
				doc.cancel()
				print("Cancelled: {}".format(name))
			except Exception as e:
				print("Failed to cancel {}: {}".format(name, e))

	# 2) Delete all (draft and cancelled). Reload list after cancels.
	names = frappe.get_all("Stock Entry", filters={}, pluck="name")
	for name in names:
		try:
			frappe.delete_doc("Stock Entry", name, force=True)
			print("Deleted: {}".format(name))
		except Exception as e:
			print("Failed to delete {}: {}".format(name, e))

	frappe.db.commit()
	print("Done.")
