import frappe
from frappe import _
from frappe.utils import flt, get_datetime


def before_save(doc, method):
    sub_pos_close_check(doc, method)


def before_submit(doc, method):
    """Block submit while Orders → Unpaid drafts exist (same rule as prepare_pos_closing_entry)."""
    from ury.ury_pos.api import _branch_for_pos_profile, count_unpaid_orders_draft_pos_invoices_for_closing

    if not doc.pos_profile:
        return
    branch = _branch_for_pos_profile(doc.pos_profile, getattr(doc, "branch", None))
    if not branch:
        return
    pe = get_datetime(doc.period_end_date) if doc.period_end_date else frappe.utils.now_datetime()
    ps = get_datetime(doc.period_start_date) if doc.period_start_date else None
    n = count_unpaid_orders_draft_pos_invoices_for_closing(doc.pos_profile, branch, ps, pe)
    if n > 0:
        frappe.throw(
            _(
                "There are {0} unpaid order(s) in Orders (not Paid, Pay Later, or Consolidated). "
                "Pay each invoice or use Pay Later before submitting this closing entry."
            ).format(n),
            title=_("Unpaid orders"),
        )


def validate(doc, method):
    calculate_closing_amount(doc, method)
    validate_cashier(doc, method)


def sub_pos_close_check(doc,method):
    cashier = None
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        get_cashier = frappe.get_doc("POS Profile", doc.pos_profile)
        for user_details in get_cashier.applicable_for_users:
            if not user_details.custom_main_cashier:
                cashier = user_details.user
        if frappe.session.user != cashier:
            branch=frappe.db.get_value("POS Profile",doc.pos_profile,"branch")
            pos_opening_list = frappe.get_all(
                "POS Opening Entry",
                fields=["name", "docstatus", "status", "posting_date"],
                filters={"branch": branch,"user":cashier},
            )
            flag = 0
            for pos_opening in pos_opening_list:
                if pos_opening.status == "Open" and pos_opening.docstatus == 1:
                    flag = 1
            if flag == 1:
                frappe.throw(("Sub Cashier POS  must be closed"), title=("Sub Cashier POS Closing Required"))
                
            return flag
    else:
        pass

def calculate_closing_amount(doc, method):
    multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
    if multiple_cashier:
        sub_pos_closing = frappe.get_all(
            "Sub POS Closing",
            filters=[
                ["posting_date", "<=", doc.posting_date],
                ["period_start_date", ">=", doc.period_start_date],
                ["docstatus", "=", 1]
            ],
            fields=["name"]
        )
        for closing_details in doc.payment_reconciliation:
            sub_closing_amount = 0
            if sub_pos_closing:
                sub_closing_amount = frappe.db.get_value(
                    "Sub POS Closing Payment",
                    {"parent": sub_pos_closing[0].name, "mode_of_payment": closing_details.mode_of_payment},
                    "closing_amount",
                ) or 0
            main_closing_amount = closing_details.custom_closing_amount or 0
            total_closing_amount = sub_closing_amount + main_closing_amount
            closing_details.closing_amount = total_closing_amount
            closing_details.difference = total_closing_amount - closing_details.expected_amount
    else:
        # Single cashier: set closing_amount and difference from entered value or default to expected (avoid zeros/negatives)
        for closing_details in doc.payment_reconciliation:
            expected = flt(closing_details.expected_amount)
            entered = getattr(closing_details, "custom_closing_amount", None)
            current_closing = flt(getattr(closing_details, "closing_amount", None))
            if entered is not None and flt(entered) != 0:
                closing_details.closing_amount = flt(entered)
            elif current_closing == 0 or getattr(closing_details, "closing_amount", None) is None:
                # No amount entered or stored as zero: default to expected so difference = 0
                closing_details.closing_amount = expected
            closing_details.difference = flt(closing_details.closing_amount) - expected
def validate_cashier(doc, method):
    cashier = None
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        get_cashier = frappe.get_doc("POS Profile", doc.pos_profile)
        for user_details in get_cashier.applicable_for_users:
            if not user_details.custom_main_cashier:
                cashier = user_details.user
        if frappe.session.user == cashier:
            frappe.throw("Sub Cashiers are not allowed to make POS Closing Entries.")
    else:
        pass
    