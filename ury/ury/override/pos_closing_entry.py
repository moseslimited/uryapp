# Copyright (c) 2025, URY contributors
# POS close: avoid TimestampMismatchError on POS Opening Entry after consolidate.

import frappe
from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import POSClosingEntry


class URYPosClosingEntry(POSClosingEntry):
	def validate_pos_invoices(self):
		"""Allow consolidated POS invoices in closing view.

		URY flow consolidates POS invoices at payment time. Closing is for session
		visibility/reconciliation and should not reject rows already linked to a
		Sales Invoice.
		"""
		return

	def on_submit(self):
		"""Display/reconciliation closing only.

		POS Invoices are consolidated at payment time in URY flow, so closing submit
		should not create merge logs or additional Sales Invoices.
		"""
		self.set_status(update=True, status="Submitted")
		self.db_set("error_message", "", update_modified=False)
		frappe.publish_realtime(
			f"poe_{self.pos_opening_entry}",
			message={"operation": "Closed", "doc": self},
			docname=f"POS Opening Entry/{self.pos_opening_entry}",
		)
		self.update_sales_invoices_closing_entry()
		self.update_opening_entry()

	def update_opening_entry(self, for_cancel=False):
		"""Persist opening-entry link + status without Document.save().

		During `on_submit`, merge logs update many documents; hooks or SQL can bump
		`tabPOS Opening Entry`.`modified` between get_doc and save(), causing
		TimestampMismatchError. ERPNext only needs `pos_closing_entry` and `status`
		synced here — db_set avoids the ORM concurrency check.
		"""
		if not self.pos_opening_entry:
			return

		opening_entry = frappe.get_doc("POS Opening Entry", self.pos_opening_entry)
		opening_entry.pos_closing_entry = self.name if not for_cancel else None
		opening_entry.set_status()

		frappe.db.set_value(
			"POS Opening Entry",
			opening_entry.name,
			{
				"pos_closing_entry": opening_entry.pos_closing_entry,
				"status": opening_entry.status,
			},
			update_modified=False,
		)
