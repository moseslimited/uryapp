# Copyright (c) 2025, URY contributors
# Same POS opening rules as URYPosInvoice for sites using Sales Invoice in POS.

from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice

from ury.ury.override.pos_opening_validation import validate_opening_entry_no_outdated_check


class URYSalesInvoice(SalesInvoice):
	def validate_pos_opening_entry(self):
		validate_opening_entry_no_outdated_check(self.pos_profile)
