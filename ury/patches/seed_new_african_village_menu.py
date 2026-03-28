# Copyright (c) 2025. Seed script: add "New African Village Menu" under New African Village branch.
# Run on server: cd /home/moses/restaurant_erp && bench --site new_african_village execute ury.patches.seed_new_african_village_menu.run
# Or in bench console: import ury.patches.seed_new_african_village_menu as m; m.run()

from __future__ import unicode_literals

import frappe


def execute():
    """Entry point for Frappe patch / bench execute. Creates New African Village branch, menu and items."""
    run()

BRANCH_NAME = "New African Village"
MENU_NAME = "New African Village Menu"

# (item_code, item_name, rate, course)
# Duplicate "Smirnoff Vodka Small" 18000 -> use item_code "Smirnoff Vodka Small 18K"
MENU_ITEMS = [
    ("Rock Boom", "Rock Boom", 2500, "Drinks"),
    ("Predator", "Predator", 2500, "Drinks"),
    ("Power Play", "Power Play", 2500, "Drinks"),
    ("Sting", "Sting", 2500, "Drinks"),
    ("Red Bull", "Red Bull", 10000, "Drinks"),
    ("Coffee Malt", "Coffee Malt", 2500, "Drinks"),
    ("Coffee Spirit", "Coffee Spirit", 2500, "Drinks"),
    ("Torero", "Torero", 3500, "Drinks"),
    ("Canned Beer", "Canned Beer", 10000, "Drinks"),
    ("Captain Morgan Small", "Captain Morgan Small", 12000, "Drinks"),
    ("Captain Morgan Big", "Captain Morgan Big", 40000, "Drinks"),
    ("Smirnoff Vodka Small", "Smirnoff Vodka Small", 13000, "Drinks"),
    ("Smirnoff Vodka Small 18K", "Smirnoff Vodka Small", 18000, "Drinks"),
    ("Smirnoff Vodka Big", "Smirnoff Vodka Big", 40000, "Drinks"),
    ("Bond 7 Small", "Bond 7 Small", 7000, "Drinks"),
    ("Bond 7 Medium", "Bond 7 Medium", 12000, "Drinks"),
    ("Bond 7 Big", "Bond 7 Big", 40000, "Drinks"),
    ("Gilbeys Small", "Gilbeys Small", 12000, "Drinks"),
    ("Gilbeys Medium", "Gilbeys Medium", 15000, "Drinks"),
    ("Gilbeys Big", "Gilbeys Big", 40000, "Drinks"),
    ("V & A Small", "V & A Small", 12000, "Drinks"),
    ("V & A Big", "V & A Big", 40000, "Drinks"),
    ("UG Pet", "UG Pet", 7000, "Drinks"),
    ("UG Small", "UG Small", 12000, "Drinks"),
    ("UG Medium", "UG Medium", 15000, "Drinks"),
    ("UG Big", "UG Big", 40000, "Drinks"),
    ("Club", "Club", 4500, "Drinks"),
    ("Nile", "Nile", 4500, "Drinks"),
    ("Bell", "Bell", 4500, "Drinks"),
    ("Guiness Stout", "Guiness Stout", 4500, "Drinks"),
    ("Guiness Smooth", "Guiness Smooth", 4500, "Drinks"),
    ("Tusker Malt", "Tusker Malt", 4500, "Drinks"),
    ("Tusker Cider", "Tusker Cider", 7000, "Drinks"),
    ("Tusker Lager", "Tusker Lager", 5000, "Drinks"),
    ("Eagle", "Eagle", 3000, "Drinks"),
    ("Pilsner", "Pilsner", 3000, "Drinks"),
    ("Castle Lite", "Castle Lite", 4500, "Drinks"),
    ("Tusker Lite", "Tusker Lite", 4500, "Drinks"),
    ("Smirnoff Black & Red", "Smirnoff Black & Red", 5000, "Drinks"),
    ("Fanta", "Fanta", 2000, "Drinks"),
    ("Coke", "Coke", 2000, "Drinks"),
    ("Stoney", "Stoney", 2000, "Drinks"),
    ("Novida", "Novida", 2000, "Drinks"),
    ("Krest", "Krest", 2000, "Drinks"),
    ("Sprite", "Sprite", 2000, "Drinks"),
    ("Pepsi", "Pepsi", 2000, "Drinks"),
    ("Mirinda Orange", "Mirinda Orange", 2000, "Drinks"),
    ("Mirinda Fruity", "Mirinda Fruity", 2000, "Drinks"),
    ("Mirinda Apple", "Mirinda Apple", 2000, "Drinks"),
    ("Mountain Dew", "Mountain Dew", 2000, "Drinks"),
    ("Evervess", "Evervess", 2000, "Drinks"),
    ("Rwenzori Water Small", "Rwenzori Water Small", 2000, "Drinks"),
    ("Rwenzori Water Big", "Rwenzori Water Big", 3000, "Drinks"),
    ("Nivana Water Small", "Nivana Water Small", 1500, "Drinks"),
    ("Nivana Water Big", "Nivana Water Big", 2500, "Drinks"),
    ("Minute Maid Small", "Minute Maid Small", 3000, "Drinks"),
    ("Minute Maid Big", "Minute Maid Big", 6000, "Drinks"),
    ("Oner", "Oner", 3000, "Drinks"),
    ("Goats Meat", "Goats Meat", 15000, "Dishes"),
    ("Katogo", "Katogo", 5000, "Dishes"),
    ("Fried Chicken", "Fried Chicken", 10000, "Dishes"),
    ("Fried Fish", "Fried Fish", 30000, "Dishes"),
    ("Liver", "Liver", 10000, "Dishes"),
    ("Chapati", "Chapati", 1000, "Snacks"),
    ("Half Cakes", "Half Cakes", 500, "Snacks"),
    ("Roasted Chicken", "Roasted Chicken", 10000, "Dishes"),
    ("Roasted Goat", "Roasted Goat", 5000, "Dishes"),
    ("Beef Kikomando", "Beef Kikomando", 5000, "Dishes"),
    ("Beans Kikomando", "Beans Kikomando", 3000, "Dishes"),
    ("Chicken & Chips", "Chicken & Chips", 15000, "Dishes"),
    ("Fish & Chips", "Fish & Chips", 35000, "Dishes"),
    ("Liver & Chips", "Liver & Chips", 15000, "Dishes"),
]


def run():
    """Create Branch, URY Menu Course, Items, and URY Menu for New African Village."""
    site = frappe.local.site
    print("Seeding New African Village Menu on site: {}".format(site))

    # 1) Get or create Branch (Branch has mandatory child table "user" -> URY User)
    if not frappe.db.exists("Branch", BRANCH_NAME):
        branch_user = frappe.db.get_value("User", {"name": "Administrator"}, "name")
        if not branch_user:
            users = frappe.get_all("User", filters={"enabled": 1}, limit_page_length=1, pluck="name")
            branch_user = users[0] if users else None
        if not branch_user:
            frappe.throw("No User found on site. Create a User first.")
        branch_doc = frappe.get_doc({"doctype": "Branch", "branch": BRANCH_NAME})
        branch_doc.append("user", {"user": branch_user})
        branch_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print("Created Branch: {}".format(BRANCH_NAME))
    else:
        print("Branch '{}' already exists.".format(BRANCH_NAME))

    # 2) Ensure URY Menu Course: Drinks, Dishes, Snacks
    for course_name in ("Drinks", "Dishes", "Snacks"):
        if not frappe.db.exists("URY Menu Course", course_name):
            frappe.get_doc({"doctype": "URY Menu Course", "course": course_name}).insert(
                ignore_permissions=True
            )
            print("Created URY Menu Course: {}".format(course_name))
    frappe.db.commit()

    # 3) Item group and UOM
    item_group = "Products"
    if not frappe.db.exists("Item Group", item_group):
        ig_list = frappe.get_all("Item Group", fields=["name"], limit_page_length=1, order_by="lft asc")
        item_group = ig_list[0]["name"] if ig_list else "All Item Groups"
    uom = "Nos"
    if not frappe.db.exists("UOM", uom):
        uom = frappe.db.get_single_value("Stock Settings", "stock_uom") or "Nos"

    # 4) Create Items if they don't exist
    for item_code, item_name, rate, course in MENU_ITEMS:
        if frappe.db.exists("Item", item_code):
            continue
        frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "item_group": item_group,
            "stock_uom": uom,
            "is_stock_item": 0,
        }).insert(ignore_permissions=True)
        print("  Created Item: {} ({})".format(item_code, item_name))
    frappe.db.commit()

    # 5) Create or update URY Menu "New African Village Menu"
    menu_exists = frappe.db.exists("URY Menu", MENU_NAME)
    if menu_exists:
        menu = frappe.get_doc("URY Menu", MENU_NAME)
        menu.items = []
    else:
        menu = frappe.get_doc({
            "doctype": "URY Menu",
            "name": MENU_NAME,
            "branch": BRANCH_NAME,
            "enabled": 1,
        })

    for item_code, item_name, rate, course in MENU_ITEMS:
        menu.append("items", {
            "item": item_code,
            "item_name": item_name,
            "rate": rate,
            "special_dish": 0,
            "disabled": 0,
            "course": course,
        })

    if menu_exists:
        menu.save(ignore_permissions=True)
        print("Updated URY Menu '{}' with {} items.".format(MENU_NAME, len(MENU_ITEMS)))
    else:
        menu.insert(ignore_permissions=True)
        print("Created URY Menu '{}' with {} items.".format(MENU_NAME, len(MENU_ITEMS)))
    frappe.db.commit()

    # 6) Optionally set as active menu for URY Restaurant (if one exists for this branch)
    restaurant = frappe.db.get_value("URY Restaurant", {"branch": BRANCH_NAME}, "name")
    if restaurant:
        frappe.db.set_value("URY Restaurant", restaurant, "active_menu", MENU_NAME)
        frappe.db.commit()
        print("Set '{}' as Default Menu for URY Restaurant '{}'.".format(MENU_NAME, restaurant))
    else:
        print("No URY Restaurant found for branch '{}'. Create one and set Default Menu to '{}'.".format(BRANCH_NAME, MENU_NAME))

    print("Done. New African Village Menu is ready.")
