# -*- coding: utf-8 -*-
import json
import frappe
from frappe import _
from frappe.exceptions import DoesNotExistError
from frappe.utils import flt, nowdate, add_days, cint, cstr, get_datetime
from datetime import date, datetime, timedelta
from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import (
    get_payments,
    get_taxes,
    make_closing_entry_from_opening,
)
from frappe.query_builder import DocType
from frappe.query_builder import functions as fn
from frappe.query_builder.custom import ConstantColumn


@frappe.whitelist(allow_guest=False)
def get_csrf_token():
	"""Return CSRF token for the current session. Used by POS when the page is served without server-rendered token."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Not allowed"))
	return frappe.sessions.get_csrf_token()


@frappe.whitelist()
def create_restaurant_customer(customer_name, mobile_number, customer_group=None, territory=None, custom_is_restaurant_customer=None):
	"""Create a Customer doc from POS. Uses whitelisted POST so CSRF token is sent via call.post()."""
	if not customer_name or not mobile_number:
		frappe.throw(_("Customer Name and Phone are required."))
	doc = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": "Company",
		"mobile_no": mobile_number,
	})
	if customer_group:
		doc.customer_group = customer_group
	if territory:
		doc.territory = territory
	if frappe.db.has_column("Customer", "mobile_number"):
		doc.mobile_number = mobile_number
	if custom_is_restaurant_customer is not None and frappe.db.has_column("Customer", "custom_is_restaurant_customer"):
		doc.custom_is_restaurant_customer = 1 if cint(custom_is_restaurant_customer) else 0
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def get_restaurant_customers(search=None, limit=20):
    """List customers who have at least one submitted POS Invoice (restaurant). For use in POS customer dropdown only."""
    if not frappe.db.has_column("Customer", "custom_is_restaurant_customer"):
        filters = {"disabled": 0}
    else:
        filters = {"disabled": 0, "custom_is_restaurant_customer": 1}

    fields = ["name", "customer_name", "mobile_no"]
    if frappe.db.has_column("Customer", "mobile_number"):
        fields.append("mobile_number")
    order_by = "modified desc"

    if search and search.strip():
        term = f"%{search.strip()}%"
        or_filters = [
            {"customer_name": ["like", term]},
            {"mobile_no": ["like", term]},
            {"name": ["like", term]},
        ]
        if "mobile_number" in fields:
            or_filters.append({"mobile_number": ["like", term]})
        customers = frappe.get_all(
            "Customer",
            filters=filters,
            or_filters=or_filters,
            fields=fields,
            order_by=order_by,
            limit=limit,
        )
    else:
        customers = frappe.get_all(
            "Customer",
            filters=filters,
            fields=fields,
            order_by=order_by,
            limit=limit,
        )
    return customers


@frappe.whitelist()
def getTable(room=None):
    branch_name = getBranch()
    
    # Build filters
    filters = {"branch": branch_name}
    if room:
        filters["restaurant_room"] = room
    
    tables = frappe.get_all(
        "URY Table",
        fields=["name", "occupied", "latest_invoice_time", "is_take_away", "restaurant_room","table_shape"],
        filters=filters
    )
    # For occupied tables, attach customers_served from current draft POS Invoice
    has_customers_served = frappe.get_meta("POS Invoice").has_field("customers_served")
    for t in tables:
        t["customers_served"] = 0
        if t.get("occupied") == 1 and has_customers_served:
            inv = frappe.db.get_value(
                "POS Invoice",
                {"restaurant_table": t["name"], "docstatus": 0, "status": "Draft"},
                ["customers_served"],
                as_dict=True,
            )
            if inv and inv.get("customers_served"):
                t["customers_served"] = 1
    return tables


@frappe.whitelist()
def free_table(table_name):
    """Mark table as free (occupied=0). Use when customers have left after billing."""
    if not table_name:
        frappe.throw(_("Table name is required."))
    table_doc = frappe.db.get_value("URY Table", table_name, ["name", "occupied"], as_dict=True)
    if not table_doc:
        frappe.throw(_("Table {0} not found.").format(table_name))
    if frappe.db.count("POS Invoice", {"restaurant_table": table_name, "docstatus": 0, "status": "Draft"}) > 0:
        frappe.throw(_("Table cannot be freed while it has unpaid order(s). Please complete payment first."))
    frappe.db.set_value(
        "URY Table",
        table_name,
        {"occupied": 0, "latest_invoice_time": None},
    )
    frappe.db.commit()
    return {"status": "Success", "message": _("Table {0} is now free.").format(table_name)}


@frappe.whitelist()
def set_customers_served(table_name):
    """Mark that customers at this table have been served (food delivered)."""
    if not table_name:
        frappe.throw(_("Table name is required."))
    if not frappe.get_meta("POS Invoice").has_field("customers_served"):
        frappe.throw(_("Customers served field is not available. Please run bench migrate."))
    inv = frappe.db.get_value(
        "POS Invoice",
        {"restaurant_table": table_name, "docstatus": 0, "status": "Draft"},
        ["name"],
        as_dict=True,
    )
    if not inv:
        frappe.throw(_("No draft order found for table {0}.").format(table_name))
    frappe.db.set_value("POS Invoice", inv.name, "customers_served", 1, update_modified=False)
    frappe.db.commit()
    return {"status": "Success", "message": _("Customers served marked for table {0}.").format(table_name)}


@frappe.whitelist()
def get_table_orders(table_name):
    """Return list of draft (unpaid) orders for a table so POS can show multiple orders per table."""
    if not table_name:
        return []
    branch_name = getBranch()
    invoices = frappe.get_all(
        "POS Invoice",
        filters={
            "restaurant_table": table_name,
            "docstatus": 0,
            "branch": branch_name,
            "status": "Draft",
        },
        fields=["name", "customer", "customer_name", "grand_total", "rounded_total", "posting_date", "posting_time", "modified", "status"],
        order_by="modified desc",
    )
    return invoices


@frappe.whitelist()
def mark_pos_invoice_pay_later(invoice_name):
    """
    Mark a draft POS Invoice as Pay Later.

    Business intent:
    - remove it from Orders > Unpaid (Draft list),
    - keep it visible in Parties as customer receivable to collect later.
    """
    if not invoice_name:
        frappe.throw(_("Invoice is required."))
    if not frappe.db.exists("POS Invoice", invoice_name):
        frappe.throw(_("POS Invoice {0} not found.").format(invoice_name))

    doc = frappe.get_doc("POS Invoice", invoice_name)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft POS Invoices can be moved to Pay Later."))

    # Keep invoice in Draft stage (docstatus = 0), but tag it as pay-later.
    values = {"status": "Draft"}
    if frappe.db.has_column("POS Invoice", "custom_comments"):
        existing_comments = cstr(getattr(doc, "custom_comments", "") or "")
        if PAY_LATER_TOKEN not in existing_comments:
            values["custom_comments"] = (existing_comments + ("\n" if existing_comments else "") + PAY_LATER_TOKEN).strip()
    # Free the table so new draft orders can continue for this table.
    if getattr(doc, "restaurant_table", None):
        values["restaurant_table"] = None

    frappe.db.set_value("POS Invoice", invoice_name, values, update_modified=False)
    frappe.db.commit()
    return {"ok": True, "name": invoice_name, "status": "Draft", "pay_later": 1}


@frappe.whitelist()
def get_order_for_pos(invoice_name):
    """Return one POS Invoice with items for loading into POS cart (same shape as get_order_invoice doc)."""
    if not invoice_name or not frappe.db.exists("POS Invoice", invoice_name):
        return None
    doc = frappe.get_doc("POS Invoice", invoice_name)
    if doc.docstatus != 0:
        return None
    return doc.as_dict()


# Roles that can be selected as "Waiter who served" in the payment dialog
WAITER_ROLES = ("URY Captain", "URY Cashier", "URY Manager", "Sales User", "Accounts User", "Accounts Manager", "Administrator", "System Manager")
PAY_LATER_TOKEN = "__PAY_LATER__"


@frappe.whitelist()
def get_waiters():
    """Return list of users who can serve as waiter: { name, full_name } for dropdown in payment dialog."""
    role_filter = " or ".join(["r.role = %s" for _ in WAITER_ROLES])
    users = frappe.db.sql(
        """
        SELECT DISTINCT u.name, u.full_name
        FROM `tabUser` u
        INNER JOIN `tabHas Role` r ON r.parent = u.name AND r.parenttype = 'User'
        WHERE u.enabled = 1 AND u.name != 'Guest'
        AND (%s)
        ORDER BY u.full_name, u.name
        """ % role_filter,
        tuple(WAITER_ROLES),
        as_dict=True,
    )
    # Dedupe by name and ensure full_name is set
    seen = set()
    out = []
    for r in users:
        if r.name in seen:
            continue
        seen.add(r.name)
        out.append({"name": r.name, "full_name": r.full_name or r.name})
    # If no users have waiter roles, include at least current user so payment can proceed
    if not out and frappe.session.user and frappe.session.user != "Guest":
        out = [{"name": frappe.session.user, "full_name": frappe.get_value("User", frappe.session.user, "full_name") or frappe.session.user}]
    return out


def _selling_item_price_rate_for_display(item_code, preferred_price_list=None):
    """Latest selling rate from Item Price (POS profile list, then common lists, then any)."""
    if preferred_price_list:
        rows = frappe.get_all(
            "Item Price",
            filters={"item_code": item_code, "buying": 0, "price_list": preferred_price_list},
            fields=["price_list_rate"],
            order_by="modified desc",
            limit_page_length=1,
        )
        if rows and flt(rows[0].get("price_list_rate")) > 0:
            return flt(rows[0].get("price_list_rate"))
    for pl in ("Standard Selling", "Drinks"):
        rows = frappe.get_all(
            "Item Price",
            filters={"item_code": item_code, "buying": 0, "price_list": pl},
            fields=["price_list_rate"],
            order_by="modified desc",
            limit_page_length=1,
        )
        if rows and flt(rows[0].get("price_list_rate")) > 0:
            return flt(rows[0].get("price_list_rate"))
    rows = frappe.get_all(
        "Item Price",
        filters={"item_code": item_code, "buying": 0},
        fields=["price_list_rate"],
        order_by="modified desc",
        limit_page_length=1,
    )
    if rows and flt(rows[0].get("price_list_rate")) > 0:
        return flt(rows[0].get("price_list_rate"))
    return 0.0


def _bin_valuation_for_display(item_code, bin_data, selling_price_list=None):
    """
    Return (valuation_rate, stock_value) for POS Items tab.

    ERPNext `Bin` can show valuation_rate = 1 and stock_value = qty (placeholder) when
    stock was posted without a proper rate. Fall back to Item master, buying Item Price,
    then selling Item Price (POS profile price list, Standard Selling, Drinks, any).
    """
    if not bin_data:
        return 0.0, 0.0
    qty = flt(bin_data.get("actual_qty"))
    vr = flt(bin_data.get("valuation_rate"))
    sv = flt(bin_data.get("stock_value"))
    if qty <= 0:
        return vr, sv

    suspicious = (abs(vr - 1.0) < 1e-9 and abs(sv - qty) < 0.01) or vr <= 0 or sv <= 0
    if not suspicious:
        return vr, sv if sv else qty * vr

    item_row = frappe.db.get_value(
        "Item",
        item_code,
        ["last_purchase_rate", "valuation_rate", "standard_rate"],
        as_dict=True,
    ) or {}
    fb = (
        flt(item_row.get("last_purchase_rate"))
        or flt(item_row.get("valuation_rate"))
        or flt(item_row.get("standard_rate"))
        or 0
    )
    if fb <= 0:
        ip = frappe.get_all(
            "Item Price",
            filters={"item_code": item_code, "buying": 1},
            fields=["price_list_rate"],
            order_by="modified desc",
            limit_page_length=1,
        )
        if ip:
            fb = flt(ip[0].get("price_list_rate"))

    if fb <= 0:
        fb = _selling_item_price_rate_for_display(item_code, selling_price_list)

    if fb > 0:
        return fb, qty * fb
    return vr, sv if sv else qty * vr


@frappe.whitelist()
def get_sellable_items_for_items_tab(pos_profile):
    """Return list of sellable items (from URY Menu for user's branch) with basic stock info for Items tab."""
    if not pos_profile or not frappe.db.exists("POS Profile", pos_profile):
        return []
    profile = frappe.get_doc("POS Profile", pos_profile)
    warehouse = profile.warehouse
    selling_pl = getattr(profile, "selling_price_list", None) or None
    branch_name = getBranch()
    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")
    if not restaurant:
        return []
    menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    if not menu:
        other_menus = frappe.get_all("URY Menu", filters={"branch": branch_name, "enabled": 1}, fields=["name"], pluck="name")
        menu = other_menus[0] if other_menus else None
    if not menu:
        return []
    seen = {}
    for m in [menu] + [x for x in frappe.get_all("URY Menu", filters={"branch": branch_name, "enabled": 1}, pluck="name") if x != menu]:
        rows = frappe.get_all("URY Menu Item", filters={"parent": m, "disabled": 0}, fields=["item", "item_name", "rate"], order_by="item_name asc")
        for r in rows:
            if r.item and r.item not in seen:
                bin_data = frappe.db.get_value("Bin", {"item_code": r.item, "warehouse": warehouse}, ["actual_qty", "valuation_rate", "stock_value"], as_dict=True) if warehouse else None
                _vr, _sv = _bin_valuation_for_display(r.item, bin_data or {}, selling_pl)
                has_bom = 1 if frappe.db.get_value("BOM", {"item": r.item, "is_active": 1, "is_default": 1, "docstatus": 1}, "name") else 0
                # Unit cost: BOM-derived for recipe items; otherwise fallback to last buying price.
                if has_bom:
                    bom_name = frappe.db.get_value("BOM", {"item": r.item, "is_active": 1, "is_default": 1, "docstatus": 1}, "name")
                    bom_doc = frappe.get_doc("BOM", bom_name) if bom_name else None
                    unit_cost = 0
                    if bom_doc:
                        for b_row in bom_doc.items:
                            rm_bin = frappe.db.get_value(
                                "Bin",
                                {"item_code": b_row.item_code, "warehouse": warehouse},
                                ["actual_qty", "valuation_rate", "stock_value"],
                                as_dict=True,
                            ) if warehouse else None
                            rate = flt(rm_bin.get("valuation_rate")) if rm_bin and rm_bin.get("valuation_rate") else None
                            if rate is None or rate == 0:
                                total_bins = frappe.db.sql(
                                    """SELECT SUM(actual_qty) as total_qty, SUM(stock_value) / NULLIF(SUM(actual_qty), 0) as avg_rate
                                       FROM `tabBin` WHERE item_code = %s AND actual_qty > 0""",
                                    b_row.item_code,
                                    as_dict=True,
                                )
                                if total_bins and total_bins[0].get("avg_rate"):
                                    rate = flt(total_bins[0].get("avg_rate"))
                                if rate is None or rate == 0:
                                    rate = flt(frappe.db.get_value("Item", b_row.item_code, "last_purchase_rate")) or 0
                            unit_cost += rate * flt(b_row.qty)
                else:
                    # Keep non-BOM list cost consistent with detail popup "Rate" fallback logic.
                    unit_cost = _vr if flt(_vr) > 0 else (flt(frappe.db.get_value("Item", r.item, "last_purchase_rate")) or 0)

                last_sale = frappe.db.sql(
                    """
                    SELECT pi_item.net_rate AS rate
                    FROM `tabPOS Invoice Item` pi_item
                    INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
                    WHERE pi_item.item_code = %s AND pi.docstatus = 1
                    ORDER BY pi.posting_date DESC, pi.creation DESC
                    LIMIT 1
                    """,
                    (r.item,),
                    as_dict=True,
                )
                recent_sale_price = flt(last_sale[0].get("rate")) if last_sale else 0
                seen[r.item] = {
                    "item_code": r.item,
                    "item_name": r.item_name or r.item,
                    "rate": r.rate,
                    "actual_qty": flt(bin_data.get("actual_qty")) if bin_data else 0,
                    "stock_value": _sv,
                    "unit_cost": unit_cost,
                    "recent_sale_price": recent_sale_price,
                    "has_bom": has_bom,
                }
    return list(seen.values())


@frappe.whitelist()
def get_item_inventory_detail(item_code, pos_profile):
    """Return item detail with stock value, BOM raw materials (stock qty, recent price), and unit cost for Items tab."""
    if not item_code or not frappe.db.exists("Item", item_code):
        return None
    if not pos_profile or not frappe.db.exists("POS Profile", pos_profile):
        return None
    profile = frappe.get_doc("POS Profile", pos_profile)
    warehouse = profile.warehouse
    selling_pl = getattr(profile, "selling_price_list", None) or None
    item = frappe.get_doc("Item", item_code)
    bin_data = frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, ["actual_qty", "valuation_rate", "stock_value"], as_dict=True) if warehouse else None
    disp_vr, disp_sv = _bin_valuation_for_display(item_code, bin_data or {}, selling_pl)
    # Most recent sale price (last sold rate from POS Invoice Item)
    last_sale = frappe.db.sql("""
        SELECT pi_item.net_rate AS rate
        FROM `tabPOS Invoice Item` pi_item
        INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
        WHERE pi_item.item_code = %s AND pi.docstatus = 1
        ORDER BY pi.posting_date DESC, pi.creation DESC
        LIMIT 1
    """, (item_code,), as_dict=True)
    recent_sale_price = flt(last_sale[0].get("rate")) if last_sale else None

    # Warehouse breakdown: all warehouses where this item has stock
    warehouse_breakdown = []
    if item.is_stock_item:
        bins = frappe.db.sql("""
            SELECT b.warehouse, b.actual_qty, b.valuation_rate, b.stock_value
            FROM `tabBin` b
            WHERE b.item_code = %s AND b.actual_qty != 0
            ORDER BY b.actual_qty DESC
        """, (item_code,), as_dict=True)
        for row in bins:
            wh_vr, wh_sv = _bin_valuation_for_display(
                item_code,
                {
                    "actual_qty": row.actual_qty,
                    "valuation_rate": row.valuation_rate,
                    "stock_value": row.stock_value,
                },
                selling_pl,
            )
            warehouse_breakdown.append({
                "warehouse": row.warehouse,
                "actual_qty": flt(row.actual_qty),
                "valuation_rate": wh_vr,
                "stock_value": wh_sv,
            })

    result = {
        "item_code": item_code,
        "item_name": item.item_name,
        "stock_uom": item.stock_uom,
        "is_stock_item": item.is_stock_item,
        "actual_qty": flt(bin_data.get("actual_qty")) if bin_data else 0,
        "valuation_rate": disp_vr,
        "stock_value": disp_sv,
        "warehouse_breakdown": warehouse_breakdown,
        "bom": None,
        "unit_cost": None,
        "recent_sale_price": recent_sale_price,
    }
    bom_name = frappe.db.get_value("BOM", {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1}, "name")
    if not bom_name and frappe.db.exists("BOM", "BOM-" + item_code):
        bom_name = "BOM-" + item_code
    if not bom_name:
        return result
    bom = frappe.get_doc("BOM", bom_name)
    result["bom"] = {
        "name": bom.name,
        "quantity": bom.quantity,
        "raw_material_cost": flt(getattr(bom, "raw_material_cost", 0)),
        "items": [],
    }
    unit_cost = 0
    for row in bom.items:
        # Prefer POS profile warehouse; fall back to total stock and price from any warehouse
        rm_bin = frappe.db.get_value("Bin", {"item_code": row.item_code, "warehouse": warehouse}, ["actual_qty", "valuation_rate", "stock_value"], as_dict=True) if warehouse else None
        current_stock = flt(rm_bin.get("actual_qty")) if rm_bin else 0
        rate = flt(rm_bin.get("valuation_rate")) if rm_bin and rm_bin.get("valuation_rate") else None
        if rate is None or rate == 0:
            # Use total stock across all warehouses and a price from any bin or last purchase
            total_bins = frappe.db.sql(
                """SELECT SUM(actual_qty) as total_qty, SUM(stock_value) / NULLIF(SUM(actual_qty), 0) as avg_rate
                   FROM `tabBin` WHERE item_code = %s AND actual_qty > 0""",
                row.item_code,
                as_dict=True,
            )
            if total_bins and total_bins[0].get("total_qty"):
                if current_stock == 0:
                    current_stock = flt(total_bins[0].get("total_qty"))
                if (rate is None or rate == 0) and total_bins[0].get("avg_rate"):
                    rate = flt(total_bins[0].get("avg_rate"))
            if rate is None or rate == 0:
                rate = flt(frappe.db.get_value("Item", row.item_code, "last_purchase_rate")) or 0
        amount = rate * flt(row.qty)
        unit_cost += amount
        result["bom"]["items"].append({
            "item_code": row.item_code,
            "item_name": row.item_name or row.item_code,
            "qty": flt(row.qty),
            "uom": row.uom or frappe.db.get_value("Item", row.item_code, "stock_uom"),
            "current_stock": current_stock,
            "recent_price": rate,
            "amount": amount,
        })
    result["unit_cost"] = unit_cost
    result["bom"]["unit_cost"] = unit_cost
    return result


@frappe.whitelist()
def get_raw_materials_remaining(pos_profile=None, warehouse=None):
    """Return list of raw material items with current stock in the given warehouse for POS 'raw materials remaining' screen.
    Raw materials = items in Item Group 'Raw Materials' or items that appear as components in any BOM.
    """
    if not warehouse and pos_profile and frappe.db.exists("POS Profile", pos_profile):
        warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
    if not warehouse:
        return []
    # Items that are raw materials: Item Group "Raw Materials" or used in BOM Item
    item_codes = set()
    # From Item Group
    for r in frappe.get_all("Item", filters={"item_group": "Raw Materials", "disabled": 0}, pluck="name"):
        item_codes.add(r)
    # From BOM Item (components)
    for r in frappe.db.sql("SELECT DISTINCT item_code FROM `tabBOM Item`", as_dict=True):
        if r.get("item_code"):
            item_codes.add(r.item_code)
    if not item_codes:
        return []
    # Current stock from Bin for this warehouse
    result = []
    for code in sorted(item_codes):
        bin_row = frappe.db.get_value(
            "Bin",
            {"item_code": code, "warehouse": warehouse},
            "actual_qty",
        )
        item_name = frappe.db.get_value("Item", code, "item_name") or code
        stock_uom = frappe.db.get_value("Item", code, "stock_uom") or "Nos"
        result.append({
            "item_code": code,
            "item_name": item_name,
            "actual_qty": flt(bin_row) if bin_row is not None else 0,
            "stock_uom": stock_uom,
        })
    return result


@frappe.whitelist()
def get_customers_suppliers_unpaid(company=None):
	"""Return customers and suppliers with their unpaid (outstanding) invoice totals. For receivables (we demand) and payables (suppliers demand us)."""
	try:
		from ury.ury_pos.accounting_api import _get_company
		company = company or _get_company()
	except Exception:
		company = company or frappe.defaults.get_default("company")
	if not company:
		return {"customers": [], "suppliers": []}

	# Customers: Sales Invoice outstanding (we are owed)
	customers = frappe.db.sql("""
		SELECT customer AS name, customer_name, SUM(outstanding_amount) AS unpaid_total
		FROM `tabSales Invoice`
		WHERE company = %s AND docstatus = 1 AND outstanding_amount > 0
		GROUP BY customer, customer_name
		ORDER BY unpaid_total DESC
	""", (company,), as_dict=True)
	for r in customers:
		r["unpaid_total"] = flt(r.get("unpaid_total"))

	# Customers: POS Invoice moved to Pay Later (draft receivables to collect later)
	pos_pay_later = frappe.db.sql(
		"""
		SELECT
			i.customer AS name,
			COALESCE(c.customer_name, i.customer) AS customer_name,
			i.name AS invoice_name,
			i.posting_date,
			i.rounded_total,
			i.grand_total
		FROM `tabPOS Invoice` i
		LEFT JOIN `tabCustomer` c ON c.name = i.customer
		WHERE i.branch = %s
			AND i.docstatus = 0
			AND (
				i.status = 'Pay Later'
				OR COALESCE(i.custom_comments, '') LIKE %s
			)
		ORDER BY i.posting_date DESC, i.modified DESC
		""",
		(getBranch(), f"%{PAY_LATER_TOKEN}%"),
		as_dict=True,
	)
	pay_later_by_customer = {}
	for row in pos_pay_later:
		key = row.get("name")
		if not key:
			continue
		pay_later_by_customer.setdefault(key, {"customer_name": row.get("customer_name") or key, "invoices": [], "total": 0.0})
		amt = flt(row.get("rounded_total") or row.get("grand_total") or 0)
		pay_later_by_customer[key]["invoices"].append(
			{
				"name": row.get("invoice_name"),
				"posting_date": row.get("posting_date"),
				"amount": amt,
			}
		)
		pay_later_by_customer[key]["total"] += amt

	# Merge pay-later totals into customer totals
	customer_map = {r.get("name"): r for r in customers}
	for customer_name, data in pay_later_by_customer.items():
		if customer_name in customer_map:
			customer_map[customer_name]["unpaid_total"] = flt(customer_map[customer_name].get("unpaid_total")) + flt(data["total"])
		else:
			customer_map[customer_name] = {
				"name": customer_name,
				"customer_name": data["customer_name"],
				"unpaid_total": flt(data["total"]),
			}
	customers = sorted(customer_map.values(), key=lambda r: flt(r.get("unpaid_total")), reverse=True)

	# Suppliers: Purchase Invoice outstanding (we owe)
	suppliers = frappe.db.sql("""
		SELECT supplier AS name, supplier_name, SUM(outstanding_amount) AS unpaid_total
		FROM `tabPurchase Invoice`
		WHERE company = %s AND docstatus = 1 AND outstanding_amount > 0
		GROUP BY supplier, supplier_name
		ORDER BY unpaid_total DESC
	""", (company,), as_dict=True)
	for r in suppliers:
		r["unpaid_total"] = flt(r.get("unpaid_total"))

	return {
		"customers": customers,
		"suppliers": suppliers,
		"customer_pay_later": [
			{
				"name": customer_name,
				"customer_name": data["customer_name"],
				"total": flt(data["total"]),
				"invoices": data["invoices"],
			}
			for customer_name, data in pay_later_by_customer.items()
		],
	}


@frappe.whitelist()
def get_unpaid_invoices_for_party(party_type, party, company=None):
	"""List unpaid Sales Invoices for a Customer or Purchase Invoices for a Supplier (outstanding > 0)."""
	if party_type not in ("Customer", "Supplier") or not party:
		return []
	try:
		from ury.ury_pos.accounting_api import _get_company
		company = company or _get_company()
	except Exception:
		company = company or frappe.defaults.get_default("company")
	if not company:
		return []
	if party_type == "Customer":
		rows = frappe.get_all(
			"Sales Invoice",
			filters={"customer": party, "company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
			fields=["name", "posting_date", "outstanding_amount", "grand_total", "status"],
			order_by="posting_date desc",
		)
		for r in rows:
			r["doc_type"] = "Sales Invoice"
		return rows
	rows = frappe.get_all(
		"Purchase Invoice",
		filters={"supplier": party, "company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
		fields=["name", "supplier", "supplier_name", "posting_date", "outstanding_amount", "grand_total", "status", "currency"],
		order_by="posting_date desc",
	)
	if not rows:
		return []
	pi_names = [inv["name"] for inv in rows]
	linked = frappe.get_all(
		"Purchase Receipt Item",
		filters={"purchase_invoice": ["in", pi_names]},
		fields=["parent", "purchase_invoice"],
	)
	pi_to_pr = {r["purchase_invoice"]: r["parent"] for r in linked}
	for inv in rows:
		inv["doc_type"] = "Purchase Invoice"
		inv["purchase_receipt"] = pi_to_pr.get(inv["name"])
	return rows


@frappe.whitelist()
def get_unpaid_party_lines(company=None):
	"""All unpaid customer lines (Sales Invoices + POS Pay Later) and supplier Purchase Invoices for POS tables."""
	try:
		from ury.ury_pos.accounting_api import _get_company
		company = company or _get_company()
	except Exception:
		company = company or frappe.defaults.get_default("company")
	if not company:
		return {"customer_lines": [], "supplier_lines": []}

	customer_lines = []
	sis = frappe.get_all(
		"Sales Invoice",
		filters={"company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
		fields=["name", "customer", "customer_name", "posting_date", "outstanding_amount", "grand_total", "status"],
		order_by="posting_date desc",
	)
	for si in sis:
		customer_lines.append(
			{
				"line_kind": "sales_invoice",
				"customer": si.get("customer"),
				"customer_name": si.get("customer_name") or si.get("customer"),
				"document": si.get("name"),
				"posting_date": str(si.get("posting_date") or "")[:10],
				"amount": flt(si.get("outstanding_amount")),
				"outstanding": flt(si.get("outstanding_amount")),
				"grand_total": flt(si.get("grand_total")),
				"status": si.get("status") or "",
			}
		)

	pos_pay_later = frappe.db.sql(
		"""
		SELECT
			i.customer AS customer,
			COALESCE(c.customer_name, i.customer) AS customer_name,
			i.name AS invoice_name,
			i.posting_date,
			i.rounded_total,
			i.grand_total
		FROM `tabPOS Invoice` i
		LEFT JOIN `tabCustomer` c ON c.name = i.customer
		WHERE i.branch = %s
			AND i.docstatus = 0
			AND (
				i.status = 'Pay Later'
				OR COALESCE(i.custom_comments, '') LIKE %s
			)
		ORDER BY i.posting_date DESC, i.modified DESC
		""",
		(getBranch(), f"%{PAY_LATER_TOKEN}%"),
		as_dict=True,
	)
	for row in pos_pay_later:
		if not row.get("customer"):
			continue
		amt = flt(row.get("rounded_total") or row.get("grand_total") or 0)
		customer_lines.append(
			{
				"line_kind": "pay_later",
				"customer": row.get("customer"),
				"customer_name": row.get("customer_name") or row.get("customer"),
				"document": row.get("invoice_name"),
				"posting_date": str(row.get("posting_date") or "")[:10],
				"amount": amt,
				"outstanding": amt,
				"grand_total": amt,
				"status": "Pay Later",
			}
		)

	customer_lines.sort(
		key=lambda x: ((x.get("posting_date") or ""), (x.get("document") or "")),
		reverse=True,
	)

	pis = frappe.get_all(
		"Purchase Invoice",
		filters={"company": company, "docstatus": 1, "outstanding_amount": [">", 0]},
		fields=["name", "supplier", "supplier_name", "posting_date", "outstanding_amount", "grand_total", "status", "currency"],
		order_by="posting_date desc",
	)
	supplier_lines = []
	if pis:
		pi_names = [inv["name"] for inv in pis]
		linked = frappe.get_all(
			"Purchase Receipt Item",
			filters={"purchase_invoice": ["in", pi_names]},
			fields=["parent", "purchase_invoice"],
		)
		pi_to_pr = {r["purchase_invoice"]: r["parent"] for r in linked}
		for inv in pis:
			supplier_lines.append(
				{
					"name": inv.get("name"),
					"supplier": inv.get("supplier"),
					"supplier_name": inv.get("supplier_name") or inv.get("supplier"),
					"posting_date": str(inv.get("posting_date") or "")[:10],
					"outstanding_amount": flt(inv.get("outstanding_amount")),
					"grand_total": flt(inv.get("grand_total")),
					"status": inv.get("status") or "",
					"currency": inv.get("currency") or "",
					"purchase_receipt": pi_to_pr.get(inv.get("name")),
				}
			)

	return {"customer_lines": customer_lines, "supplier_lines": supplier_lines}


@frappe.whitelist()
def get_warehouses_for_transfer(company=None):
	"""List warehouses (name, warehouse_name) for stock transfer dropdowns."""
	try:
		from ury.ury_pos.accounting_api import _get_company
		company = company or _get_company()
	except Exception:
		company = company or frappe.defaults.get_default("company")
	if not company:
		return []
	return frappe.get_all(
		"Warehouse",
		filters={"company": company, "is_group": 0},
		fields=["name", "warehouse_name"],
		order_by="name",
	)


@frappe.whitelist()
def create_stock_transfer(from_warehouse, to_warehouse, items, company=None):
	"""Create and submit a Stock Entry (Material Transfer) to move items from one warehouse to another.
	items: list of dicts with item_code and qty."""
	if not from_warehouse or not to_warehouse:
		frappe.throw(_("From warehouse and To warehouse are required."))
	if from_warehouse == to_warehouse:
		frappe.throw(_("From and To warehouse must be different."))
	try:
		from ury.ury_pos.accounting_api import _get_company
		company = company or _get_company()
	except Exception:
		company = company or frappe.defaults.get_default("company")
	if not company:
		frappe.throw(_("Company not found."))
	if not items:
		frappe.throw(_("Add at least one item with quantity."))
	if isinstance(items, str):
		items = json.loads(items)
	# Validate warehouses belong to company
	for wh in (from_warehouse, to_warehouse):
		if not frappe.db.exists("Warehouse", wh):
			frappe.throw(_("Warehouse {0} not found.").format(wh))
		wh_company = frappe.get_cached_value("Warehouse", wh, "company")
		if wh_company != company:
			frappe.throw(_("Warehouse {0} is not in company {1}.").format(wh, company))

	ste = frappe.new_doc("Stock Entry")
	ste.purpose = "Material Transfer"
	ste.company = company
	ste.from_warehouse = from_warehouse
	ste.to_warehouse = to_warehouse
	for row in items:
		item_code = (row.get("item_code") or row.get("item")).strip() if row else None
		qty = flt(row.get("qty") or row.get("quantity"), 6)
		if not item_code or qty <= 0:
			continue
		if not frappe.db.exists("Item", item_code):
			frappe.throw(_("Item {0} not found.").format(item_code))
		ste.append("items", {
			"item_code": item_code,
			"s_warehouse": from_warehouse,
			"t_warehouse": to_warehouse,
			"qty": qty,
		})
	if not ste.items:
		frappe.throw(_("No valid items with quantity to transfer."))
	ste.flags.ignore_permissions = True
	ste.insert()
	ste.submit()
	return {"stock_entry": ste.name, "message": _("Stock transfer {0} submitted.").format(ste.name)}


def _parse_ury_modifier_groups_json(raw):
    """Parse URY Menu Item modifier_groups_json into a list for the POS."""
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception:
        return []


@frappe.whitelist()
def getRestaurantMenu(pos_profile, room=None, order_type=None):
    menu_items = []
    menu_items_with_image = []

    if not pos_profile:
        frappe.throw(_("POS Profile is required. Please ensure you have a POS Profile selected."))

    # Always use the document name (string) for db.get_value; never pass a doc object
    pos_profile_name = pos_profile.name if hasattr(pos_profile, "name") else str(pos_profile)
    try:
        pos_profile_doc = frappe.get_doc("POS Profile", pos_profile_name)
    except Exception as e:
        frappe.throw(_("POS Profile '{0}' not found or not accessible. Please check your setup.").format(pos_profile))

    user_role = frappe.get_roles()

    cashier = any(
        role.role in user_role for role in pos_profile_doc.role_allowed_for_billing
    )
    branch_name = getBranch()
    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")

    if not restaurant:
        frappe.throw(
            _("No URY Restaurant found for branch '{0}'. Please create a URY Restaurant and set its Branch to this branch.")
            .format(branch_name)
        )

    if room:
    
        room_wise_menu = frappe.db.get_value(
            "URY Restaurant", restaurant, "room_wise_menu"
        )
        
        if room_wise_menu:
            menu = frappe.db.get_value(
                "Menu for Room",
                {"parent": restaurant, "room": room},
                "menu"
            )
            if not menu:
                 menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
        else:
            menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")

    elif cashier and order_type:
        order_type_wise_menu = frappe.db.get_value(
            "URY Restaurant", restaurant, "order_type_wise_menu"
        )
    
        if order_type_wise_menu:
            menu = frappe.db.get_value(
                "Order Type Menu",
                {"parent": restaurant, "order_type": order_type},
                "menu"
            )
            if not menu:
                 menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    
        else:
            menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")

    # Default menu if nothing is selected
    else:
        menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    
    if not menu:
        frappe.throw(_("Please set an active menu for Restaurant {0}").format(restaurant))

    # Collect item_code -> item dict so we can merge from multiple menus (no duplicates)
    seen_items = {}
    menus_to_load = [menu]

    # Also load items from all other enabled menus for this branch (so Drinks + Food etc. all show)
    other_menus = frappe.get_all(
        "URY Menu",
        filters={"branch": branch_name, "enabled": 1},
        fields=["name"],
        pluck="name",
    )
    for m in other_menus:
        if m and m not in menus_to_load:
            menus_to_load.append(m)

    warehouse = frappe.db.get_value("POS Profile", pos_profile_name, "warehouse") if pos_profile_name else None
    # Column exists only after `bench migrate` (DocType sync); avoid 500 before migration
    menu_item_fields = [
        "item",
        "item_name",
        "rate",
        "special_dish",
        "disabled",
        "course",
    ]
    if frappe.db.has_column("URY Menu Item", "modifier_groups_json"):
        menu_item_fields.append("modifier_groups_json")

    for menu_name in menus_to_load:
        menu_items = frappe.get_all(
            "URY Menu Item",
            filters={"parent": menu_name, "disabled": 0},
            fields=menu_item_fields,
            order_by="item_name asc",
        )
        for item in menu_items:
            if item.item and item.item not in seen_items:
                has_bom = bool(
                    frappe.db.exists(
                        "BOM",
                        {"item": item.item, "is_active": 1, "docstatus": 1},
                    )
                )
                bin_data = frappe.db.get_value(
                    "Bin", {"item_code": item.item, "warehouse": warehouse}, "actual_qty"
                ) if warehouse else None
                actual_qty = flt(bin_data) if bin_data is not None else None
                seen_items[item.item] = {
                    "item": item.item,
                    "item_name": item.item_name,
                    "rate": item.rate,
                    "special_dish": item.special_dish,
                    "disabled": item.disabled,
                    "item_image": frappe.db.get_value("Item", item.item, "image"),
                    "course": item.course,
                    # Make-to-order dishes (items with BOM) should not show FG quantity in POS.
                    "actual_qty": None if has_bom else actual_qty,
                    "has_bom": has_bom,
                    "modifier_groups": _parse_ury_modifier_groups_json(
                        item.get("modifier_groups_json")
                    ),
                }

    menu_items_with_image = list(seen_items.values())
    # Sort by item_name for consistent display
    menu_items_with_image.sort(key=lambda x: (x.get("item_name") or x.get("item") or "").lower())
    modified = frappe.db.get_value("URY Menu", menu, "modified")

    return {
        "items": menu_items_with_image,
        "modified_time": modified,
        "name": menu,
    }

@frappe.whitelist()
def getBranch():
    user = frappe.session.user
    if user != "Administrator":
        sql_query = """
            SELECT b.branch
            FROM `tabURY User` AS a
            INNER JOIN `tabBranch` AS b ON a.parent = b.name
            WHERE a.user = %s
        """
        branch_array = frappe.db.sql(sql_query, user, as_dict=True)
        if not branch_array:
            frappe.throw("User is not Associated with any Branch.Please refresh Page")

        branch_name = branch_array[0].get("branch")

        return branch_name
    else:
        # For Administrator, try to get branch from POS Profile or first available branch
        pos_profile = frappe.db.get_all("POS Profile", fields=["branch"], limit=1)
        if pos_profile and pos_profile[0].get("branch"):
            return pos_profile[0].get("branch")
        # Fallback: get first branch (Branch doctype uses 'name' as identifier)
        branch = frappe.db.get_all("Branch", fields=["name"], limit=1)
        if branch and branch[0].get("name"):
            return branch[0].get("name")
        frappe.throw("No branch found. Please create a branch and add it to a POS Profile.")

@frappe.whitelist()
def getBranchRoom():
    user = frappe.session.user
    if user != "Administrator":
        sql_query = """
            SELECT b.branch , a.room
            FROM `tabURY User` AS a
            INNER JOIN `tabBranch` AS b ON a.parent = b.name
            WHERE a.user = %s
        """
        branch_array = frappe.db.sql(sql_query, user, as_dict=True)
        
        if not branch_array:
            frappe.throw("Branch information is missing for the user. Please contact your administrator.")
        
        branch_name = branch_array[0].get("branch")
        room_name = branch_array[0].get("room")
    
        if not branch_name:
            frappe.throw("Branch information is missing for the user. Please contact your administrator.")

        if not room_name:
            frappe.throw("No room assigned to this user. Please contact your administrator.")

        return [{
            "name": room_name,
            "branch": branch_name,
        }]
    else:
        # For Administrator, get branch and default room from POS Profile/Restaurant
        branchName = getBranch()
        if not branchName:
            frappe.throw("No branch found for Administrator. Please create a POS Profile with a branch.")
        
        # Get restaurant for this branch
        restaurant = frappe.db.get_value("URY Restaurant", {"branch": branchName}, "name")
        if not restaurant:
            frappe.throw(f"No restaurant found for branch '{branchName}'. Please create a URY Restaurant linked to this branch.")
        
        # Get default room from restaurant, or first available room
        default_room = frappe.db.get_value("URY Restaurant", restaurant, "default_room")
        if not default_room:
            # Get first room for this branch
            room = frappe.db.get_all("URY Room", fields=["name"], filters={"branch": branchName}, limit=1)
            if room:
                default_room = room[0].name
            else:
                frappe.throw(f"No room found for branch '{branchName}'. Please create a URY Room and link it to this branch.")
        
        return [{
            "name": default_room,
            "branch": branchName,
        }]

@frappe.whitelist()
def validate_staff_code(staff_code):
    staff_code = (staff_code or "").strip()
    if not staff_code:
        frappe.throw(_("Please enter a staff code."))

    staff = frappe.db.get_value(
        "URY User",
        {"staff_code": staff_code},
        ["user", "parent as branch", "room", "staff_code"],
        as_dict=True,
    )

    if not staff:
        frappe.throw(_("Invalid staff code. Please try again."))

    if not staff.user:
        frappe.throw(_("No user is linked to this staff code."))

    if not frappe.db.get_value("User", staff.user, "enabled"):
        frappe.throw(_("The user linked to this staff code is disabled."))

    full_name = frappe.db.get_value("User", staff.user, "full_name") or staff.user

    return {
        "code": staff.staff_code,
        "user": staff.user,
        "full_name": full_name,
        "branch": staff.branch,
        "room": staff.room,
    }

@frappe.whitelist()
def getRoom():
    user = frappe.session.user
    if user != "Administrator":
        sql_query = """
            SELECT b.branch, a.room
            FROM `tabURY User` AS a
            INNER JOIN `tabBranch` AS b ON a.parent = b.name
            WHERE a.user = %s
        """
        branch_array = frappe.db.sql(sql_query, user, as_dict=True)
        
        if not branch_array:
            frappe.throw("No branch or room information found for the user. Please contact your administrator.")
        
        room_details = [
            {
                "name": row.get("room"),
                "branch": row.get("branch")
            } 
            for row in branch_array
        ]

        return room_details
    else:
        # For Administrator, get rooms from branch
        branchName = getBranch()
        if not branchName:
            frappe.throw("No branch found for Administrator. Please create a POS Profile with a branch.")
        
        # Get all rooms for this branch
        rooms = frappe.get_all("URY Room", fields=["name", "branch"], filters={"branch": branchName})
        if not rooms:
            frappe.throw(f"No rooms found for branch '{branchName}'. Please create a URY Room and link it to this branch.")
        
        room_details = [
            {
                "name": room.name,
                "branch": room.branch
            }
            for room in rooms
        ]
        
        return room_details

@frappe.whitelist()
def getModeOfPayment():
    posDetails = getPosProfile()
    posProfile = posDetails["pos_profile"]
    posProfiles = frappe.get_doc("POS Profile", posProfile)
    mode_of_payments = posProfiles.payments
    modeOfPayments = []
    for mop in mode_of_payments:
        modeOfPayments.append(
            {"mode_of_payment": mop.mode_of_payment, "opening_amount": float(0)}
        )
    return modeOfPayments

@frappe.whitelist()
def getInvoiceForCashier(status, cashier, limit, limit_start):
    branch = getBranch()
    updatedlist = []
    limit = int(limit)+1
    limit_start = int(limit_start)
    if status == "Draft":
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, 
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type 
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            AND (invoice_printed = 1 OR (invoice_printed = 0 AND COALESCE(restaurant_table, '') = ''))
            AND COALESCE(custom_comments, '') NOT LIKE %s
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, cashier, f"%{PAY_LATER_TOKEN}%", limit,limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)
    elif status == "Recently Paid":
        docstatus = "Paid"
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, 
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number,
                posting_date, rounded_total, order_type,additional_discount_percentage,discount_amount 
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, docstatus, cashier, limit, limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)    
    else:
        
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, 
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number,
                posting_date, rounded_total, order_type,additional_discount_percentage,discount_amount
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, cashier, limit, limit_start),
            as_dict=True,
        )

        updatedlist.extend(invoices)
    if len(updatedlist) == limit and status != "Recently Paid":
            next = True
            updatedlist.pop()
    else:
            next = False   
    return  { "data":updatedlist,"next":next}



@frappe.whitelist()
def getPosInvoice(status, limit, limit_start):
    branch = getBranch()
    updatedlist = []
    limit = int(limit)+1
    limit_start = int(limit_start)
    opening = frappe.db.sql(
        """
        SELECT period_start_date
        FROM `tabPOS Opening Entry`
        WHERE branch = %s AND status = 'Open' AND docstatus = 1
        ORDER BY creation DESC
        LIMIT 1
        """,
        (branch,),
        as_dict=True,
    )
    start_str = None
    if opening and opening[0].get("period_start_date"):
        period_start = frappe.utils.get_datetime(opening[0].period_start_date)
        start_str = period_start.strftime("%Y-%m-%d %H:%M:%S")
    if status == "Draft":
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, 
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type 
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND docstatus = 0
            AND COALESCE(custom_comments, '') NOT LIKE %s
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, f"%{PAY_LATER_TOKEN}%", limit, limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)
    elif status == "Recently Paid":
        docstatus = "Paid"
        if start_str:
            invoices = frappe.db.sql(
                """
                SELECT 
                    name, invoice_printed, grand_total, restaurant_table, 
                    cashier, waiter, net_total, posting_time, 
                    total_taxes_and_charges, customer, status, mobile_number,
                    posting_date, rounded_total, order_type,additional_discount_percentage,discount_amount 
                FROM `tabPOS Invoice` 
                WHERE branch = %s AND status = %s
                AND CONCAT(posting_date, ' ', IFNULL(posting_time, '00:00:00')) >= %s
                ORDER BY modified desc
                LIMIT %s OFFSET %s
                """,
                (branch, docstatus, start_str, limit, limit_start),
                as_dict=True,
            )
        else:
            invoices = []
        updatedlist.extend(invoices)
    elif status == "Paid":
        # Paid invoices for current POS opening session only (when session closes, new session has no paid yet)
        if start_str:
            invoices = frappe.db.sql(
                """
                SELECT 
                    name, invoice_printed, grand_total, restaurant_table,
                    cashier, waiter, net_total, posting_time,
                    total_taxes_and_charges, customer, status, mobile_number,
                    posting_date, rounded_total, order_type, additional_discount_percentage, discount_amount
                FROM `tabPOS Invoice`
                WHERE branch = %s AND status = 'Paid'
                AND CONCAT(posting_date, ' ', IFNULL(posting_time, '00:00:00')) >= %s
                ORDER BY modified DESC
                LIMIT %s OFFSET %s
                """,
                (branch, start_str, limit, limit_start),
                as_dict=True,
            )
        else:
            invoices = []
        updatedlist.extend(invoices)
    elif status == "Pay Later":
        # Pay Later invoices are draft invoices tagged with PAY_LATER_TOKEN, scoped to current open period.
        if start_str:
            invoices = frappe.db.sql(
                """
                SELECT
                    name, invoice_printed, grand_total, restaurant_table,
                    cashier, waiter, net_total, posting_time,
                    total_taxes_and_charges, customer, 'Pay Later' as status, mobile_number,
                    posting_date, rounded_total, order_type, additional_discount_percentage, discount_amount
                FROM `tabPOS Invoice`
                WHERE branch = %s AND docstatus = 0
                AND COALESCE(custom_comments, '') LIKE %s
                AND CONCAT(posting_date, ' ', IFNULL(posting_time, '00:00:00')) >= %s
                ORDER BY modified DESC
                LIMIT %s OFFSET %s
                """,
                (branch, f"%{PAY_LATER_TOKEN}%", start_str, limit, limit_start),
                as_dict=True,
            )
        else:
            invoices = []
        updatedlist.extend(invoices)
    else:
        # Consolidated / Return / any non-draft status should only show current session invoices.
        if start_str:
            invoices = frappe.db.sql(
                """
                SELECT 
                    name, invoice_printed, grand_total, restaurant_table, 
                    cashier, waiter, net_total, posting_time, 
                    total_taxes_and_charges, customer, status, mobile_number,
                    posting_date, rounded_total, order_type,additional_discount_percentage,discount_amount
                FROM `tabPOS Invoice` 
                WHERE branch = %s AND status = %s
                AND CONCAT(posting_date, ' ', IFNULL(posting_time, '00:00:00')) >= %s
                ORDER BY modified desc
                LIMIT %s OFFSET %s
                """,
                (branch, status, start_str, limit, limit_start),
                as_dict=True,
            )
        else:
            invoices = []

        updatedlist.extend(invoices)
    if len(updatedlist) == limit and status != "Recently Paid":
            next = True
            updatedlist.pop()
    else:
            next = False   
    return  { "data":updatedlist,"next":next}


@frappe.whitelist()
def searchPosInvoice(query,status):
    if not query:
        return {"data": [], "next": False}
    query = query.lower()
    filters = {"status": "Paid" if status == "Recently Paid" else status}
    if status == "Draft":
        filters["custom_comments"] = ["not like", f"%{PAY_LATER_TOKEN}%"]
    elif status == "Pay Later":
        filters = {"docstatus": 0, "custom_comments": ["like", f"%{PAY_LATER_TOKEN}%"]}
    pos_invoices = frappe.get_all(
        "POS Invoice",
        filters=filters,           
        or_filters=[
            ["name", "like", f"%{query}%"],
            ["customer", "like", f"%{query}%"],
            ["mobile_number", "like", f"%{query}%"],
        ],
        fields=["name", "customer", "grand_total", "posting_date", "posting_time", "order_type", "restaurant_table","status","grand_total","rounded_total","net_total","mobile_number"],
        limit_page_length=10 
    )
    if status == "Pay Later":
        for row in pos_invoices:
            row["status"] = "Pay Later"
    
    return {"data": pos_invoices, "next": len(pos_invoices) == 10}
    

@frappe.whitelist()
def get_select_field_options():
    options = frappe.get_meta("POS Invoice").get_field("order_type").options
    if options:
        return [{"name": option} for option in options.split("\n")]
    else:
        return []


@frappe.whitelist()
def fav_items(customer):
    pos_invoices = frappe.get_all(
        "POS Invoice", filters={"customer": customer}, fields=["name"]
    )
    item_qty = {}

    for invoice in pos_invoices:
        pos_invoice = frappe.get_doc("POS Invoice", invoice.name)
        for item in pos_invoice.items:
            item_name = item.item_name
            qty = item.qty
            if item_name not in item_qty:
                item_qty[item_name] = 0
            item_qty[item_name] += qty

    favorite_items = [
        {"item_name": item_name, "qty": qty} for item_name, qty in item_qty.items()
    ]
    return favorite_items

@frappe.whitelist()
def getCashier(room):
    branch = getBranch()
    cashier = None
    pos_opening_list = frappe.db.sql("""
        SELECT DISTINCT `tabPOS Opening Entry`.name 
        FROM `tabPOS Opening Entry`
        INNER JOIN `tabMultiple Rooms` 
        ON `tabMultiple Rooms`.parent = `tabPOS Opening Entry`.name
        WHERE `tabPOS Opening Entry`.branch = %s
        AND `tabPOS Opening Entry`.status = 'Open'
        AND `tabPOS Opening Entry`.docstatus = 1
        AND `tabMultiple Rooms`.room = %s
    """, (branch, room), as_dict=True)
    if pos_opening_list:
        cashier = frappe.db.get_value(
            "POS Opening Entry",
            {"name": pos_opening_list[0].name},
            "user",)
    return cashier       
    

@frappe.whitelist()
def getPosProfile():
    branchName = getBranch()
    waiter = frappe.session.user
    bill_present = False
    qz_host = None
    printer = None
    cashier = None
    owner = None
    
    # Try to find POS Profile for this branch
    posProfile = frappe.db.get_value("POS Profile", {"branch": branchName, "disabled": 0}, "name")
    
    # If not found, try without disabled filter (in case disabled field doesn't exist or is different)
    if not posProfile:
        posProfile = frappe.db.get_value("POS Profile", {"branch": branchName}, "name")
    
    # If still not found, list all POS Profiles for debugging
    if not posProfile:
        all_profiles = frappe.get_all("POS Profile", fields=["name", "branch", "disabled"], limit=10)
        error_msg = f"POS Profile not found for branch: '{branchName}'. "
        if all_profiles:
            branches = [p.branch for p in all_profiles if p.branch]
            error_msg += f"Available branches in POS Profiles: {', '.join(set(branches)) if branches else 'None'}. "
        error_msg += "Please ensure your POS Profile has the correct branch set and is not disabled."
        frappe.throw(error_msg)
    
    pos_profiles = frappe.get_doc("POS Profile", posProfile)
    global_defaults = frappe.get_single('Global Defaults')
    disable_rounded_total = global_defaults.disable_rounded_total
    
    # Verify branch matches (should always match since we searched by branch, but double-check)
    if pos_profiles.branch != branchName:
        frappe.throw(f"POS Profile '{posProfile}' branch '{pos_profiles.branch}' does not match requested branch '{branchName}'.")
    
    pos_profile_name = pos_profiles.name
    warehouse = pos_profiles.warehouse
    branch = pos_profiles.branch
    company = pos_profiles.company
    tableAttention = pos_profiles.table_attention_time if hasattr(pos_profiles, 'table_attention_time') else 0
    get_cashier = frappe.get_doc("POS Profile", pos_profile_name)
    print_format = pos_profiles.print_format
    paid_limit = pos_profiles.paid_limit if hasattr(pos_profiles, 'paid_limit') else 0
    enable_discount = pos_profiles.custom_enable_discount if hasattr(pos_profiles, 'custom_enable_discount') else 0
    multiple_cashier = pos_profiles.custom_enable_multiple_cashier if hasattr(pos_profiles, 'custom_enable_multiple_cashier') else 0
    edit_order_type = pos_profiles.custom_edit_order_type if hasattr(pos_profiles, 'custom_edit_order_type') else 0
    enable_kot_reprint = pos_profiles.custom_enable_kot_reprint if hasattr(pos_profiles, 'custom_enable_kot_reprint') else 0
    
    # Process cashier and owner based on multiple_cashier setting
    if multiple_cashier:
        try:
            details = getBranchRoom()
            room = details[0].get('name') 
            branch = details[0].get('branch')

            pos_opening_list = frappe.db.sql("""
                SELECT DISTINCT `tabPOS Opening Entry`.name 
                FROM `tabPOS Opening Entry`
                INNER JOIN `tabMultiple Rooms` 
                ON `tabMultiple Rooms`.parent = `tabPOS Opening Entry`.name
                WHERE `tabPOS Opening Entry`.branch = %s
                AND `tabPOS Opening Entry`.status = 'Open'
                AND `tabPOS Opening Entry`.docstatus = 1
                AND `tabMultiple Rooms`.room = %s
            """, (branch, room), as_dict=True)
            if pos_opening_list:
                pos_opened_cashier = frappe.db.get_value(
                    "POS Opening Entry",
                    {"name": pos_opening_list[0].name},
                    "user",)
            else:
                pos_opened_cashier = None
            for user_details in get_cashier.applicable_for_users:
                if user_details.custom_main_cashier:
                    owner = user_details.user
                
                if frappe.session.user == owner:
                    cashier = owner
                else:
                    cashier = pos_opened_cashier
        except Exception as e:
            # If getBranchRoom fails (e.g., no room for Administrator), fall back to single cashier mode
            if not get_cashier.applicable_for_users or len(get_cashier.applicable_for_users) == 0:
                frappe.throw("No users found in 'Applicable for Users' table. Please add at least one user to the POS Profile.")
            cashier = get_cashier.applicable_for_users[0].user
            owner = get_cashier.applicable_for_users[0].user
    else:
        if not get_cashier.applicable_for_users or len(get_cashier.applicable_for_users) == 0:
            frappe.throw("No users found in 'Applicable for Users' table. Please add at least one user to the POS Profile.")
        cashier = get_cashier.applicable_for_users[0].user
        owner = get_cashier.applicable_for_users[0].user
    
    # Process printer settings (common for both multiple_cashier and single cashier)
    qz_print = pos_profiles.qz_print
    print_type = None

    for pos_profile in pos_profiles.printer_settings:
        if pos_profile.bill == 1:
            printer = pos_profile.printer
            bill_present = True
            break

    if qz_print == 1:
        print_type = "qz"
        qz_host = pos_profiles.qz_host

    elif bill_present == True:
        print_type = "network"

    else:
        print_type = "socket"
    
    # Ensure pos_profile_name is set and not None
    if not pos_profile_name:
        frappe.throw(f"POS Profile name is empty. Please check POS Profile configuration.")
    
    invoice_details = {
        "pos_profile": pos_profile_name,
        "branch": branch,
        "company": company,
        "waiter": waiter,
        "warehouse": warehouse,
        "cashier": cashier,
        "print_format": print_format,
        "qz_print": qz_print,
        "qz_host": qz_host,
        "printer": printer,
        "print_type": print_type,
        "tableAttention": tableAttention,
        "paid_limit": paid_limit,
        "disable_rounded_total": disable_rounded_total,
        "enable_discount": enable_discount,
        "multiple_cashier": multiple_cashier,
        "owner": owner,
        "edit_order_type": edit_order_type,
        "enable_kot_reprint": enable_kot_reprint,
        "custom_service_charge_percentage": flt(getattr(pos_profiles, "custom_service_charge_percentage", 0)),
    }
    
    # Verify the POS Profile document exists and can be accessed
    try:
        test_doc = frappe.get_doc("POS Profile", pos_profile_name)
        if not test_doc:
            frappe.throw(f"POS Profile document '{pos_profile_name}' could not be loaded.")
    except frappe.DoesNotExistError:
        frappe.throw(f"POS Profile document '{pos_profile_name}' does not exist.")
    except Exception as e:
        frappe.throw(f"Error accessing POS Profile '{pos_profile_name}': {str(e)}")

    return invoice_details


@frappe.whitelist()
def getPosInvoiceItems(invoice):
    itemDetails = []
    taxDetails = []
    orderdItems = frappe.get_doc("POS Invoice", invoice)
    posItems = orderdItems.items
    for items in posItems:
        item_name = items.item_name
        qty = items.qty
        amount = items.rate
        itemDetails.append(
            {
                "item_name": item_name,
                "qty": qty,
                "amount": amount,
            }
        )
    taxDetail = orderdItems.taxes
    for tax in taxDetail:
        description = tax.description
        rate = tax.tax_amount
        taxDetails.append(
            {
                "description": description,
                "rate": rate,
            }
        )
    return itemDetails, taxDetails


@frappe.whitelist()
def posOpening():
    branchName = getBranch()
    pos_opening_list = frappe.get_all(
        "POS Opening Entry",
        fields=["name", "docstatus", "status", "posting_date"],
        filters={"branch": branchName},
    )
    flag = 1
    for pos_opening in pos_opening_list:
        if pos_opening.status == "Open" and pos_opening.docstatus == 1:
            flag = 0
    # Do not msgprint here — React POS shows "POS Not Opened" and polls this endpoint often.
    return flag


def _build_invoice_query_no_owner(invoice_doctype, pos_profile, start, end):
	"""Same as ERPNext build_invoice_query but without owner filter.

	For URY closing visibility we include submitted POS Invoices for the session
	even when they are already consolidated at payment time.
	"""
	InvoiceDocType = DocType(invoice_doctype)
	query = (
		frappe.qb.from_(InvoiceDocType)
		.select(
			InvoiceDocType.name,
			InvoiceDocType.customer,
			InvoiceDocType.posting_date,
			InvoiceDocType.grand_total,
			InvoiceDocType.net_total,
			InvoiceDocType.total_qty,
			InvoiceDocType.total_taxes_and_charges,
			InvoiceDocType.change_amount,
			InvoiceDocType.account_for_change_amount,
			InvoiceDocType.is_return,
			InvoiceDocType.return_against,
			fn.Timestamp(InvoiceDocType.posting_date, InvoiceDocType.posting_time).as_("timestamp"),
			ConstantColumn(invoice_doctype).as_("doctype"),
		)
		.where(
			(InvoiceDocType.docstatus == 1)
			& (InvoiceDocType.is_pos == 1)
			& (InvoiceDocType.pos_profile == pos_profile)
			& (
				(fn.Timestamp(InvoiceDocType.posting_date, InvoiceDocType.posting_time) >= start)
				& (fn.Timestamp(InvoiceDocType.posting_date, InvoiceDocType.posting_time) <= end)
			)
		)
	)
	if invoice_doctype != "POS Invoice":
		query = query.where(
			(InvoiceDocType.is_created_using_pos == 1)
			& fn.IfNull(InvoiceDocType.pos_closing_entry, "").eq("")
		)
	return query


def _ury_pos_closing_has_open_draft_table():
	return frappe.db.exists(
		"Custom Field",
		{"dt": "POS Closing Entry", "fieldname": "custom_ury_open_draft_pos_invoices"},
	)


def _get_draft_pos_invoice_rows(pos_profile, period_start=None, period_end=None):
	"""Draft POS Invoices for this profile within the current opening session window."""
	InvoiceDocType = DocType("POS Invoice")
	ts = fn.Timestamp(InvoiceDocType.posting_date, InvoiceDocType.posting_time)
	query = (
		frappe.qb.from_(InvoiceDocType)
		.select(
			InvoiceDocType.name,
			InvoiceDocType.customer,
			InvoiceDocType.posting_date,
			InvoiceDocType.grand_total,
			InvoiceDocType.custom_comments,
		)
		.where(
			(InvoiceDocType.docstatus == 0)
			& (InvoiceDocType.is_pos == 1)
			& (InvoiceDocType.pos_profile == pos_profile)
			& (fn.IfNull(InvoiceDocType.consolidated_invoice, "").eq(""))
		)
		.orderby(ts)
	)
	if period_start:
		query = query.where(ts >= period_start)
	if period_end:
		query = query.where(ts <= period_end)
	return query.run(as_dict=True)


def count_unpaid_orders_draft_pos_invoices_for_closing(pos_profile, branch, period_start=None, period_end=None):
	"""
	Count POS Invoices listed under Orders → Unpaid: draft, status Draft, not Pay Later (no token),
	not consolidated — same filters as getPosInvoice for Draft.
	"""
	if not pos_profile or not branch:
		return 0
	conditions = [
		"pi.docstatus = 0",
		"pi.is_pos = 1",
		"pi.pos_profile = %(pp)s",
		"pi.branch = %(br)s",
		"pi.status = 'Draft'",
		"IFNULL(pi.consolidated_invoice, '') = ''",
		"COALESCE(pi.custom_comments, '') NOT LIKE %(tok)s",
	]
	params = {"pp": pos_profile, "br": branch, "tok": f"%{PAY_LATER_TOKEN}%"}
	if period_start:
		conditions.append(
			"TIMESTAMP(pi.posting_date, IFNULL(pi.posting_time, '00:00:00')) >= %(ps)s"
		)
		params["ps"] = get_datetime(period_start)
	if period_end:
		conditions.append(
			"TIMESTAMP(pi.posting_date, IFNULL(pi.posting_time, '00:00:00')) <= %(pe)s"
		)
		params["pe"] = get_datetime(period_end)
	sql = "SELECT COUNT(*) AS c FROM `tabPOS Invoice` pi WHERE " + " AND ".join(conditions)
	row = frappe.db.sql(sql, params, as_dict=True)
	return cint(row[0].get("c")) if row else 0


def _branch_for_pos_profile(pos_profile, branch=None):
	"""POS Closing Entry may not have a branch field; resolve from POS Profile."""
	if branch:
		return branch
	if not pos_profile:
		return None
	return frappe.db.get_value("POS Profile", pos_profile, "branch")


@frappe.whitelist()
def get_unpaid_orders_count_for_pos_closing(pos_profile, branch=None, period_start=None, period_end=None):
	"""For Desk POS Closing Entry form: show how many Orders → Unpaid invoices still block submit."""
	if not pos_profile:
		return {"count": 0}
	br = _branch_for_pos_profile(pos_profile, branch)
	if not br:
		return {"count": 0}
	ps = get_datetime(period_start) if period_start else None
	pe = get_datetime(period_end) if period_end else None
	n = count_unpaid_orders_draft_pos_invoices_for_closing(pos_profile, br, ps, pe)
	return {"count": cint(n)}


def _sync_ury_open_draft_pos_rows(closing_doc):
	"""Populate custom child table so cashiers see unpaid drafts alongside paid lines (not in totals)."""
	if not _ury_pos_closing_has_open_draft_table():
		return
	rows = _get_draft_pos_invoice_rows(
		closing_doc.pos_profile,
		getattr(closing_doc, "period_start_date", None),
		getattr(closing_doc, "period_end_date", None),
	)
	closing_doc.set(
		"custom_ury_open_draft_pos_invoices",
		[
			frappe._dict(
				{
					"pos_invoice": r.name,
					"customer": r.customer,
					"posting_date": r.posting_date,
					"grand_total": flt(r.grand_total),
					"note": _("Pay Later — not in closing totals")
					if PAY_LATER_TOKEN in cstr((r.get("custom_comments") or ""))
					else _("Draft — not in closing totals"),
				}
			)
			for r in rows
		],
	)


def get_invoices_for_closing_by_profile(period_start, period_end, pos_profile):
	"""Get all POS/Sales invoices for the given period and pos_profile (no owner filter). Ensures closing entry includes every invoice for the session."""
	invoice_doctype = frappe.db.get_single_value("POS Settings", "invoice_type")
	sales_inv_query = _build_invoice_query_no_owner("Sales Invoice", pos_profile, period_start, period_end)
	query = sales_inv_query
	if invoice_doctype == "POS Invoice":
		pos_inv_query = _build_invoice_query_no_owner("POS Invoice", pos_profile, period_start, period_end)
		query = query + pos_inv_query
	query = query.orderby(query.timestamp)
	invoices = query.run(as_dict=1)
	return {"invoices": invoices, "payments": get_payments(invoices), "taxes": get_taxes(invoices)}


def _sync_closing_invoice_rows(closing_doc):
	"""Rebuild POS/Sales linked rows and reconciliation totals for a closing draft."""
	data = get_invoices_for_closing_by_profile(
		closing_doc.period_start_date,
		closing_doc.period_end_date,
		closing_doc.pos_profile,
	)
	pos_invoices = []
	sales_invoices = []
	taxes = [
		frappe._dict({"account_head": tx.account_head, "amount": tx.tax_amount})
		for tx in data.get("taxes")
	]
	payments = [
		frappe._dict(
			{
				"mode_of_payment": p.mode_of_payment,
				"opening_amount": 0,
				"expected_amount": p.amount,
				"closing_amount": flt(p.amount),
				"difference": 0,
			}
		)
		for p in data.get("payments")
	]
	closing_doc.grand_total = 0
	closing_doc.net_total = 0
	closing_doc.total_quantity = 0
	closing_doc.total_taxes_and_charges = 0
	for d in (data.get("invoices") or []):
		invoice = "pos_invoice" if d.doctype == "POS Invoice" else "sales_invoice"
		invoice_data = frappe._dict(
			{
				invoice: d.name,
				"posting_date": d.posting_date,
				"grand_total": d.grand_total,
				"customer": d.customer,
				"is_return": d.is_return,
				"return_against": d.return_against,
			}
		)
		if d.doctype == "POS Invoice":
			pos_invoices.append(invoice_data)
		else:
			sales_invoices.append(invoice_data)
		closing_doc.grand_total += flt(d.grand_total)
		closing_doc.net_total += flt(d.net_total)
		closing_doc.total_quantity += flt(d.total_qty)
		closing_doc.total_taxes_and_charges += flt(d.total_taxes_and_charges)
	closing_doc.set("pos_invoices", pos_invoices)
	closing_doc.set("sales_invoices", sales_invoices)
	closing_doc.set("payment_reconciliation", payments)
	closing_doc.set("taxes", taxes)


@frappe.whitelist()
def prepare_pos_closing_entry():
    """Create (or reuse) a POS Closing Entry prefilled from the open POS Opening Entry."""
    branch = getBranch()

    opening_entry = frappe.get_all(
        "POS Opening Entry",
        filters={
            "branch": branch,
            "status": "Open",
            "docstatus": 1,
        },
        fields=["name"],
        order_by="creation desc",
        limit=1,
    )

    if not opening_entry:
        frappe.throw("No open POS Opening Entry found for this branch. Please open POS Entry first.")

    opening_name = opening_entry[0].name
    opening_doc = frappe.get_doc("POS Opening Entry", opening_name)

    period_end_now = frappe.utils.now_datetime()
    unpaid_orders_blocking = count_unpaid_orders_draft_pos_invoices_for_closing(
        opening_doc.pos_profile,
        branch,
        opening_doc.period_start_date,
        period_end_now,
    )
    if unpaid_orders_blocking > 0:
        frappe.throw(
            _(
                "There are {0} unpaid order(s) in Orders (not Paid, Pay Later, or Consolidated). "
                "Pay each invoice or use Pay Later before closing the POS."
            ).format(unpaid_orders_blocking),
            title=_("Unpaid orders"),
        )

    # Draft POS Invoices (incl. Pay Later): informational count for the POS UI; only submitted
    # invoices are included in closing totals.
    draft_pos_invoice_count = len(
        _get_draft_pos_invoice_rows(
            opening_doc.pos_profile,
            opening_doc.period_start_date,
            period_end_now,
        )
    )

    if opening_doc.pos_closing_entry:
        existing = frappe.get_doc("POS Closing Entry", opening_doc.pos_closing_entry)
        if existing.docstatus == 0:
            # Keep draft closing aligned to the current session snapshot.
            # Without refreshing period_end_date, newly created draft invoices
            # after the first open can be counted but not listed.
            existing.period_end_date = period_end_now
            _sync_closing_invoice_rows(existing)
            frappe.share.add_docshare(
                "POS Closing Entry",
                existing.name,
                frappe.session.user,
                read=1,
                write=1,
                share=0,
                notify=0,
            )
            _sync_ury_open_draft_pos_rows(existing)
            existing.flags.ignore_permissions = True
            existing.save(ignore_permissions=True)
            frappe.db.commit()
            return {
                "name": existing.name,
                "draft_pos_invoices_remaining": cint(draft_pos_invoice_count),
            }
        if existing.docstatus == 1:
            frappe.throw("This POS Opening Entry has already been closed.")

    closing_doc = make_closing_entry_from_opening(opening_doc)
    # Rebuild invoice list without owner filter so all invoices for this pos_profile in the period are included
    _sync_closing_invoice_rows(closing_doc)
    _sync_ury_open_draft_pos_rows(closing_doc)

    closing_doc.flags.ignore_permissions = True
    closing_doc.insert()
    opening_doc.db_set("pos_closing_entry", closing_doc.name, update_modified=False)
    frappe.share.add_docshare(
        "POS Closing Entry",
        closing_doc.name,
        frappe.session.user,
        read=1,
        write=1,
        share=0,
        notify=0,
    )
    frappe.db.commit()

    return {
        "name": closing_doc.name,
        "draft_pos_invoices_remaining": cint(draft_pos_invoice_count),
    }


@frappe.whitelist()
def prepare_sub_pos_closing():
    """Create a draft Sub POS Closing for the current (sub-)cashier. Shown only when multi-cashier is on and user is not main cashier."""
    branch = getBranch()
    pos_profile_data = getPosProfile()
    pos_profile = pos_profile_data.get("pos_profile") if isinstance(pos_profile_data, dict) else pos_profile_data
    multiple_cashier = cint(pos_profile_data.get("multiple_cashier")) if isinstance(pos_profile_data, dict) else 0
    owner = (pos_profile_data.get("owner") or "").strip() if isinstance(pos_profile_data, dict) else ""

    if not multiple_cashier:
        frappe.throw(_("Sub POS Closing is only available when multiple cashier is enabled on the POS Profile."))
    if frappe.session.user == owner:
        frappe.throw(_("Main cashier must use Close POS. Sub POS Closing is for sub-cashiers only."))

    opening_entry = frappe.get_all(
        "POS Opening Entry",
        filters={"branch": branch, "status": "Open", "docstatus": 1},
        fields=["name", "pos_profile", "company", "period_start_date"],
        order_by="creation desc",
        limit=1,
    )
    if not opening_entry:
        frappe.throw(_("No open POS Opening Entry found for this branch. Please open POS first."))

    opening_name = opening_entry[0].name
    opening_row = opening_entry[0]

    sub = frappe.new_doc("Sub POS Closing")
    sub.pos_opening_entry = opening_name
    sub.pos_profile = opening_row.pos_profile or pos_profile
    sub.user = frappe.session.user
    sub.posting_date = frappe.utils.getdate()
    sub.flags.ignore_permissions = True
    sub.insert()
    frappe.share.add_docshare(
        "Sub POS Closing",
        sub.name,
        frappe.session.user,
        read=1,
        write=1,
        share=0,
        notify=0,
    )
    frappe.db.commit()
    return {"name": sub.name}


@frappe.whitelist()
def prepare_pos_opening_entry():
    """Create (or reuse) a draft POS Opening Entry for the current branch and user."""
    branch = getBranch()
    pos_profile_data = getPosProfile()
    
    # Extract pos_profile name from the dictionary returned by getPosProfile()
    pos_profile = pos_profile_data.get("pos_profile") if isinstance(pos_profile_data, dict) else pos_profile_data
    
    if not pos_profile:
        frappe.throw("Could not determine POS Profile. Please ensure your POS Profile is configured correctly.")
    
    # Check if there's already a draft opening entry for this branch/user
    existing_draft = frappe.get_all(
        "POS Opening Entry",
        filters={
            "branch": branch,
            "user": frappe.session.user,
            "docstatus": 0,  # Draft
        },
        fields=["name"],
        order_by="creation desc",
        limit=1,
    )
    
    if existing_draft:
        entry_name = existing_draft[0].name
        # Ensure user has access
        frappe.share.add_docshare(
            "POS Opening Entry",
            entry_name,
            frappe.session.user,
            read=1,
            write=1,
            share=0,
            notify=0,
        )
        frappe.db.commit()
        return {"name": entry_name}
    
    # Create new draft entry (balance_details is mandatory: add rows from POS Profile payments)
    pos_profile_doc = frappe.get_doc("POS Profile", pos_profile)
    opening_doc = frappe.get_doc(
        {
            "doctype": "POS Opening Entry",
            "period_start_date": frappe.utils.get_datetime(),
            "posting_date": frappe.utils.getdate(),
            "user": frappe.session.user,
            "pos_profile": pos_profile,
            "company": pos_profile_doc.company,
            "branch": branch,
            "docstatus": 0,  # Draft
        }
    )
    for pay in getattr(pos_profile_doc, "payments", []) or []:
        opening_doc.append(
            "balance_details",
            {"mode_of_payment": pay.mode_of_payment, "opening_amount": 0},
        )
    if not opening_doc.balance_details:
        first_mode = frappe.get_all(
            "Mode of Payment",
            filters={"enabled": 1},
            fields=["name"],
            limit=1,
        )
        if first_mode:
            opening_doc.append(
                "balance_details",
                {"mode_of_payment": first_mode[0].name, "opening_amount": 0},
            )
    opening_doc.flags.ignore_permissions = True
    opening_doc.insert()
    
    # Ensure user has access
    frappe.share.add_docshare(
        "POS Opening Entry",
        opening_doc.name,
        frappe.session.user,
        read=1,
        write=1,
        share=0,
        notify=0,
    )
    frappe.db.commit()
    
    return {"name": opening_doc.name}


@frappe.whitelist()
def getAggregator():
    branchName = getBranch()
    aggregatorList = frappe.get_all(
        "Aggregator Settings",
        fields=["customer"],
        filters={"parent": branchName, "parenttype": "Branch"},
    )
    return aggregatorList


@frappe.whitelist()
def getAggregatorItem(aggregator):
    branchName = getBranch()
    aggregatorItem = []
    aggregatorItemList = []
    priceList = frappe.db.get_value(
        "Aggregator Settings",
        {"customer": aggregator, "parent": branchName, "parenttype": "Branch"},
        "price_list",
    )
    aggregatorItem = frappe.get_all(
        "Item Price",
        fields=["item_code", "item_name", "price_list_rate"],
        filters={"selling": 1, "price_list": priceList},
    )
    aggregatorItemList = [
        {
            "item": item.item_code,
            "item_name": item.item_name,
            "rate": item.price_list_rate,
            "item_image": frappe.db.get_value("Item", item.item, "image"),
        }
        for item in aggregatorItem
        if not frappe.db.get_value("Item", item.item_code, "disabled")
    ]
    return aggregatorItemList

@frappe.whitelist()
def getAggregatorMOP(aggregator):
    branchName = getBranch()
    
    modeOfPayment = frappe.db.get_value(
        "Aggregator Settings",
        {"customer": aggregator, "parent": branchName, "parenttype": "Branch"},
        "mode_of_payments",
    )
    modeOfPaymentsList = []
    modeOfPaymentsList.append(
            {"mode_of_payment": modeOfPayment, "opening_amount": float(0)}
    )
    return modeOfPaymentsList


@frappe.whitelist()
def validate_pos_close(pos_profile):
    enable_unclosed_pos_check = frappe.db.get_value("POS Profile", pos_profile, "custom_daily_pos_close")

    if enable_unclosed_pos_check:
        current_datetime = frappe.utils.now_datetime()
        start_of_day = current_datetime.replace(hour=5, minute=0, second=0, microsecond=0)

        if current_datetime > start_of_day:
            previous_day = start_of_day - timedelta(days=1)
        else:
            previous_day = start_of_day

        unclosed_pos_opening = frappe.db.exists(
            "POS Opening Entry",
            {
                "posting_date": previous_day.date(),
                "status": "Open",
                "pos_profile": pos_profile,
                "docstatus": 1,
            },
        )

        # Relaxed: do not block when a previous day's session is still open (busy restaurant, people forget to close).
        # Return Success so the POS can be used; the session can be closed later from Close POS or Desk.
        if unclosed_pos_opening:
            return "Success"

        return "Success"

    return "Success"


# --- Reports (for React POS) ---

@frappe.whitelist()
def get_pos_closing_entries_list(branch=None, from_date=None, to_date=None, limit=100):
	"""List of POS Closing Entries for the branch (daily closings overview). Key columns for admin quick view."""
	branch = branch or getBranch()
	if not branch:
		return []
	# POS Closing Entry has pos_profile; filter by pos_profiles for this branch
	profiles = frappe.get_all("POS Profile", filters={"branch": branch}, pluck="name")
	if not profiles:
		return []
	from_date = from_date or frappe.utils.add_days(frappe.utils.today(), -30)
	to_date = to_date or frappe.utils.today()
	limit = max(1, min(int(limit or 100), 200))
	placeholders = ", ".join(["%s"] * len(profiles))
	data = frappe.db.sql("""
		SELECT
			name,
			posting_date,
			posting_time,
			period_start_date,
			period_end_date,
			pos_profile,
			user,
			status,
			total_quantity,
			net_total,
			total_taxes_and_charges,
			grand_total
		FROM `tabPOS Closing Entry`
		WHERE pos_profile IN (""" + placeholders + """)
			AND docstatus = 1
			AND posting_date BETWEEN %s AND %s
		ORDER BY posting_date DESC, period_end_date DESC
		LIMIT %s
	""", [*profiles, from_date, to_date, limit], as_dict=True)
	for row in data:
		row["grand_total"] = flt(row.get("grand_total"))
		row["net_total"] = flt(row.get("net_total"))
		row["total_taxes_and_charges"] = flt(row.get("total_taxes_and_charges"))
		row["total_quantity"] = flt(row.get("total_quantity"))
	return data or []


@frappe.whitelist()
def get_pos_report_today_summary(branch=None):
    """Today's sales summary for the branch: total invoices, grand total, net total, taxes."""
    branch = branch or getBranch()
    data = frappe.db.sql("""
        SELECT
            COUNT(name) AS total_invoices,
            COALESCE(ROUND(SUM(net_total), 2), 0) AS net_total,
            COALESCE(ROUND(SUM(total_taxes_and_charges), 2), 0) AS taxes,
            COALESCE(ROUND(SUM(grand_total), 2), 0) AS grand_total
        FROM `tabPOS Invoice`
        WHERE branch = %s AND docstatus = 1 AND COALESCE(is_return, 0) = 0
        AND posting_date = CURDATE()
    """, (branch,), as_dict=True)
    return data[0] if data else {"total_invoices": 0, "net_total": 0, "taxes": 0, "grand_total": 0}


@frappe.whitelist()
def get_pos_report_daywise_sales(branch=None, from_date=None, to_date=None):
    """Daywise sales for date range. Returns list of {date, total_invoices, grand_total}."""
    branch = branch or getBranch()
    from_date = from_date or frappe.utils.add_days(frappe.utils.today(), -6)
    to_date = to_date or frappe.utils.today()
    data = frappe.db.sql("""
        SELECT
            posting_date AS date,
            COUNT(name) AS total_invoices,
            ROUND(SUM(grand_total), 2) AS grand_total
        FROM `tabPOS Invoice`
        WHERE branch = %s AND docstatus = 1 AND COALESCE(is_return, 0) = 0
        AND posting_date BETWEEN %s AND %s
        GROUP BY posting_date
        ORDER BY posting_date ASC
    """, (branch, from_date, to_date), as_dict=True)
    return data or []


@frappe.whitelist()
def get_pos_report_item_wise_sales(branch=None, from_date=None, to_date=None, limit=50, sort_by="both"):
    """Item-wise sales (qty, amount) for date range.
    sort_by: both (amount then qty), qty, sales
    """
    branch = branch or getBranch()
    from_date = from_date or frappe.utils.add_days(frappe.utils.today(), -6)
    to_date = to_date or frappe.utils.today()
    sort_key = (sort_by or "both").strip().lower()
    order_sql = "SUM(b.amount) DESC, SUM(b.qty) DESC" if sort_key == "both" else (
        "SUM(b.qty) DESC" if sort_key == "qty" else "SUM(b.amount) DESC"
    )
    data = frappe.db.sql("""
        SELECT
            b.item_code,
            b.item_name,
            SUM(b.qty) AS qty,
            ROUND(SUM(b.amount), 2) AS amount
        FROM `tabPOS Invoice` a
        INNER JOIN `tabPOS Invoice Item` b ON a.name = b.parent
        WHERE a.branch = %s AND a.docstatus = 1 AND COALESCE(a.is_return, 0) = 0
        AND a.posting_date BETWEEN %s AND %s
        GROUP BY b.item_code, b.item_name
        ORDER BY """ + order_sql + """
        LIMIT %s
    """, (branch, from_date, to_date, int(limit)), as_dict=True)
    return data or []


@frappe.whitelist()
def get_pos_report_time_wise_sales(branch=None, date=None):
    """Sales by 2-hour interval for a given date."""
    branch = branch or getBranch()
    date = date or frappe.utils.today()
    intervals = [
        ("12 AM - 02 AM", 1, "00:00:00", "01:59:59"),
        ("02 AM - 04 AM", 2, "02:00:00", "03:59:59"),
        ("04 AM - 06 AM", 3, "04:00:00", "05:59:59"),
        ("06 AM - 08 AM", 4, "06:00:00", "07:59:59"),
        ("08 AM - 10 AM", 5, "08:00:00", "09:59:59"),
        ("10 AM - 12 PM", 6, "10:00:00", "11:59:59"),
        ("12 PM - 02 PM", 7, "12:00:00", "13:59:59"),
        ("02 PM - 04 PM", 8, "14:00:00", "15:59:59"),
        ("04 PM - 06 PM", 9, "16:00:00", "17:59:59"),
        ("06 PM - 08 PM", 10, "18:00:00", "19:59:59"),
        ("08 PM - 10 PM", 11, "20:00:00", "21:59:59"),
        ("10 PM - 12 AM", 12, "22:00:00", "23:59:59"),
    ]
    result = []
    for label, order, t1, t2 in intervals:
        row = frappe.db.sql("""
            SELECT
                COALESCE(ROUND(SUM(grand_total), 2), 0) AS sales,
                COUNT(name) AS bills
            FROM `tabPOS Invoice`
            WHERE branch = %s AND docstatus = 1 AND COALESCE(is_return, 0) = 0
            AND posting_date = %s
            AND TIME(posting_time) BETWEEN %s AND %s
        """, (branch, date, t1, t2), as_dict=True)
        result.append({
            "time_interval": label,
            "order": order,
            "sales": flt(row[0].get("sales")) if row else 0,
            "bills": row[0].get("bills", 0) if row else 0,
        })
    return result


@frappe.whitelist()
def get_pos_report_low_stock(pos_profile=None):
    """Items in POS Profile warehouse with actual_qty below reorder level (or no reorder set)."""
    if not pos_profile or not frappe.db.exists("POS Profile", pos_profile):
        return []
    profile = frappe.get_doc("POS Profile", pos_profile)
    warehouse = profile.warehouse
    if not warehouse:
        return []
    # Items that have a reorder level set for this warehouse and are below it
    data = frappe.db.sql("""
        SELECT
            ir.parent AS item_code,
            ir.warehouse_reorder_level AS reorder_level,
            b.actual_qty,
            i.item_name
        FROM `tabItem Reorder` ir
        INNER JOIN `tabBin` b ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
        INNER JOIN `tabItem` i ON i.name = ir.parent
        WHERE ir.warehouse = %s AND b.actual_qty < ir.warehouse_reorder_level
        ORDER BY b.actual_qty ASC
    """, (warehouse,), as_dict=True)
    return [{"item_code": r.item_code, "item_name": r.item_name, "actual_qty": flt(r.actual_qty), "reorder_level": flt(r.reorder_level)} for r in data]


@frappe.whitelist()
def get_pos_report_payment_summary(branch=None, from_date=None, to_date=None):
    """Sales by mode of payment for date range (from POS Invoice payments child table)."""
    branch = branch or getBranch()
    from_date = from_date or frappe.utils.today()
    to_date = to_date or frappe.utils.today()
    data = frappe.db.sql("""
        SELECT
            p.mode_of_payment,
            COUNT(DISTINCT i.name) AS invoices,
            ROUND(SUM(p.amount), 2) AS amount
        FROM `tabPOS Invoice` i
        INNER JOIN `tabSales Invoice Payment` p ON p.parent = i.name AND p.parenttype = 'POS Invoice'
        WHERE i.branch = %s AND i.docstatus = 1 AND COALESCE(i.is_return, 0) = 0
        AND i.posting_date BETWEEN %s AND %s
        GROUP BY p.mode_of_payment
        ORDER BY amount DESC
    """, (branch, from_date, to_date), as_dict=True)
    return data or []


# --- Production vs sale variance (manufactured items) ---

@frappe.whitelist()
def get_production_sale_variance_report(branch=None, from_date=None, to_date=None, pos_profile=None):
    """For items with BOM: produced qty (Manufacture Stock Entry), sold qty (POS), current stock. Variance = produced - sold."""
    branch = branch or getBranch()
    from_date = from_date or frappe.utils.add_days(frappe.utils.today(), -6)
    to_date = to_date or frappe.utils.today()
    warehouse = None
    if pos_profile and frappe.db.exists("POS Profile", pos_profile):
        warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
    if not warehouse:
        warehouse = frappe.db.get_value("POS Profile", {"branch": branch, "disabled": 0}, "warehouse")

    # Manufactured items (have active default BOM)
    bom_items = frappe.db.sql("""
        SELECT DISTINCT b.item AS item_code, i.item_name
        FROM `tabBOM` b
        INNER JOIN `tabItem` i ON i.name = b.item
        WHERE b.docstatus = 1 AND b.is_active = 1 AND b.is_default = 1
        ORDER BY i.item_name
    """, as_dict=True)
    if not bom_items:
        return []

    result = []
    for row in bom_items:
        item_code = row.item_code
        # Produced: Stock Entry Manufacture, items received into our warehouse (t_warehouse)
        produced = 0
        if warehouse:
            produced_rows = frappe.db.sql("""
                SELECT SUM(sed.qty) AS qty
                FROM `tabStock Entry Detail` sed
                INNER JOIN `tabStock Entry` se ON se.name = sed.parent
                WHERE se.purpose = 'Manufacture' AND se.docstatus = 1
                AND se.posting_date BETWEEN %s AND %s
                AND sed.item_code = %s AND sed.t_warehouse = %s
            """, (from_date, to_date, item_code, warehouse), as_dict=True)
            if produced_rows and produced_rows[0].get("qty"):
                produced = flt(produced_rows[0].qty)
        # Sold: POS Invoice (branch, date range)
        sold_rows = frappe.db.sql("""
            SELECT COALESCE(SUM(pi_item.qty), 0) AS qty
            FROM `tabPOS Invoice Item` pi_item
            INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
            WHERE pi.branch = %s AND pi.docstatus = 1 AND pi.status IN ('Paid', 'Consolidated')
            AND pi.posting_date BETWEEN %s AND %s AND pi_item.item_code = %s
        """, (branch, from_date, to_date, item_code), as_dict=True)
        sold = flt(sold_rows[0].get("qty")) if sold_rows else 0
        # Current stock
        current_stock = 0
        if warehouse:
            current_stock = flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))
        variance = produced - sold
        result.append({
            "item_code": item_code,
            "item_name": row.item_name or item_code,
            "produced_qty": produced,
            "sold_qty": sold,
            "current_stock": current_stock,
            "variance": variance,
            "variance_pct": (variance / produced * 100) if produced else 0,
        })
    return result


# --- Wastage (Material Issue with reason) ---

WASTAGE_REASONS = [
    "Spoilage", "Breakage", "Theft", "Expired", "Damaged", "Sample", "Donation",
    "Employee Consumption", "Other",
]


@frappe.whitelist()
def get_wastage_reasons():
    """Return list of issue/wastage reason options for dropdown."""
    return [{"value": r, "label": r} for r in WASTAGE_REASONS]


@frappe.whitelist()
def create_wastage_entry(pos_profile, item_code, qty, reason):
    """Create a Material Issue Stock Entry for wastage and set custom_issue_reason."""
    if not pos_profile or not frappe.db.exists("POS Profile", pos_profile):
        frappe.throw(_("POS Profile required"))
    if not item_code or flt(qty) <= 0:
        frappe.throw(_("Item and quantity required"))
    reason = (reason or "").strip() or "Other"
    if reason not in WASTAGE_REASONS:
        reason = "Other"
    profile = frappe.get_doc("POS Profile", pos_profile)
    warehouse = profile.warehouse
    company = profile.company or frappe.defaults.get_global_default("company")
    if not warehouse or not company:
        frappe.throw(_("Warehouse and company must be set on POS Profile"))
    item_doc = frappe.get_cached_doc("Item", item_code)
    # Use only the wastage expense account set on POS Profile so Material Issue always hits one account
    expense_account = profile.get("custom_wastage_expense_account")
    if not expense_account:
        frappe.throw(
            _("Set Wastage / Material Issue Expense Account on POS Profile {0} (Accounts → POS Profile). This is the only expense account used when you record wastage.").format(frappe.bold(profile.name))
        )
    se = frappe.new_doc("Stock Entry")
    se.purpose = "Material Issue"
    if hasattr(se, "stock_entry_type"):
        if frappe.db.has_column("Stock Entry Type", "is_default"):
            stock_entry_type = (
                frappe.db.get_value("Stock Entry Type", {"purpose": "Material Issue", "is_default": 1}, "name")
                or frappe.db.get_value("Stock Entry Type", {"purpose": "Material Issue"}, "name")
                or (frappe.db.exists("Stock Entry Type", "Material Issue") and "Material Issue")
            )
        else:
            stock_entry_type = (
                frappe.db.get_value("Stock Entry Type", {"purpose": "Material Issue"}, "name")
                or (frappe.db.exists("Stock Entry Type", "Material Issue") and "Material Issue")
            )
        if stock_entry_type:
            se.stock_entry_type = stock_entry_type
        else:
            frappe.throw(
                _("No Stock Entry Type found for purpose 'Material Issue'. Create one in Stock Entry Type and set Purpose = Material Issue.")
            )
    se.company = company
    se.set_posting_time = 1
    se.posting_date = nowdate()
    if hasattr(se, "custom_issue_reason"):
        se.custom_issue_reason = reason
    wastage_qty = flt(qty, 3)
    bom_name = frappe.db.get_value(
        "BOM",
        {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1},
        "name",
    )
    if not bom_name:
        bom_name = frappe.db.get_value(
            "BOM",
            {"item": item_code, "is_active": 1, "docstatus": 1},
            "name",
            order_by="modified desc",
        )

    if bom_name:
        # For manufactured finished goods, issue BOM raw materials only (do not issue FG stock).
        bom_doc = frappe.get_doc("BOM", bom_name)
        bom_qty = flt(getattr(bom_doc, "quantity", 0)) or 1
        factor = wastage_qty / bom_qty
        if factor <= 0:
            frappe.throw(_("Quantity must be greater than zero."))
        for row in bom_doc.items:
            component_qty = flt(row.qty) * factor
            if component_qty <= 0:
                continue
            se.append("items", {
                "item_code": row.item_code,
                "item_name": row.item_name or row.item_code,
                "qty": flt(component_qty, 6),
                "s_warehouse": warehouse,
                "stock_uom": row.stock_uom or row.uom or frappe.db.get_value("Item", row.item_code, "stock_uom"),
                "expense_account": expense_account,
            })
        if not se.items:
            frappe.throw(_("Selected BOM has no valid component rows to issue."))
    else:
        # Non-manufactured/raw item: standard Material Issue for selected item.
        se.append("items", {
            "item_code": item_code,
            "item_name": item_doc.item_name,
            "qty": wastage_qty,
            "s_warehouse": warehouse,
            "stock_uom": item_doc.stock_uom or item_doc.uom,
            "expense_account": expense_account,
        })
    se.flags.ignore_permissions = True
    se.insert()
    se.submit()
    frappe.db.commit()
    return {"name": se.name, "message": _("Wastage recorded: {0}").format(se.name)}


@frappe.whitelist()
def get_wastage_by_reason_report(branch=None, from_date=None, to_date=None, reason=None):
    """Wastage (Material Issue) grouped by custom_issue_reason for reporting.
    Optional reason filter to see which issue type costs most."""
    from_date = from_date or frappe.utils.add_days(frappe.utils.today(), -30)
    to_date = to_date or frappe.utils.today()
    meta = frappe.get_meta("Stock Entry")
    if not meta.has_field("custom_issue_reason"):
        return {"by_item": [], "by_reason": [], "total_wastage_amount": 0}
    reason_cond = " AND se.custom_issue_reason = %(reason)s" if reason else ""
    params = {"from_date": from_date, "to_date": to_date}
    if reason:
        params["reason"] = reason
    data = frappe.db.sql("""
        SELECT
            se.custom_issue_reason AS reason,
            sed.item_code,
            sed.item_name,
            SUM(sed.qty) AS qty,
            ROUND(SUM(sed.amount), 2) AS amount
        FROM `tabStock Entry` se
        INNER JOIN `tabStock Entry Detail` sed ON sed.parent = se.name
        WHERE se.purpose = 'Material Issue' AND se.docstatus = 1
        AND se.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND COALESCE(se.custom_issue_reason, '') != ''
        """ + reason_cond + """
        GROUP BY se.custom_issue_reason, sed.item_code, sed.item_name
        ORDER BY se.custom_issue_reason, SUM(sed.qty) DESC
    """, params, as_dict=True)
    by_reason = frappe.db.sql("""
        SELECT
            se.custom_issue_reason AS reason,
            COUNT(DISTINCT se.name) AS entries,
            SUM(sed.qty) AS total_qty,
            ROUND(SUM(sed.amount), 2) AS total_amount
        FROM `tabStock Entry` se
        INNER JOIN `tabStock Entry Detail` sed ON sed.parent = se.name
        WHERE se.purpose = 'Material Issue' AND se.docstatus = 1
        AND se.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND COALESCE(se.custom_issue_reason, '') != ''
        """ + reason_cond + """
        GROUP BY se.custom_issue_reason
        ORDER BY total_amount DESC
    """, params, as_dict=True)
    total_wastage_amount = sum(flt(r.get("total_amount")) for r in (by_reason or []))
    return {
        "by_item": data or [],
        "by_reason": by_reason or [],
        "total_wastage_amount": total_wastage_amount,
        "from_date": str(from_date),
        "to_date": str(to_date),
    }


# --- Staff performance report ---

@frappe.whitelist()
def get_pos_report_sales_by_staff(branch=None, from_date=None, to_date=None):
    """Sales grouped by waiter/cashier for the period."""
    branch = branch or getBranch()
    from_date = from_date or frappe.utils.today()
    to_date = to_date or frappe.utils.today()
    data = frappe.db.sql("""
        SELECT
            COALESCE(waiter, cashier, 'Unknown') AS staff_name,
            COUNT(name) AS total_invoices,
            ROUND(SUM(grand_total), 2) AS total_amount
        FROM `tabPOS Invoice`
        WHERE branch = %s AND docstatus = 1 AND COALESCE(is_return, 0) = 0
        AND posting_date BETWEEN %s AND %s
        GROUP BY COALESCE(waiter, cashier, 'Unknown')
        ORDER BY total_amount DESC
    """, (branch, from_date, to_date), as_dict=True)
    return data or []


# --- Table turn / occupancy report ---

@frappe.whitelist()
def get_pos_report_table_occupancy(branch=None, from_date=None, to_date=None):
    """Table occupancy: bills per table, approximate duration (posting to modified) for paid invoices."""
    branch = branch or getBranch()
    from_date = from_date or frappe.utils.today()
    to_date = to_date or frappe.utils.today()
    data = frappe.db.sql("""
        SELECT
            i.restaurant_table AS table_name,
            t.restaurant_room AS room_name,
            COUNT(i.name) AS num_bills,
            ROUND(SUM(TIMESTAMPDIFF(MINUTE, CONCAT(i.posting_date, ' ', IFNULL(i.posting_time, '00:00:00')), i.modified)), 0) AS total_minutes
        FROM `tabPOS Invoice` i
        LEFT JOIN `tabURY Table` t ON t.name = i.restaurant_table AND t.branch = %s
        WHERE i.branch = %s AND i.docstatus = 1 AND COALESCE(i.is_return, 0) = 0
        AND i.posting_date BETWEEN %s AND %s AND i.restaurant_table IS NOT NULL AND i.restaurant_table != ''
        GROUP BY i.restaurant_table, t.restaurant_room
        ORDER BY num_bills DESC
    """, (branch, branch, from_date, to_date), as_dict=True)
    result = []
    for r in data:
        avg_mins = round(flt(r.total_minutes) / (r.num_bills or 1), 0)
        result.append({
            "table_name": r.table_name,
            "room_name": r.room_name or "",
            "num_bills": r.num_bills,
            "total_minutes": flt(r.total_minutes),
            "avg_minutes": avg_mins,
        })
    return result


# --- POS Return (refund) ---

@frappe.whitelist()
def create_pos_return(invoice_name):
    """Create a POS Invoice (Return) against the given submitted POS Invoice."""
    if not invoice_name:
        frappe.throw(_("Invoice is required."))

    row = frappe.db.get_value(
        "POS Invoice",
        invoice_name,
        ["name", "docstatus", "is_return", "status"],
        as_dict=True,
    )
    if not row:
        frappe.throw(_("POS Invoice {0} not found. Refresh Orders and try again.").format(invoice_name))
    if cint(row.docstatus) != 1:
        frappe.throw(
            _("Only submitted invoices can be returned. Current state is {0}.").format(
                row.get("status") or _("Draft/Cancelled")
            )
        )
    if cint(row.is_return):
        frappe.throw(_("Invoice is already a return."))

    from erpnext.accounts.doctype.pos_invoice.pos_invoice import make_sales_return
    try:
        return_doc = make_sales_return(invoice_name)
    except DoesNotExistError:
        frappe.throw(
            _(
                "POS Invoice {0} is no longer available for return. "
                "Please refresh Orders and try again."
            ).format(invoice_name)
        )
    return_doc.flags.ignore_permissions = True
    return_doc.insert()
    return_doc.submit()
    # Real-time accounting consistency: returns are consolidated immediately too.
    from ury.ury.doctype.ury_order.ury_order import _auto_consolidate_pos_invoice
    _auto_consolidate_pos_invoice(return_doc.name)
    frappe.db.commit()
    return {"name": return_doc.name, "message": _("Return {0} created.").format(return_doc.name)}


