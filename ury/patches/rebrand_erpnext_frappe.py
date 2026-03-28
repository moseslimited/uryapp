"""Patch: Rebrand ERPNext -> Erp and Frappe -> erptechcloud (site-wide via Translation). Runs when URY app is installed/updated."""

import frappe


def execute():
	if not frappe.db.table_exists("Translation"):
		return
	# Replace visible strings in translated content (used by __() and the desk)
	rebrand = [
		("ERPNext", "Erp"),
		("Frappe", "erptechcloud"),
	]
	for source_text, translated_text in rebrand:
		existing = frappe.db.get_all(
			"Translation",
			filters={"source_text": source_text, "language": "en"},
			limit=1,
		)
		if existing:
			frappe.db.set_value("Translation", existing[0].name, "translated_text", translated_text, update_modified=False)
		else:
			try:
				doc = frappe.new_doc("Translation")
				doc.source_text = source_text
				doc.translated_text = translated_text
				doc.language = "en"
				doc.insert(ignore_permissions=True)
			except Exception:
				pass
	frappe.db.commit()
