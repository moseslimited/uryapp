# Copyright (c) 2025, URY contributors
# Skip ERPNext "Outdated POS Opening Entry" (period_start_date must be today) for restaurant POS.

from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice

from ury.ury.override.pos_opening_validation import validate_opening_entry_no_outdated_check


class URYPosInvoice(POSInvoice):
	"""
	Allow saving/submitting POS Invoices when an open POS Opening Entry exists,
	even if its period_start_date is not today (ERPNext otherwise throws
	"Outdated POS Opening Entry" and blocks Pay / sync / etc.).
	"""

	def validate_pos_opening_entry(self):
		validate_opening_entry_no_outdated_check(self.pos_profile)
