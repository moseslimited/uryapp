"""
One-off script: Delete ALL Stock Ledger Entries and Bin records so stock balance reports show zero.
Use only for dev/clean slate. Reverses no other transactions (Sales Invoice, etc.).
Run: bench --site amadeus_restaurant_pos execute ury.ury.scripts.clear_all_stock_ledger_and_bins.run
"""
from __future__ import unicode_literals

import frappe


def run():
	frappe.connect()

	# 1) Delete all Stock Ledger Entry rows (source of stock balance in reports)
	sle_count = frappe.db.count("Stock Ledger Entry")
	frappe.db.sql("DELETE FROM `tabStock Ledger Entry`")
	print("Deleted {} Stock Ledger Entry row(s).".format(sle_count))

	# 2) Delete all Bin rows (cached item-warehouse balance); they will be recreated as 0 when needed
	bin_count = frappe.db.count("Bin")
	frappe.db.sql("DELETE FROM `tabBin`")
	print("Deleted {} Bin row(s).".format(bin_count))

	frappe.db.commit()
	print("Done. Stock Balance and Stock Ledger reports should now show no/zero stock.")


if __name__ == "__main__":
	run()
