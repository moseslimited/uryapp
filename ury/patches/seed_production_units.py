# Copyright (c) 2026, URY and contributors
# See license.txt
"""
Creates default Production Units 'Kitchen' and 'Bar' linked to the first POS Profile,
and Item Groups 'Kitchen' and 'Bar' if they do not exist.
Run once via: bench --site <site> execute ury.patches.seed_production_units.execute
Or patches run automatically when listed in patches.txt.
"""

import frappe


def execute():
    # Need at least one POS Profile
    pos_profiles = frappe.get_all(
        "POS Profile",
        fields=["name", "branch", "warehouse"],
        limit=1,
    )
    if not pos_profiles:
        frappe.log_error("seed_production_units: No POS Profile found. Create a POS Profile first.", "URY Seed")
        return

    pos_profile = pos_profiles[0].name
    parent_group = "All Item Groups"
    if not frappe.db.exists("Item Group", parent_group):
        parent_group = None

    for label, production_name in [("Kitchen", "Kitchen"), ("Bar", "Bar")]:
        # Create Item Group if missing (so items can be assigned to Kitchen or Bar)
        if not frappe.db.exists("Item Group", production_name):
            ig = frappe.new_doc("Item Group")
            ig.item_group_name = production_name
            if parent_group:
                ig.parent_item_group = parent_group
            ig.flags.ignore_permissions = True
            ig.insert(ignore_mandatory=True)
            frappe.db.commit()

        # Create Production Unit if missing
        if frappe.db.exists("URY Production Unit", production_name):
            continue
        doc = frappe.new_doc("URY Production Unit")
        doc.production = production_name
        doc.pos_profile = pos_profile
        doc.append("item_groups", {"item_group": production_name})
        doc.flags.ignore_permissions = True
        doc.insert(ignore_mandatory=True)
        frappe.db.commit()
