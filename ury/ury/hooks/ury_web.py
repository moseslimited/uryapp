# -*- coding: utf-8 -*-
"""Shared website helpers for POS / KDS pages (favicon, default routes)."""

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


def default_home_to_pos():
	"""GET / → /pos for logged-in users (works even when Role home_page is set)."""
	if frappe.session.user in (None, "Guest"):
		return
	if frappe.request.method != "GET":
		return
	path = (getattr(frappe.local.request, "path", None) or "").rstrip("/") or "/"
	if path != "/":
		return
	frappe.local.flags.redirect_location = "/pos"
	raise frappe.Redirect
