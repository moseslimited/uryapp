# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.utils.telemetry import capture
from ury.ury.hooks.ury_web import get_branded_favicon_url

no_cache = 1


def get_context(context):
	csrf_token = frappe.sessions.get_csrf_token()
	# Do not commit in request context (v16); session token is already stored

	boot = get_boot()
	boot["csrf_token"] = csrf_token

	context.csrf_token = csrf_token
	context.app_name = "ury"
	context.favicon = get_branded_favicon_url()
	context.build_version = frappe.utils.get_build_version()
	# Must be a JSON string so the template outputs valid JS (avoid "[object Object]" parse error)
	context.boot_json = str(frappe.as_json(boot, indent=None, separators=(",", ":")))

	# Resolve built POS assets (hashed filenames) so Jinja template can load them
	import re
	context.pos_js_url = "/assets/ury/pos/assets/index.js"
	context.pos_css_url = "/assets/ury/pos/assets/index.css"
	try:
		path = frappe.get_app_path("ury", "public", "pos", "index.html")
		with open(path, "r") as f:
			html = f.read()
		m_js = re.search(r'src="(/assets/ury/pos/assets/[^"]+\.js)"', html)
		m_css = re.search(r'href="(/assets/ury/pos/assets/[^"]+\.css)"', html)
		if m_js:
			context.pos_js_url = m_js.group(1)
		if m_css:
			context.pos_css_url = m_css.group(1)
	except Exception:
		pass

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
	
	# add server_script_enabled in boot
	if "server_script_enabled" in frappe.conf:
		enabled = frappe.conf.server_script_enabled
	else:
		enabled = True
	boot["server_script_enabled"] = enabled
	
	boot["push_relay_server_url"] = frappe.conf.get("push_relay_server_url")
	boot["favicon_url"] = get_branded_favicon_url()

	return boot