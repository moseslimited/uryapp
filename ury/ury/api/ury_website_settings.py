# -*- coding: utf-8 -*-
"""Reliable Website Settings favicon updates (avoids Desk form / client.set_value edge cases)."""

from urllib.parse import urlparse

import frappe
from frappe import _


def _normalize_favicon_url(url: str) -> str:
	"""Return a site-relative /files or /private/files path, or empty if invalid."""
	u = (url or "").strip()
	if not u or u == "attach_files:":
		return ""
	if u.startswith(("http://", "https://")):
		path = (urlparse(u).path or "").strip()
		if path.startswith("/files/") or path.startswith("/private/files/"):
			return path
		return ""
	if u.startswith("/files/") or u.startswith("/private/files/"):
		return u
	return ""


@frappe.whitelist()
def set_website_favicon(file_url=None, file_name=None):
	"""
	Persist favicon on Website Settings (single).
	Pass either file_url (/files/... or /private/files/...) or file_name (tabFile.name of an uploaded File).

	Uses set_single_value instead of doc.save() so Top Bar / Footer / Redirect validation on the full
	document cannot block a favicon-only update.
	"""
	frappe.has_permission("Website Settings", ptype="write", throw=True)

	url = _normalize_favicon_url(file_url or "")
	if file_name:
		fd = frappe.get_doc("File", file_name)
		url = _normalize_favicon_url(fd.file_url or "")

	if not url:
		frappe.throw(_("Invalid favicon path. Upload an image or icon file first."))

	frappe.db.set_single_value("Website Settings", "favicon", url)
	# Same as Website Settings on_update (guest / website cache).
	frappe.get_doc("Website Settings").clear_cache()

	return {"ok": 1, "favicon": url}
