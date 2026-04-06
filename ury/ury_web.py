# -*- coding: utf-8 -*-
"""Shared website helpers for POS / KDS pages (favicon)."""

import frappe


def get_branded_favicon_url():
	"""Same source as Desk: Website Settings → Favicon; else URY default icon."""
	try:
		fav = frappe.db.get_single_value("Website Settings", "favicon")
		if fav and fav != "attach_files:":
			return fav
	except Exception:
		pass
	return "/assets/frappe/images/frappe-favicon.svg"
