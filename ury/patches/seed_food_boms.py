# Copyright (c) 2025. Seed sample BOMs for food products.
# BOM raw materials are deducted upon manufacture (Work Order / Stock Entry), not on sale.

from __future__ import unicode_literals

import frappe


def execute():
    """Entry point for Frappe patch handler. Creates raw material Items and sample BOMs."""
    run()


def run():
    """Create raw material Items and sample BOMs for existing food menu items."""
    site = frappe.local.site
    print("Seeding food BOMs on site: {}".format(site))

    company = _default_company()
    if not company:
        print("No Company found. Skipping BOM seed.")
        return

    item_group = _item_group()
    _ensure_uom("Nos")
    _ensure_uom("Kg")
    # Allow fractional Nos (e.g. 0.25 lemon per serving) so BOM validation passes
    _allow_fractional_uom("Nos")

    raw_items = [
        ("Burger-Bun", "Burger Bun", "Nos"),
        ("Chicken-Raw", "Chicken (raw)", "Kg"),
        ("Beef-Raw", "Beef (raw)", "Kg"),
        ("Potato", "Potato", "Kg"),
        ("Rice", "Rice", "Kg"),
        ("Fish-Fillet", "Fish Fillet", "Kg"),
        ("Lettuce", "Lettuce", "Kg"),
        ("Tomato", "Tomato", "Kg"),
        ("Cooking-Oil", "Cooking Oil", "Kg"),
        ("Cheese", "Cheese", "Kg"),
        ("Pizza-Dough", "Pizza Dough", "Kg"),
        ("Tomato-Sauce", "Tomato Sauce", "Kg"),
        ("Cucumber", "Cucumber", "Kg"),
        ("Onion", "Onion", "Kg"),
        ("Salad-Dressing", "Salad Dressing", "Kg"),
        ("Salt", "Salt", "Kg"),
        ("Lemon", "Lemon", "Nos"),
        ("Basil", "Basil", "Kg"),
    ]
    for item_code, item_name, uom in raw_items:
        _create_item_if_missing(item_code, item_name, item_group, uom)

    frappe.db.commit()

    bom_specs = [
        ("Chicken-Burger", [("Burger-Bun", 1), ("Chicken-Raw", 0.15), ("Lettuce", 0.02), ("Tomato", 0.01), ("Cooking-Oil", 0.005)]),
        ("Beef-Burger", [("Burger-Bun", 1), ("Beef-Raw", 0.15), ("Lettuce", 0.02), ("Tomato", 0.01), ("Cooking-Oil", 0.005)]),
        ("French-Fries", [("Potato", 0.2), ("Cooking-Oil", 0.02), ("Salt", 0.005)]),
        ("Rice-and-Chicken", [("Rice", 0.25), ("Chicken-Raw", 0.15), ("Cooking-Oil", 0.01)]),
        ("Rice-and-Beef", [("Rice", 0.25), ("Beef-Raw", 0.15), ("Cooking-Oil", 0.01)]),
        ("Grilled-Fish", [("Fish-Fillet", 0.2), ("Cooking-Oil", 0.01), ("Lemon", 0.25)]),
        ("Vegetable-Salad", [("Lettuce", 0.05), ("Tomato", 0.03), ("Cucumber", 0.02), ("Onion", 0.01), ("Salad-Dressing", 0.02)]),
        ("Pizza-Margherita", [("Pizza-Dough", 0.2), ("Cheese", 0.05), ("Tomato-Sauce", 0.03), ("Tomato", 0.02), ("Basil", 0.005)]),
    ]

    for fg_code, ingredients in bom_specs:
        if not frappe.db.exists("Item", fg_code):
            print("  Skipping BOM for {}: Item not found.".format(fg_code))
            continue
        bom_name = "BOM-{}".format(fg_code)
        if frappe.db.exists("BOM", bom_name):
            docstatus = frappe.db.get_value("BOM", bom_name, "docstatus")
            if docstatus == 1:
                print("  BOM {} already exists, skip.".format(bom_name))
                continue
            # Draft BOM left from a previous failed run: submit it
            doc = frappe.get_doc("BOM", bom_name)
            doc.submit()
            print("  Submitted existing draft BOM: {}.".format(bom_name))
            continue
        _create_bom(bom_name, fg_code, company, ingredients)
        print("  Created BOM: {} for {}".format(bom_name, fg_code))

    frappe.db.commit()
    print("Done. BOM raw materials are deducted upon manufacture only.")


def _default_company():
    company = frappe.defaults.get_global_default("company")
    if company:
        return company
    companies = frappe.get_all("Company", fields=["name"], limit=1)
    return companies[0]["name"] if companies else None


def _item_group():
    for name in ("Products", "All Item Groups"):
        if frappe.db.exists("Item Group", name):
            return name
    groups = frappe.get_all("Item Group", fields=["name"], limit=1, order_by="lft asc")
    return groups[0]["name"] if groups else "All Item Groups"


def _ensure_uom(uom):
    if not frappe.db.exists("UOM", uom):
        doc = frappe.get_doc({"doctype": "UOM", "uom_name": uom})
        doc.insert(ignore_permissions=True)
        frappe.db.commit()


def _allow_fractional_uom(uom):
    """Set must_be_whole_number=0 so BOM items can use fractional qty (e.g. 0.25 lemon)."""
    if not frappe.db.exists("UOM", uom):
        return
    if frappe.db.get_value("UOM", uom, "must_be_whole_number"):
        frappe.db.set_value("UOM", uom, "must_be_whole_number", 0)
        frappe.db.commit()


def _create_item_if_missing(item_code, item_name, item_group, uom):
    if frappe.db.exists("Item", item_code):
        return
    doc = frappe.get_doc({
        "doctype": "Item",
        "item_code": item_code,
        "item_name": item_name,
        "item_group": item_group,
        "stock_uom": uom,
        "is_stock_item": 1,
    })
    doc.insert(ignore_permissions=True)


def _create_bom(bom_name, finished_item_code, company, ingredients):
    doc = frappe.get_doc({
        "doctype": "BOM",
        "name": bom_name,
        "item": finished_item_code,
        "quantity": 1,
        "company": company,
        "is_active": 1,
        "is_default": 1,
    })
    for item_code, qty in ingredients:
        if not frappe.db.exists("Item", item_code):
            continue
        doc.append("items", {"item_code": item_code, "qty": qty})
    if not doc.items:
        return
    doc.insert(ignore_permissions=True)
    doc.submit()
