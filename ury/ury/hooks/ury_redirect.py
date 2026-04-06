# -*- coding: utf-8 -*-
"""After login, send everyone to URY POS. Desk remains available at /app / /desk."""

import frappe

# Roles that can access the full Desk (ERPNext UI). Others are redirected to POS.
DESK_ALLOWED_ROLES = (
	"Administrator",
	"System Manager",
	"Accounts Manager",
	"Accounts User",
	"URY Manager",
)


def restrict_desk_for_pos_users():
	"""Before request: redirect users without Desk access to /pos when they hit /app or /desk."""
	if not frappe.session.user or frappe.session.user == "Guest":
		return
	request = getattr(frappe.local, "request", None)
	if not request or not getattr(request, "path", None):
		return
	path = (request.path or "").strip()
	if not path.startswith("/app") and not path.startswith("/desk"):
		return
	if _user_has_desk_access():
		return
	frappe.local.flags.redirect_location = "/pos"
	raise frappe.Redirect


def _user_has_desk_access():
	"""True if the current user has any of the roles allowed to use Desk."""
	roles = frappe.get_roles(frappe.session.user)
	return any(r in DESK_ALLOWED_ROLES for r in roles)


def redirect_to_pos():
	"""On login: default landing page is POS for all users (including accountants)."""
	if not frappe.session.user or frappe.session.user == "Guest":
		return
	if hasattr(frappe.local, "response") and frappe.local.response is not None:
		frappe.local.response["redirect_to"] = "/pos"
