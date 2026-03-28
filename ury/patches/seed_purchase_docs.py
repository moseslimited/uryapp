# Copyright (c) 2025. Seed sample Purchase Receipts and Purchase Invoices for raw materials.
# Buys 200 units (or 200 Kg) of each raw material with sample rates.

from __future__ import unicode_literals

import frappe
from frappe.utils import today


# Raw material item_code -> (rate per UOM,). Matches raw items from seed_food_boms.
RAW_ITEMS_WITH_RATES = [
    ("Burger-Bun", 500),
    ("Chicken-Raw", 12000),
    ("Beef-Raw", 15000),
    ("Potato", 2000),
    ("Rice", 3500),
    ("Fish-Fillet", 18000),
    ("Lettuce", 3000),
    ("Tomato", 2500),
    ("Cooking-Oil", 6000),
    ("Cheese", 14000),
    ("Pizza-Dough", 5000),
    ("Tomato-Sauce", 4000),
    ("Cucumber", 2000),
    ("Onion", 1500),
    ("Salad-Dressing", 8000),
    ("Salt", 1500),
    ("Lemon", 500),
    ("Basil", 10000),
]

PURCHASE_QTY = 200
SUPPLIER_NAME = "Sample Raw Materials Supplier"


def execute():
    """Entry point for Frappe patch handler."""
    run()


def run():
    """Create one Purchase Receipt and one Purchase Invoice (against it) for 200 of each raw material."""
    site = frappe.local.site
    print("Seeding purchase docs (PR + PI) on site: {}".format(site))

    if frappe.db.exists("Purchase Receipt", {"supplier": SUPPLIER_NAME, "docstatus": 1}):
        print("  Sample Purchase Receipt from {} already exists. Skip.".format(SUPPLIER_NAME))
        return

    company = _default_company()
    if not company:
        print("No Company found. Skipping purchase docs seed.")
        return

    # Use POS Profile warehouse so Items tab shows the same stock; else default warehouse
    warehouse = _pos_profile_warehouse(company) or _default_warehouse(company)
    if not warehouse:
        print("No Warehouse found. Skipping purchase docs seed.")
        return

    supplier = _ensure_supplier(company)
    if not supplier:
        print("Could not create or find Supplier. Skipping purchase docs seed.")
        return

    cost_center = frappe.get_cached_value("Company", company, "cost_center")
    if not cost_center:
        cost_center = frappe.db.get_value(
            "Cost Center", {"company": company, "is_group": 0}, "name"
        )
    if not cost_center:
        print("No Cost Center found. Skipping purchase docs seed.")
        return

    # Build list of (item_code, qty, rate) for items that exist
    items_to_buy = []
    for item_code, rate in RAW_ITEMS_WITH_RATES:
        if not frappe.db.exists("Item", item_code):
            print("  Skipping {}: Item not found.".format(item_code))
            continue
        items_to_buy.append((item_code, PURCHASE_QTY, rate))

    if not items_to_buy:
        print("No raw items found. Run seed_food_boms first.")
        return

    # Create Purchase Receipt
    pr = frappe.new_doc("Purchase Receipt")
    pr.company = company
    pr.supplier = supplier
    pr.set_warehouse = warehouse
    pr.posting_date = today()
    pr.currency = frappe.get_cached_value("Company", company, "default_currency") or "USD"

    for item_code, qty, rate in items_to_buy:
        item_doc = frappe.get_cached_doc("Item", item_code)
        uom = item_doc.stock_uom
        pr.append(
            "items",
            {
                "item_code": item_code,
                "qty": qty,
                "received_qty": qty,
                "rate": rate,
                "warehouse": warehouse,
                "stock_uom": uom,
                "uom": uom,
                "conversion_factor": 1.0,
                "stock_qty": qty,
                "cost_center": cost_center,
            },
        )

    pr.flags.ignore_permissions = True
    pr.insert()
    pr.submit()
    print("  Created and submitted Purchase Receipt: {}".format(pr.name))
    frappe.db.commit()

    # Create Purchase Invoice from Purchase Receipt
    from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

    pi_doc = make_purchase_invoice(pr.name)
    pi_doc.flags.ignore_permissions = True
    pi_doc.insert()
    pi_doc.submit()
    print("  Created and submitted Purchase Invoice: {} (against PR {})".format(pi_doc.name, pr.name))
    frappe.db.commit()

    print("Done. Stock and books updated for 200 units of each raw material.")


def _default_company():
    company = frappe.defaults.get_global_default("company")
    if company:
        return company
    companies = frappe.get_all("Company", fields=["name"], limit=1)
    return companies[0]["name"] if companies else None


def _pos_profile_warehouse(company):
    """Warehouse from first POS Profile so Items tab and PR use the same warehouse."""
    wh = frappe.db.get_value(
        "POS Profile",
        {"company": company, "disabled": 0},
        "warehouse",
    )
    if wh and frappe.db.exists("Warehouse", wh):
        return wh
    return None


def _default_warehouse(company):
    # Prefer Stores - {company}
    name = "Stores - " + company
    if frappe.db.exists("Warehouse", name):
        return name
    # Any non-group warehouse for company
    wh = frappe.db.get_value(
        "Warehouse",
        {"company": company, "is_group": 0},
        "name",
    )
    return wh


def _ensure_supplier(company):
    """Create Sample Raw Materials Supplier if not exists. Return supplier name."""
    if frappe.db.exists("Supplier", SUPPLIER_NAME):
        return SUPPLIER_NAME
    # Ensure a supplier group exists
    for group in ("Raw Material", "All Supplier Groups", "Local", "Services"):
        if frappe.db.exists("Supplier Group", group):
            supplier_group = group
            break
    else:
        sg = frappe.get_doc(
            {"doctype": "Supplier Group", "supplier_group_name": "Raw Material"}
        )
        sg.insert(ignore_permissions=True)
        frappe.db.commit()
        supplier_group = "Raw Material"

    doc = frappe.get_doc(
        {
            "doctype": "Supplier",
            "supplier_name": SUPPLIER_NAME,
            "supplier_group": supplier_group,
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name
