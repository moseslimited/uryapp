# Copyright (c) 2025. Seed script: add more tables, food items, and a Food menu.
# Run once with: bench --site amadeus_restaurant_pos execute ury.patches.seed_tables_and_food_menu.run
# Or in bench console: import ury.patches.seed_tables_and_food_menu as m; m.run()

from __future__ import unicode_literals

import frappe


def run():
    """Add more URY Tables, sample food Items, and a Food URY Menu."""
    site = frappe.local.site
    print("Seeding data on site: {}".format(site))

    # 1) Get branch, restaurant, room from existing URY Table (e.g. Amadeus Table One)
    existing_table = frappe.db.get_value(
        "URY Table",
        {"name": ["like", "%Amadeus%"]},
        ["name", "branch", "restaurant", "restaurant_room"],
        as_dict=True,
    )
    if not existing_table:
        # Fallback: get any URY Table
        existing_table = frappe.db.get_value(
            "URY Table",
            None,
            ["name", "branch", "restaurant", "restaurant_room"],
            as_dict=True,
            order_by="creation desc",
        )
    if not existing_table:
        print("No URY Table found. Create at least one table (e.g. Amadeus Table One) first.")
        return

    branch = existing_table["branch"]
    restaurant = existing_table["restaurant"]
    room = existing_table["restaurant_room"]
    print("Using branch={}, restaurant={}, room={}".format(branch, restaurant, room))

    # 2) Add more URY Tables in the same room
    table_names = ["Amadeus Table Two", "Amadeus Table Three", "Amadeus Table Four", "Amadeus Table Five"]
    for name in table_names:
        if frappe.db.exists("URY Table", name):
            print("  Table '{}' already exists, skip.".format(name))
            continue
        doc = frappe.get_doc({
            "doctype": "URY Table",
            "name": name,
            "restaurant": restaurant,
            "restaurant_room": room,
            "branch": branch,
            "minimum_seating": 1,
            "no_of_seats": 4,
            "table_shape": "Rectangle",
            "is_take_away": 0,
        })
        doc.insert(ignore_permissions=True)
        print("  Created URY Table: {}".format(name))
    frappe.db.commit()

    # 3) Get branch for menu (use same as existing Drinks menu if exists)
    menu_branch = branch
    drinks_menu = frappe.db.get_value("URY Menu", "Drinks", "branch")
    if drinks_menu:
        menu_branch = drinks_menu

    # 4) Ensure Item Group exists (use "Products" as in your screenshot)
    item_group = "Products"
    if not frappe.db.exists("Item Group", item_group):
        ig_list = frappe.get_all("Item Group", fields=["name"], limit_page_length=1, order_by="lft asc")
        item_group = ig_list[0]["name"] if ig_list else "All Item Groups"
    uom = "Nos"
    if not frappe.db.exists("UOM", uom):
        uom = frappe.db.get_single_value("Stock Settings", "stock_uom") or "Nos"

    # 5) Create sample food Items if they don't exist
    food_items = [
        ("Chicken Burger", 12000),
        ("Beef Burger", 15000),
        ("French Fries", 5000),
        ("Rice & Chicken", 14000),
        ("Rice & Beef", 16000),
        ("Grilled Fish", 18000),
        ("Vegetable Salad", 8000),
        ("Pizza Margherita", 22000),
    ]
    created_items = []
    for item_name, rate in food_items:
        item_code = item_name.replace(" ", "-").replace("&", "and")
        if frappe.db.exists("Item", item_code):
            print("  Item '{}' already exists, skip.".format(item_code))
            created_items.append((item_code, item_name, rate))
            continue
        item = frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "item_group": item_group,
            "stock_uom": uom,
            "is_stock_item": 0,
        })
        item.insert(ignore_permissions=True)
        created_items.append((item_code, item_name, rate))
        print("  Created Item: {} ({})".format(item_code, item_name))
    frappe.db.commit()

    # 6) Create Food URY Menu with the new items
    if frappe.db.exists("URY Menu", "Food"):
        print("URY Menu 'Food' already exists. You can add more items to it from the Food form.")
        return
    menu = frappe.get_doc({
        "doctype": "URY Menu",
        "name": "Food",
        "branch": menu_branch,
        "enabled": 1,
    })
    for item_code, item_name, rate in created_items:
        menu.append("items", {
            "item": item_code,
            "item_name": item_name,
            "rate": rate,
        })
    menu.insert(ignore_permissions=True)
    frappe.db.commit()
    print("Created URY Menu 'Food' with {} items. Price list is auto-created on save.".format(len(created_items)))

    print("Done. You can add more items/tables from the Desk: Item list, URY Table list, URY Menu (Food / Drinks).")
