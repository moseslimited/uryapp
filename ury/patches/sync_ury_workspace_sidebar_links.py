# Copyright (c) 2025, URY and contributors
# Sync URY Workspace links into Workspace Sidebar so all doctypes appear in the sidebar.

import frappe


def execute():
	"""Add missing URY doctypes to Workspace Sidebar 'URY' so they appear in the sidebar when user clicks URY."""
	if not frappe.db.exists("Workspace Sidebar", "URY"):
		return

	sidebar = frappe.get_doc("Workspace Sidebar", "URY")
	existing_link_tos = {item.link_to for item in sidebar.items if item.type == "Link" and item.link_to}

	# Doctypes that should appear in URY sidebar (match workspace ury.json links)
	links_to_add = [
		("URY Production Unit", "URY Production Unit"),
		("URY User", "URY User"),
		("URY Report Settings", "URY Report Settings"),
		("URY KOT", "URY KOT"),
		("URY Daily P and L", "URY Daily P and L"),
		("Sub POS Closing", "Sub POS Closing"),
		("Aggregator Settings", "Aggregator Settings"),
	]

	idx = len(sidebar.items)
	added_any = False
	for label, link_to in links_to_add:
		if link_to in existing_link_tos:
			continue
		if not frappe.db.exists("DocType", link_to):
			continue
		sidebar.append(
			"items",
			{
				"label": label,
				"link_type": "DocType",
				"link_to": link_to,
				"type": "Link",
				"idx": idx,
			},
		)
		existing_link_tos.add(link_to)
		idx += 1
		added_any = True

	if added_any:
		sidebar.save(ignore_permissions=True)
		frappe.db.commit()
