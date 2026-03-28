# -*- coding: utf-8 -*-
"""After login, send everyone to URY POS. Desk remains available at /app / /desk."""

import frappe


def redirect_to_pos():
	"""On login: default landing page is POS for all users (including accountants)."""
	if not frappe.session.user or frappe.session.user == "Guest":
		return
	if hasattr(frappe.local, "response") and frappe.local.response is not None:
		frappe.local.response["redirect_to"] = "/pos"
