# Copyright (c) 2026, URY and contributors
# See license.txt

import frappe
from frappe.utils.telemetry import capture
from ury.ury.hooks.ury_web import get_branded_favicon_url

no_cache = 1


def get_context(context):
	csrf_token = frappe.sessions.get_csrf_token()
	boot = get_boot()
	boot["csrf_token"] = csrf_token

	context.csrf_token = csrf_token
	context.app_name = "ury"
	context.favicon = get_branded_favicon_url()
	context.build_version = frappe.utils.get_build_version()
	# Must be a JSON string so the template outputs valid JS
	context.boot_json = str(frappe.as_json(boot, indent=None, separators=(",", ":")))

	if frappe.session.user != "Guest":
		capture("active_site", "ury")

	return context


@frappe.whitelist(methods=["POST"], allow_guest=True)
def get_context_for_dev():
	if not frappe.conf.developer_mode:
		frappe.throw("This method is only meant for developer mode")
	return get_boot()


def get_boot():
	if frappe.session.user == "Guest":
		boot = frappe.website.utils.get_boot_data()
	else:
		try:
			boot = frappe.sessions.get()
		except Exception as e:
			raise frappe.SessionBootFailed from e

	if "server_script_enabled" in frappe.conf:
		enabled = frappe.conf.server_script_enabled
	else:
		enabled = True
	boot["server_script_enabled"] = enabled
	boot["push_relay_server_url"] = frappe.conf.get("push_relay_server_url")
	boot["favicon_url"] = get_branded_favicon_url()

	return boot

