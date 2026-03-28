"""Patch: add a compact POS Receipt print format for restaurant bills."""

import frappe


def _compact_pos_receipt_html():
    return """<style>
.print-format { font-family: sans-serif; font-size: 12px; line-height: 1.35; max-width: 80mm; padding: 4mm; }
.print-format table { width: 100%; border-collapse: collapse; }
.print-format th, .print-format td { padding: 2px 4px; text-align: left; }
.print-format .text-right { text-align: right; }
.print-format .text-center { text-align: center; }
.print-format hr { border: none; border-top: 1px solid #ccc; margin: 4px 0; }
.print-format .head { font-weight: bold; margin-bottom: 4px; }
.print-format .total-row { font-weight: bold; border-top: 1px solid #333; padding-top: 4px; }
</style>
{% if letter_head %}{{ letter_head }}{% endif %}
<p class="text-center head">{{ doc.company }}</p>
<p>
<b>Receipt:</b> {{ doc.name }}<br>
<b>Date:</b> {{ doc.get_formatted("posting_date") }} {{ doc.get_formatted("posting_time") or "" }}<br>
<b>Customer:</b> {{ doc.customer_name or "Walk In" }}{% if doc.restaurant_table %}<br><b>Table:</b> {{ doc.restaurant_table }}{% endif %}
</p>
<hr>
<table>
<thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Rate</th><th class="text-right">Amount</th></tr></thead>
<tbody>
{% for item in doc.items %}
<tr><td>{{ item.item_name or item.item_code }}</td><td class="text-right">{{ item.qty }}</td><td class="text-right">{{ item.get_formatted("rate") }}</td><td class="text-right">{{ item.get_formatted("amount") }}</td></tr>
{% endfor %}
</tbody>
</table>
<hr>
<table>
<tr><td class="text-right" style="width:60%">Total</td><td class="text-right">{{ doc.get_formatted("net_total", doc) }}</td></tr>
{% for row in doc.taxes %}
{% if not row.included_in_print_rate or (doc.flags and doc.flags.show_inclusive_tax_in_print) %}
<tr><td class="text-right">{{ row.description }}</td><td class="text-right">{{ row.get_formatted("tax_amount", doc) }}</td></tr>
{% endif %}
{% endfor %}
{% if doc.discount_amount and doc.discount_amount != 0 %}
<tr><td class="text-right">Discount</td><td class="text-right">{{ doc.get_formatted("discount_amount") }}</td></tr>
{% endif %}
<tr class="total-row"><td class="text-right">Grand Total</td><td class="text-right">{{ doc.get_formatted("grand_total") }}</td></tr>
{% if doc.rounded_total %}<tr><td class="text-right">Rounded</td><td class="text-right">{{ doc.get_formatted("rounded_total") }}</td></tr>{% endif %}
</table>
<hr>
<p class="text-center" style="font-size:11px; margin-top:6px">Thank you. Please visit again.</p>
"""


def execute():
    name = "POS Receipt"
    if frappe.db.exists("Print Format", name):
        return
    doc = frappe.new_doc("Print Format")
    doc.update({
        "name": name,
        "doc_type": "POS Invoice",
        "print_format_type": "Jinja",
        "custom_format": 1,
        "html": _compact_pos_receipt_html(),
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
