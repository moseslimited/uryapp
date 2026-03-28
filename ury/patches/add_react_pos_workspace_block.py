"""Patch: add React POS custom block and ensure it appears on URY workspace."""

import frappe


def execute():
    if frappe.db.exists("Custom HTML Block", "React POS"):
        return
    doc = frappe.new_doc("Custom HTML Block")
    doc.update({
        "name": "React POS",
        "html": (
            '<a href="/pos" class="container">'
            '<label class="urypos">React POS</label>'
            "</a>"
        ),
        "style": (
            ".container {\n"
            "    min-height:40px;\n"
            "    display:flex;\n"
            "    align-items:center;\n"
            "    justify-content:center;\n"
            "}\n\n"
            ".urypos {\n"
            "  font-size:20px;\n"
            "}"
        ),
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
