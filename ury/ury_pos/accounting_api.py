# -*- coding: utf-8 -*-
"""
POS Accountant APIs: Purchases, Expenses, Accounts overview, P&L, Profitability.
"""
from __future__ import unicode_literals

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate, get_first_day, add_months, add_days, cint, cstr
from erpnext.accounts.utils import get_balance_on, get_fiscal_year
from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry


def _get_company():
	"""Company from POS Profile (branch), Global Defaults, or first Company."""
	try:
		from ury.ury_pos.api import getPosProfile
		prof = getPosProfile()
		if isinstance(prof, dict) and prof.get("company"):
			return prof["company"]
	except Exception:
		pass
	default_company = frappe.defaults.get_default("company")
	if default_company:
		return default_company
	companies = frappe.get_all("Company", limit=1, pluck="name")
	return companies[0] if companies else None


def _period_dates(period):
	"""Return (from_date, to_date) for period: today, this_week, this_month, this_quarter, this_year, all."""
	today = getdate(nowdate())
	if period == "today":
		return (today, today)
	if period == "this_week":
		# Monday to today
		week_start = add_days(today, -today.weekday() if today.weekday() < 7 else -6)
		return (week_start, today)
	if period == "this_month":
		month_start = get_first_day(today)
		return (month_start, today)
	if period == "this_quarter":
		q = (today.month - 1) // 3 + 1
		q_start = getdate("{}-{:02d}-01".format(today.year, (q - 1) * 3 + 1))
		return (q_start, today)
	if period == "this_year":
		return (getdate("{}-01-01".format(today.year)), today)
	# all: from start of current fiscal year or 1 year back
	fy = frappe.get_cached_value("Fiscal Year", frappe.defaults.get_user_default("fiscal_year"), ["year_start_date", "year_end_date"], as_dict=True)
	if fy and fy.year_start_date:
		return (getdate(fy.year_start_date), getdate(fy.year_end_date) if getdate(fy.year_end_date) <= today else today)
	return (add_months(today, -12), today)


# --------------- Purchases (Purchase Invoice + Pay) ---------------

def _as_bool(value):
	"""Coerce request value to bool; Frappe may pass 'false' as string."""
	if value is None:
		return False
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return bool(value)
	return str(value).strip().lower() in ("1", "true", "yes")


@frappe.whitelist()
def get_purchase_invoices(from_date=None, to_date=None, supplier=None, limit=20, limit_start=0, only_unpaid=False):
	"""List Purchase Invoices for the accountant. Paginated; optionally filter by unpaid (default: all)."""
	limit = cint(limit) or 20
	limit_start = cint(limit_start) or 0
	only_unpaid = _as_bool(only_unpaid)
	filters = {"docstatus": 1}
	if from_date:
		filters["posting_date"] = [">=", getdate(from_date)]
	if to_date:
		filters["posting_date"] = ["<=", getdate(to_date)]
	if supplier:
		filters["supplier"] = supplier
	if only_unpaid:
		filters["outstanding_amount"] = [">", 0]
	invoices = frappe.get_all(
		"Purchase Invoice",
		filters=filters,
		fields=["name", "supplier", "supplier_name", "posting_date", "grand_total", "outstanding_amount", "status", "currency"],
		order_by="posting_date desc",
		limit_start=limit_start,
		limit_page_length=limit,
	)
	if not invoices:
		return invoices
	# Mark which invoices already have a Purchase Receipt (created from this PI)
	pi_names = [inv["name"] for inv in invoices]
	linked = frappe.get_all(
		"Purchase Receipt Item",
		filters={"purchase_invoice": ["in", pi_names]},
		fields=["parent", "purchase_invoice"],
	)
	pi_to_pr = {r["purchase_invoice"]: r["parent"] for r in linked}
	for inv in invoices:
		inv["purchase_receipt"] = pi_to_pr.get(inv["name"])
	return invoices


@frappe.whitelist()
def get_purchase_receipts(from_date=None, to_date=None, supplier=None, limit=20, limit_start=0):
	"""List Purchase Receipts (stock) for reference. Paginated."""
	limit = cint(limit) or 20
	limit_start = cint(limit_start) or 0
	filters = {"docstatus": 1}
	if from_date:
		filters["posting_date"] = [">=", getdate(from_date)]
	if to_date:
		filters["posting_date"] = ["<=", getdate(to_date)]
	if supplier:
		filters["supplier"] = supplier
	receipts = frappe.get_all(
		"Purchase Receipt",
		filters=filters,
		fields=["name", "supplier", "supplier_name", "posting_date", "grand_total", "status", "currency"],
		order_by="posting_date desc",
		limit_start=limit_start,
		limit_page_length=limit,
	)
	return receipts


@frappe.whitelist()
def create_payment_for_purchase_invoice(
	purchase_invoice_name,
	paid_amount=None,
	mode_of_payment=None,
	reference_no=None,
	reference_date=None,
	bank_account=None,
):
	"""Create and submit a Payment Entry against a Purchase Invoice. For use from POS."""
	if not purchase_invoice_name or not frappe.db.exists("Purchase Invoice", purchase_invoice_name):
		frappe.throw(_("Purchase Invoice not found"))
	doc = frappe.get_doc("Purchase Invoice", purchase_invoice_name)
	if doc.docstatus != 1:
		frappe.throw(_("Purchase Invoice must be submitted"))
	outstanding = flt(doc.outstanding_amount)
	if outstanding <= 0:
		frappe.throw(_("No outstanding amount to pay"))
	paid = flt(paid_amount) if paid_amount is not None else outstanding
	if paid <= 0 or paid > outstanding:
		frappe.throw(_("Paid amount must be between 0 and {0}").format(outstanding))

	if not cstr(reference_no).strip():
		frappe.throw(
			_("Payment reference is mandatory. Enter a cheque number, bank transfer ref, or receipt number."),
			title=_("Missing reference"),
		)

	frappe.flags.ignore_account_permission = True
	try:
		try:
			pe = get_payment_entry(
				"Purchase Invoice",
				purchase_invoice_name,
				party_amount=paid,
				bank_account=bank_account or None,
			)
		except AttributeError as e:
			# get_payment_entry uses bank.account_currency; bank is None if no default cash/bank for company/MOP
			if bank_account is None and ("NoneType" in str(e) or "'NoneType'" in str(e)):
				frappe.throw(
					_(
						"Could not create payment: no default Bank or Cash account for company {0}. "
						"Set a default company bank account, or add accounts to Mode of Payment {1}."
					).format(frappe.bold(doc.company), frappe.bold(mode_of_payment or doc.get("mode_of_payment") or "")),
					title=_("Payment setup required"),
				)
			raise
		if mode_of_payment:
			pe.mode_of_payment = mode_of_payment
		pe.reference_no = cstr(reference_no).strip()
		pe.reference_date = getdate(reference_date) if reference_date else getdate(nowdate())
		pe.received_amount = paid
		pe.paid_amount = paid
		# Ensure allocation matches paid amount
		for ref in pe.references:
			if ref.reference_doctype == "Purchase Invoice" and ref.reference_name == purchase_invoice_name:
				ref.allocated_amount = paid
				break
		pe.set_amounts()
		pe.insert()
		pe.submit()
		return {"payment_entry": pe.name, "message": _("Payment {0} submitted.").format(pe.name)}
	finally:
		frappe.flags.ignore_account_permission = False


@frappe.whitelist()
def create_purchase_receipt_from_invoice(purchase_invoice_name):
	"""Create and submit a Purchase Receipt from a Purchase Invoice (same supplier and items). For stock receipt."""
	if not purchase_invoice_name or not frappe.db.exists("Purchase Invoice", purchase_invoice_name):
		frappe.throw(_("Purchase Invoice not found"))
	pi = frappe.get_doc("Purchase Invoice", purchase_invoice_name)
	if pi.docstatus != 1:
		frappe.throw(_("Purchase Invoice must be submitted"))
	# If PI already updated stock, we don't create a duplicate PR for same items
	if pi.get("update_stock") and pi.get("items"):
		frappe.throw(_("This Purchase Invoice already updated stock. No separate Purchase Receipt needed."))

	pr = frappe.new_doc("Purchase Receipt")
	pr.supplier = pi.supplier
	pr.supplier_name = pi.supplier_name
	pr.company = pi.company
	pr.posting_date = pi.posting_date
	pr.currency = pi.currency
	pr.conversion_rate = pi.conversion_rate
	pr.cost_center = pi.get("cost_center")
	pr.buying_price_list = pi.get("buying_price_list")
	# Default warehouse from first item or first company warehouse
	warehouse = None
	if pi.get("items"):
		warehouse = pi.items[0].get("warehouse")
	if not warehouse:
		wh = frappe.get_all("Warehouse", filters={"company": pi.company}, limit=1)
		warehouse = wh[0].name if wh else None
	if not warehouse:
		frappe.throw(_("No warehouse found for company {0}. Create a warehouse first.").format(pi.company))
	if warehouse:
		pr.set_warehouse = warehouse

	for row in pi.items:
		if not row.item_code or flt(row.qty) <= 0:
			continue
		pr.append("items", {
			"item_code": row.item_code,
			"qty": row.qty,
			"received_qty": row.qty,
			"rate": row.rate,
			"warehouse": row.get("warehouse") or warehouse,
			"cost_center": row.get("cost_center") or pi.get("cost_center"),
			"purchase_invoice": pi.name,
			"purchase_invoice_item": row.name,
		})
	if not pr.get("items"):
		frappe.throw(_("No valid items to receive"))

	pr.flags.ignore_permissions = True
	pr.insert()
	pr.submit()
	# PR items linked to PI (purchase_invoice, purchase_invoice_item) so update_billing_status sets status to Completed
	return {"purchase_receipt": pr.name, "message": _("Purchase Receipt {0} created and submitted.").format(pr.name)}


# --------------- Expenses (Journal Entry) ---------------

@frappe.whitelist()
def get_expense_accounts(company=None):
	"""List leaf Expense accounts for recording expenses."""
	company = company or _get_company()
	if not company:
		return []
	accounts = frappe.get_all(
		"Account",
		filters={"company": company, "root_type": "Expense", "is_group": 0, "disabled": 0},
		fields=["name", "account_name", "account_type"],
		order_by="name",
	)
	return accounts


@frappe.whitelist()
def get_cash_bank_accounts(company=None):
	"""List Cash and Bank accounts for expense payment."""
	company = company or _get_company()
	if not company:
		return []
	accounts = frappe.get_all(
		"Account",
		filters={"company": company, "account_type": ["in", ["Cash", "Bank"]], "is_group": 0, "disabled": 0},
		fields=["name", "account_name", "account_type"],
		order_by="account_type desc, name",
	)
	return accounts


@frappe.whitelist()
def get_employees(company=None):
	"""List active employees for salary payment dropdown (company filter if Employee has company)."""
	company = company or _get_company()
	filters = {"status": "Active"}
	if company and frappe.db.has_table("Employee") and frappe.db.has_column("Employee", "company"):
		filters["company"] = company
	if not frappe.db.table_exists("Employee"):
		return []
	employees = frappe.get_all(
		"Employee",
		filters=filters,
		fields=["name", "employee_name"],
		order_by="employee_name",
	)
	return [{"name": e.name, "employee_name": e.employee_name or e.name} for e in employees]


@frappe.whitelist()
def create_expense_entry(
	expense_account,
	amount,
	paid_from_account,
	posting_date=None,
	remark=None,
	cost_center=None,
	company=None,
	employee=None,
):
	"""Create a Journal Entry: debit expense_account, credit paid_from_account (Cash/Bank). Optional employee for salary tracking."""
	company = company or _get_company()
	if not company:
		frappe.throw(_("Company not found"))
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than 0"))
	posting_date = getdate(posting_date or nowdate())
	if not cost_center:
		cost_center = frappe.get_cached_value("Company", company, "cost_center")
	if not cost_center:
		frappe.throw(_("Please set default Cost Center in Company"))

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"
	je.company = company
	je.posting_date = posting_date
	je.user_remark = remark or "Expense from POS"
	if employee and frappe.get_meta("Journal Entry").has_field("ury_employee"):
		je.ury_employee = employee
	je.append(
		"accounts",
		{
			"account": expense_account,
			"debit_in_account_currency": amount,
			"cost_center": cost_center,
		},
	)
	je.append(
		"accounts",
		{
			"account": paid_from_account,
			"credit_in_account_currency": amount,
			"cost_center": cost_center,
		},
	)
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return {"journal_entry": je.name, "message": _("Expense recorded: {0}").format(je.name)}


@frappe.whitelist()
def create_transfer_between_accounts(
	from_account,
	to_account,
	amount,
	posting_date=None,
	remark=None,
	company=None,
):
	"""Move money between two asset accounts (e.g. Bank and Cash). Creates a submitted Journal Entry: debit to_account, credit from_account."""
	company = company or _get_company()
	if not company:
		frappe.throw(_("Company not found"))
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than 0"))
	posting_date = getdate(posting_date or nowdate())
	for acc_name in (from_account, to_account):
		if not frappe.db.exists("Account", acc_name):
			frappe.throw(_("Account {0} not found").format(acc_name))
		acc_type = frappe.get_cached_value("Account", acc_name, "account_type")
		if acc_type not in ("Cash", "Bank"):
			frappe.throw(_("Only Cash and Bank accounts are allowed for transfers. {0} is {1}.").format(acc_name, acc_type or "other"))
		acc_company = frappe.get_cached_value("Account", acc_name, "company")
		if acc_company != company:
			frappe.throw(_("Account {0} does not belong to company {1}").format(acc_name, company))
	cost_center = frappe.get_cached_value("Company", company, "cost_center")
	if not cost_center:
		frappe.throw(_("Please set default Cost Center in Company"))

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"
	je.company = company
	je.posting_date = posting_date
	je.user_remark = remark or _("Transfer between accounts (from POS)")
	# Debit destination (to_account), credit source (from_account)
	je.append(
		"accounts",
		{
			"account": to_account,
			"debit_in_account_currency": amount,
			"cost_center": cost_center,
		},
	)
	je.append(
		"accounts",
		{
			"account": from_account,
			"credit_in_account_currency": amount,
			"cost_center": cost_center,
		},
	)
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return {"journal_entry": je.name, "message": _("Transfer recorded: {0}").format(je.name)}


@frappe.whitelist()
def get_recent_expenses(limit=20, limit_start=0, from_date=None, to_date=None, expense_account=None):
	"""List recent expense Journal Entries (debit to Expense account). Paginated; optional filter by expense account.

	Returns a dict: { items, total_count, total_amount }.
	When expense_account is set, total_count and total_amount are totals for that filter (all pages).
	Otherwise total_count/total_amount are null (use page subtotal on the client).
	"""
	limit = cint(limit) or 20
	limit_start = cint(limit_start) or 0
	company = _get_company()
	if not company:
		return {"items": [], "total_count": None, "total_amount": None}
	filters = {"company": company, "docstatus": 1, "voucher_type": "Journal Entry"}
	if from_date:
		filters["posting_date"] = [" >=", getdate(from_date)]
	if to_date:
		filters["posting_date"] = [" <=", getdate(to_date)]
	total_count = None
	total_amount = None
	if expense_account:
		# Only JEs that have a debit to this expense account (join via JE Account)
		cond = ["je.company = %(company)s", "je.docstatus = 1", "je.voucher_type = 'Journal Entry'"]
		params = {"company": company, "account": expense_account, "limit": limit, "offset": limit_start}
		if from_date:
			cond.append("je.posting_date >= %(from_date)s")
			params["from_date"] = getdate(from_date)
		if to_date:
			cond.append("je.posting_date <= %(to_date)s")
			params["to_date"] = getdate(to_date)
		where_sql = " AND ".join(cond)
		agg = frappe.db.sql(
			"""
			SELECT COUNT(*) AS cnt, COALESCE(SUM(s.total_debit), 0) AS amt
			FROM (
				SELECT DISTINCT je.name, je.total_debit
				FROM `tabJournal Entry` je
				INNER JOIN `tabJournal Entry Account` jea ON jea.parent = je.name
					AND jea.debit_in_account_currency > 0 AND jea.account = %(account)s
				WHERE """
			+ where_sql
			+ """
			) AS s
		""",
			params,
			as_dict=True,
		)
		if agg:
			total_count = cint(agg[0].get("cnt") or 0)
			total_amount = flt(agg[0].get("amt") or 0)
		jes = frappe.db.sql("""
			SELECT DISTINCT je.name, je.posting_date, je.total_debit, je.user_remark, je.creation
			FROM `tabJournal Entry` je
			INNER JOIN `tabJournal Entry Account` jea ON jea.parent = je.name AND jea.debit_in_account_currency > 0 AND jea.account = %(account)s
			WHERE """ + where_sql + """
			ORDER BY je.posting_date DESC, je.creation DESC
			LIMIT %(limit)s OFFSET %(offset)s
		""", params, as_dict=True)
	else:
		jes = frappe.get_all(
			"Journal Entry",
			filters=filters,
			fields=["name", "posting_date", "total_debit", "user_remark", "creation"],
			order_by="posting_date desc, creation desc",
			limit_start=limit_start,
			limit_page_length=limit,
		)
	out = []
	for je in jes:
		accs = frappe.get_all(
			"Journal Entry Account",
			filters={"parent": je.name, "debit_in_account_currency": [">", 0]},
			fields=["account", "debit_in_account_currency"],
		)
		exp_accounts = frappe.get_all(
			"Account",
			filters={"name": ["in", [a.account for a in accs]], "root_type": "Expense"},
			pluck="name",
		)
		if exp_accounts:
			out.append({**je, "expense_accounts": exp_accounts})
	return {"items": out, "total_count": total_count, "total_amount": total_amount}


@frappe.whitelist()
def get_salary_payments_report(from_date=None, to_date=None, company=None):
	"""Report of salary payments by employee for a period (JEs with expense account like Salary and ury_employee set)."""
	company = company or _get_company()
	if not company:
		return {"payments": [], "by_employee": [], "total_amount": 0}
	from_date = getdate(from_date) if from_date else get_first_day(nowdate())
	to_date = getdate(to_date) if to_date else getdate(nowdate())
	if not frappe.db.table_exists("Journal Entry") or not frappe.get_meta("Journal Entry").has_field("ury_employee"):
		return {"payments": [], "by_employee": [], "total_amount": 0}
	filters = {"company": company, "docstatus": 1, "voucher_type": "Journal Entry", "ury_employee": ["!=", ""]}
	filters["posting_date"] = ["between", [from_date, to_date]]
	jes = frappe.get_all(
		"Journal Entry",
		filters=filters,
		fields=["name", "posting_date", "ury_employee", "total_debit", "user_remark"],
		order_by="posting_date desc",
	)
	payments = []
	employee_totals = {}
	for je in jes:
		if not je.get("ury_employee"):
			continue
		# Confirm at least one debit is to a salary-type expense account
		accs = frappe.get_all(
			"Journal Entry Account",
			filters={"parent": je.name, "debit_in_account_currency": [">", 0]},
			fields=["account", "debit_in_account_currency"],
		)
		if not accs:
			continue
		account_names = frappe.get_all(
			"Account",
			filters={"name": ["in", [a.account for a in accs]]},
			fields=["name", "account_name"],
		)
		salary_debit = 0
		for a in accs:
			aname = next((x.account_name or "" for x in account_names if x.name == a.account), "")
			if "salary" in (aname or "").lower():
				salary_debit += flt(a.debit_in_account_currency)
		if salary_debit <= 0:
			continue
		emp_name = frappe.get_cached_value("Employee", je.ury_employee, "employee_name") if je.ury_employee else None
		payments.append({
			"journal_entry": je.name,
			"posting_date": str(je.posting_date),
			"employee": je.ury_employee,
			"employee_name": emp_name or je.ury_employee,
			"amount": salary_debit,
			"user_remark": je.user_remark,
		})
		key = je.ury_employee or ""
		employee_totals[key] = employee_totals.get(key, 0) + salary_debit
	by_employee = []
	seen = set()
	for p in payments:
		eid = p["employee"]
		if eid and eid not in seen:
			seen.add(eid)
			by_employee.append({"employee": eid, "employee_name": p["employee_name"], "total": employee_totals.get(eid, 0)})
	by_employee.sort(key=lambda x: (-x["total"], x["employee_name"] or ""))
	total_amount = sum(employee_totals.values())
	return {"payments": payments, "by_employee": by_employee, "total_amount": total_amount, "from_date": str(from_date), "to_date": str(to_date)}


# --------------- Accounts overview (Cash/Bank, Income, Expense for period) ---------------

@frappe.whitelist()
def get_accounts_overview(period="this_month"):
	"""Return Cash/Bank balances and Income/Expense totals for the given period. For Accounts tab."""
	company = _get_company()
	if not company:
		return {"error": "Company not found"}
	from_date, to_date = _period_dates(period)
	currency = frappe.get_cached_value("Company", company, "default_currency")

	# Cash and Bank accounts (leaf only)
	cash_bank = frappe.get_all(
		"Account",
		filters={"company": company, "account_type": ["in", ["Cash", "Bank"]], "is_group": 0, "disabled": 0},
		fields=["name", "account_name", "account_type"],
	)
	balances = []
	for acc in cash_bank:
		bal = get_balance_on(account=acc.name, date=to_date)
		balances.append(
			{"account": acc.name, "account_name": acc.account_name, "account_type": acc.account_type, "balance": bal}
		)

	# Income total in period (from GL)
	income_accounts = frappe.get_all(
		"Account", filters={"company": company, "root_type": "Income", "is_group": 0}, pluck="name"
	)
	expense_accounts = frappe.get_all(
		"Account", filters={"company": company, "root_type": "Expense", "is_group": 0}, pluck="name"
	)
	total_income = _gl_sum(company, income_accounts, from_date, to_date, "Credit")
	total_expense = _gl_sum(company, expense_accounts, from_date, to_date, "Debit")

	return {
		"period": period,
		"from_date": str(from_date),
		"to_date": str(to_date),
		"currency": currency,
		"cash_bank": balances,
		"total_income": total_income,
		"total_expense": total_expense,
		"net": total_income - total_expense,
	}


def _gl_sum(company, accounts, from_date, to_date, debit_or_credit):
	"""Sum GL entries: debit_or_credit is 'Debit' or 'Credit'."""
	if not accounts:
		return 0.0
	col = "debit_in_account_currency" if debit_or_credit == "Debit" else "credit_in_account_currency"
	placeholders = ", ".join(["%s"] * len(accounts))
	return flt(
		frappe.db.sql(
			"SELECT SUM(" + col + ") FROM `tabGL Entry` "
			"WHERE account IN (" + placeholders + ") AND company = %s AND posting_date >= %s AND posting_date <= %s AND is_cancelled = 0",
			[*accounts, company, from_date, to_date],
		)[0][0]
		or 0
	)


# --------------- Profit and Loss (date range) ---------------


def _get_pl_from_gl(from_date, to_date, company, currency):
	"""Compute P&L by querying GL Entry directly. Avoids financial_statements report period_list logic."""
	# Income: root_type Income, balance = sum(credit - debit) in period
	# Expense: root_type Expense, balance = sum(debit - credit) in period
	# Exclude Period Closing Voucher for P&L
	income_rows = frappe.db.sql("""
		SELECT
			g.account,
			a.account_name,
			SUM(g.credit - g.debit) AS period_balance
		FROM `tabGL Entry` g
		INNER JOIN `tabAccount` a ON a.name = g.account
		WHERE g.company = %(company)s
			AND a.root_type = 'Income'
			AND g.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND g.docstatus = 1
			AND (g.voucher_type IS NULL OR g.voucher_type != 'Period Closing Voucher')
		GROUP BY g.account, a.account_name
		HAVING ABS(SUM(g.credit - g.debit)) > 0.005
		ORDER BY period_balance DESC
	""", {"company": company, "from_date": from_date, "to_date": to_date}, as_dict=True)

	# Exclude Stock Adjustment account so P&L shows operational expenses only (Stock Adjustment often distorts due to reconciliations)
	expense_rows = frappe.db.sql("""
		SELECT
			g.account,
			a.account_name,
			SUM(g.debit - g.credit) AS period_balance
		FROM `tabGL Entry` g
		INNER JOIN `tabAccount` a ON a.name = g.account
		WHERE g.company = %(company)s
			AND a.root_type = 'Expense'
			AND (a.account_type IS NULL OR a.account_type != 'Stock Adjustment')
			AND g.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND g.docstatus = 1
			AND (g.voucher_type IS NULL OR g.voucher_type != 'Period Closing Voucher')
		GROUP BY g.account, a.account_name
		HAVING ABS(SUM(g.debit - g.credit)) > 0.005
		ORDER BY period_balance DESC
	""", {"company": company, "from_date": from_date, "to_date": to_date}, as_dict=True)

	total_income = sum(flt(r.get("period_balance")) for r in income_rows)
	total_expense = sum(flt(r.get("period_balance")) for r in expense_rows)
	net = total_income - total_expense

	# Format like the report: account_name, account, period (key used by frontend)
	income = [{"account": r.account, "account_name": r.account_name, "period": flt(r.period_balance)} for r in income_rows]
	expense = [{"account": r.account, "account_name": r.account_name, "period": flt(r.period_balance)} for r in expense_rows]

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"currency": currency,
		"income": income[:20],
		"expense": expense[:20],
		"total_income": total_income,
		"total_expense": total_expense,
		"net_profit": net,
	}


@frappe.whitelist()
def get_profit_and_loss(from_date, to_date, company=None):
	"""Return P&L data: income rows, expense rows, net. For a single period (from_date to to_date)."""
	company = company or _get_company()
	if not company:
		return {"error": "Company not found"}
	from_date = getdate(from_date) if from_date else get_first_day(nowdate())
	to_date = getdate(to_date) if to_date else getdate(nowdate())
	if from_date is None:
		from_date = get_first_day(nowdate())
	if to_date is None:
		to_date = getdate(nowdate())
	if to_date < from_date:
		to_date = from_date
	currency = frappe.get_cached_value("Company", company, "default_currency") or "USD"

	# Use direct GL-based P&L (no dependency on financial_statements report period_list)
	return _get_pl_from_gl(from_date, to_date, company, currency)


# --------------- Profitability by item (BOM cost vs selling price) ---------------

@frappe.whitelist()
def get_profitability_by_item(from_date=None, to_date=None, company=None, limit=100):
	"""For each item sold (from POS Invoice / Sales Invoice), get selling price and BOM/valuation cost; margin."""
	company = company or _get_company()
	if not company:
		return []
	from_date = getdate(from_date or add_months(nowdate(), -3))
	to_date = getdate(to_date or nowdate())
	limit = cint(limit) or 100
	limit = max(1, min(limit, 500))

	# Sales: from POS Invoice Item (and optionally Sales Invoice)
	# Sum: qty * rate per item, and we need cost. Cost from BOM or valuation rate.
	# Use limit as integer in query (MariaDB/MySQL LIMIT with %s can bind as string and cause syntax error)
	items_sold = frappe.db.sql("""
		SELECT
			pi_item.item_code,
			SUM(pi_item.qty) AS qty,
			SUM(pi_item.net_amount) AS net_sales,
			AVG(pi_item.net_rate) AS avg_selling_rate
		FROM `tabPOS Invoice Item` pi_item
		INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
		GROUP BY pi_item.item_code
		ORDER BY net_sales DESC
		LIMIT {0}
	""".format(limit), (from_date, to_date), as_dict=True)

	result = []
	for row in items_sold:
		item_code = row.item_code
		cost_per_unit = _cost_per_unit_for_item(item_code)
		total_cost = cost_per_unit * flt(row.qty)
		net_sales = flt(row.net_sales)
		margin = net_sales - total_cost
		margin_pct = (margin / net_sales * 100) if net_sales else 0
		result.append({
			"item_code": item_code,
			"item_name": frappe.get_cached_value("Item", item_code, "item_name") or item_code,
			"qty": row.qty,
			"net_sales": net_sales,
			"avg_selling_rate": row.avg_selling_rate,
			"cost_per_unit": cost_per_unit,
			"total_cost": total_cost,
			"margin": margin,
			"margin_percent": round(margin_pct, 2),
		})
	return result


def _cost_per_unit_for_item(item_code):
	"""Unit cost with robust fallbacks:
	- BOM items: sum(component qty * component unit cost), not BOM.total_cost (can be stale/zero)
	- Non-BOM: last_purchase_rate -> valuation_rate -> avg bin rate -> buying item price.
	"""
	bom_name = frappe.db.get_value(
		"BOM",
		{"item": item_code, "docstatus": 1, "is_active": 1, "is_default": 1},
		"name",
	)
	if not bom_name:
		bom_name = frappe.db.get_value(
			"BOM",
			{"item": item_code, "docstatus": 1, "is_active": 1},
			"name",
			order_by="modified desc",
		)
	if bom_name:
		bom = frappe.get_doc("BOM", bom_name)
		unit_cost = 0.0
		for row in bom.items:
			comp_cost = (
				flt(frappe.get_cached_value("Item", row.item_code, "last_purchase_rate"))
				or flt(frappe.get_cached_value("Item", row.item_code, "valuation_rate"))
			)
			if not comp_cost:
				avg_bin = frappe.db.sql(
					"""SELECT SUM(stock_value) / NULLIF(SUM(actual_qty), 0) AS avg_rate
					   FROM `tabBin` WHERE item_code = %s AND actual_qty > 0""",
					(row.item_code,),
					as_dict=True,
				)
				if avg_bin and avg_bin[0].get("avg_rate"):
					comp_cost = flt(avg_bin[0].get("avg_rate"))
			if not comp_cost:
				buying_ip = frappe.get_all(
					"Item Price",
					filters={"item_code": row.item_code, "buying": 1},
					fields=["price_list_rate"],
					order_by="modified desc",
					limit_page_length=1,
				)
				comp_cost = flt(buying_ip[0].get("price_list_rate")) if buying_ip else 0
			unit_cost += comp_cost * flt(row.qty)
		return unit_cost

	last = flt(frappe.get_cached_value("Item", item_code, "last_purchase_rate")) or 0
	if last:
		return last
	valuation = flt(frappe.get_cached_value("Item", item_code, "valuation_rate")) or 0
	if valuation:
		return valuation
	avg_bin = frappe.db.sql(
		"""SELECT SUM(stock_value) / NULLIF(SUM(actual_qty), 0) AS avg_rate
		   FROM `tabBin` WHERE item_code = %s AND actual_qty > 0""",
		(item_code,),
		as_dict=True,
	)
	if avg_bin and avg_bin[0].get("avg_rate"):
		return flt(avg_bin[0].get("avg_rate"))
	buying_ip = frappe.get_all(
		"Item Price",
		filters={"item_code": item_code, "buying": 1},
		fields=["price_list_rate"],
		order_by="modified desc",
		limit_page_length=1,
	)
	return flt(buying_ip[0].get("price_list_rate")) if buying_ip else 0


@frappe.whitelist()
def get_items_profit_and_sales_rankings(from_date=None, to_date=None, company=None, branch=None, top_n=10):
	"""Return highest/lowest profit items and highest/lowest selling items (by quantity) for the Items tab."""
	company = company or _get_company()
	from_date = getdate(from_date or add_months(nowdate(), -1))
	to_date = getdate(to_date or nowdate())
	top_n = cint(top_n) or 10
	top_n = min(max(1, top_n), 50)

	# Items sold in period (optionally by branch). LIMIT as literal to avoid MariaDB binding it as string.
	extra = " AND pi.branch = %s" if branch else ""
	params = [from_date, to_date]
	if branch:
		params.append(branch)
	limit_rows = 200
	items_sold = frappe.db.sql("""
		SELECT
			pi_item.item_code,
			SUM(pi_item.qty) AS qty,
			SUM(pi_item.net_amount) AS net_sales,
			AVG(pi_item.net_rate) AS avg_selling_rate
		FROM `tabPOS Invoice Item` pi_item
		INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
		""" + extra + """
		GROUP BY pi_item.item_code
		ORDER BY SUM(pi_item.qty) DESC
		LIMIT {0}
	""".format(limit_rows), params, as_dict=True)

	rows = []
	for row in items_sold:
		item_code = row.item_code
		cost_per_unit = _cost_per_unit_for_item(item_code)
		qty = flt(row.qty)
		net_sales = flt(row.net_sales)
		total_cost = cost_per_unit * qty
		margin = net_sales - total_cost
		margin_pct = (margin / net_sales * 100) if net_sales else 0
		rows.append({
			"item_code": item_code,
			"item_name": frappe.get_cached_value("Item", item_code, "item_name") or item_code,
			"qty": qty,
			"net_sales": net_sales,
			"avg_selling_rate": flt(row.avg_selling_rate),
			"cost_per_unit": cost_per_unit,
			"margin": margin,
			"margin_percent": round(margin_pct, 2),
		})

	# Highest profit (by margin)
	by_margin_desc = sorted(rows, key=lambda x: x["margin"], reverse=True)
	highest_profit = by_margin_desc[:top_n]
	# Lowest profit (by margin; can be negative)
	lowest_profit = sorted(rows, key=lambda x: x["margin"])[:top_n]
	# Highest selling by quantity
	by_qty_desc = sorted(rows, key=lambda x: x["qty"], reverse=True)
	highest_qty_sold = by_qty_desc[:top_n]
	# Lowest selling by quantity
	lowest_qty_sold = sorted(rows, key=lambda x: x["qty"])[:top_n]

	return {
		"highest_profit": highest_profit,
		"lowest_profit": lowest_profit,
		"highest_qty_sold": highest_qty_sold,
		"lowest_qty_sold": lowest_qty_sold,
	}


@frappe.whitelist()
def get_modes_of_payment():
	"""List modes of payment for payment dropdown."""
	return frappe.get_all(
		"Mode of Payment",
		filters={"enabled": 1},
		fields=["name"],
		order_by="name",
	)
