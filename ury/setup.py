import frappe
import os
import click
from frappe import _

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def after_install():
    create_custom_fields(get_custom_fields())


def add_customers_served_field():
    """Patch: add Customers Served field to POS Invoice for existing sites."""
    create_custom_fields({
        "POS Invoice": [
            {
                "fieldname": "customers_served",
                "fieldtype": "Check",
                "label": "Customers Served",
                "insert_after": "invoice_printed",
                "read_only": 0,
                "description": "Mark when food has been served to customers at this table",
            },
        ],
    })


def add_pos_receipt_compact_format():
    """Patch: add a compact POS Receipt print format for restaurant bills."""
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


def before_uninstall():
	delete_custom_fields(get_custom_fields())
 
def get_custom_fields():
	"""URY specific custom fields that need to be added to the masters in ERPNext"""
	return {
     	"POS Invoice": [
				{
					"fieldname": "mobile_number",
					"fieldtype": "Data",
					"fetch_from": "customer.mobile_number",
					"label": "Mobile Number",
					"insert_after": "customer_name",
					"translatable": 0,
				},
				{
					"fieldname": "order_info",
					"fieldtype": "Section Break",
					"label": "Order Info",
					"insert_after": "return_against",
				},
				{
					"fieldname": "order_type",
					"fieldtype": "Select",
					"default": "Dine In",
					"label": "Order Type",
					"options": "\nDine In\nTake Away\nDelivery\nPhone In\nAggregators",
					"insert_after": "order_info",
					"translatable": 0
				},
				{
					"fieldname": "waiter",
					"fieldtype": "Data",
					"label": "Waiter",
					"read_only": 0,
					"insert_after": "order_type",
					"translatable": 0
				},
				{
					"fieldname": "column_break_rwbwf",
					"fieldtype": "Column Break",
					"insert_after": "waiter"
				},
				{
					"fieldname": "no_of_pax",
					"fieldtype": "Data",
					"label": "Pax",
					"insert_after": "column_break_rwbwf",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "cashier",
					"fieldtype": "Data",
					"label": "Cashier",
					"insert_after": "no_of_pax",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "invoice_printed",
					"fieldtype": "Check",
					"label": "Invoice Printed",
					"insert_after": "cashier",
					"read_only": 1,
				},
				{
					"fieldname": "customers_served",
					"fieldtype": "Check",
					"label": "Customers Served",
					"insert_after": "invoice_printed",
					"read_only": 0,
					"description": "Mark when food has been served to customers at this table",
				},
				{
					"fieldname": "invoice_created",
					"fieldtype": "Check",
					"label": "Invoice Created",
					"insert_after": "invoice_printed",
					"read_only": 0,
					"hidden": 1,
				},
				{
					"fieldname": "restaurant_info",
					"fieldtype": "Section Break",
					"label": "Restaurant Info",
					"insert_after": "invoice_created",
				},
				{
					"fieldname": "restaurant",
					"fieldtype": "Link",
					"insert_after": "restaurant_info",
					"label": "Restaurant",
					"options": "URY Restaurant",
					"read_only": 0,
				},
				{
					"fieldname": "branch",
					"fieldtype": "Link",
					"insert_after": "restaurant",
					"label": "Branch",
					"options": "Branch",
					"read_only": 0,
				},
				{
					"fieldname": "restaurant_table",
					"fieldtype": "Link",
					"insert_after": "branch",
					"label": "Restaurant Table",
					"options": "URY Table",
					"read_only": 0,
				},
				{
					"fieldname": "column_break_gd1mq",
					"fieldtype": "Column Break",
					"insert_after": "restaurant_table",
				},
				{
					"fieldname": "arrived_time",
					"fieldtype": "Time",
					"insert_after": "column_break_gd1mq",
					"label": "Arrived Time"
				},
				{
					"fieldname": "total_spend_time",
					"fieldtype": "Time",
					"insert_after": "arrived_time",
					"label": "Total Spend Time"
				},
				{
					"fieldname": "custom_tip_amount",
					"fieldtype": "Currency",
					"label": "Tip Amount",
					"insert_after": "total_spend_time",
					"description": "Optional tip (for reporting)",
				},
				{
					"fieldname": "custom_service_charge_amount",
					"fieldtype": "Currency",
					"label": "Service Charge Amount",
					"insert_after": "custom_tip_amount",
					"description": "Service charge added at payment",
				}
				],
      
		"Sales Invoice": [
					{
					"fieldname": "mobile_number",
					"fieldtype": "Data",
					"fetch_from": "customer.mobile_number",
					"label": "Mobile Number",
					"insert_after": "customer_name",
					"translatable": 0,
				},
				{
					"fieldname": "order_info",
					"fieldtype": "Section Break",
					"label": "Order Info",
					"insert_after": "return_against",
				},
				{
					"fieldname": "order_type",
					"fieldtype": "Select",
					"default": "Dine In",
					"options": "URY Restaurant",
					"fetch_from": "customer.mobile_number",
					"label": "Order Type",
					"options": "\nDine In\nTake Away\nDelivery\nPhone In\nAggregators",
					"insert_after": "order_info",
					"translatable": 0
				},
				{
					"fieldname": "waiter",
					"fieldtype": "Data",
					"label": "Waiter",
					"read_only": 0,
					"insert_after": "order_type",
					"translatable": 0
				},
				{
					"fieldname": "column_break_rwbwf",
					"fieldtype": "Column Break",
					"insert_after": "waiter"
				},
				{
					"fieldname": "no_of_pax",
					"fieldtype": "Data",
					"label": "Pax",
					"insert_after": "column_break_rwbwf",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "cashier",
					"fieldtype": "Data",
					"label": "Cashier",
					"insert_after": "no_of_pax",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "restaurant_info",
					"fieldtype": "Section Break",
					"label": "Restaurant Info",
					"insert_after": "invoice_created",
				},
				{
					"fieldname": "restaurant",
					"fieldtype": "Link",
					"insert_after": "restaurant_info",
					"label": "Restaurant",
					"options": "URY Restaurant",
					"read_only": 0,
				},
				{
					"fieldname": "branch",
					"fieldtype": "Link",
					"insert_after": "restaurant",
					"label": "Branch",
					"options": "Branch",
					"read_only": 0,
				},
				{
					"fieldname": "restaurant_table",
					"fieldtype": "Link",
					"insert_after": "branch",
					"label": "Restaurant Table",
					"options": "URY Table",
					"read_only": 0,
				},
				{
					"fieldname": "column_break_gd1mq",
					"fieldtype": "Column Break",
					"insert_after": "restaurant_table",
				},
				{
					"fieldname": "arrived_time",
					"fieldtype": "Time",
					"insert_after": "column_break_gd1mq",
					"label": "Arrived Time"
				},
				{
					"fieldname": "total_spend_time",
					"fieldtype": "Time",
					"insert_after": "arrived_time",
					"label": "Total Spend Time"
				}
				],

		"POS Profile": [
			{
				"fieldname": "restaurant_info",
				"fieldtype": "Section Break",
				"label": "Restaurant Info",
				"insert_after": "company_address",
			},
			{
				"fieldname": "restaurant",
				"fieldtype": "Link",
				"insert_after": "restaurant_info",
				"label": "Restaurant",
				"options": "URY Restaurant",
			},
			{
				"fieldname": "column_break_c10ag",
				"fieldtype": "Column Break",
				"insert_after": "restaurant",
			},
			{
				"fetch_from": "restaurant.branch" ,
				"fieldname": "branch",
				"fieldtype": "Link",
				"insert_after": "column_break_c10ag",
				"label": "Branch",
				"options": "Branch"
			},
			{
				"fieldname": "printer_info",
				"fieldtype": "Section Break",
				"label": "Printer Info",
				"insert_after": "branch",
			},
			{
				"depends_on": "eval:doc.qz_print != 1" , 
				"fieldname": "printer_settings",
				"fieldtype": "Table",
				"insert_after": "printer_info",
				"label": "Printer Settings",
				"options": "URY Printer Settings"
			},
			{
				"fieldname": "qz_print",
				"fieldtype": "Check",
				"label": "QZ Print",
				"insert_after": "printer_settings"
			},
			{
				"depends_on": "qz_print",
				"fieldname": "qz_host",
				"fieldtype": "Data",
				"insert_after": "qz_print",
				"label": "QZ Host",
				"translatable": 0,
			},
			{
				"fieldname": "custom_service_charge_percentage",
				"fieldtype": "Percent",
				"label": "Service Charge %",
				"insert_after": "qz_host",
				"description": "Optional service charge applied at payment (e.g. 10)",
			}
		],
  
		"POS Opening Entry": [
			{
				"fieldname": "restaurant_info",
				"fieldtype": "Section Break",
				"label": "Restaurant Info",
				"insert_after": "user",
			},
			{
				"fieldname": "restaurant",
				"fieldtype": "Link",
				"insert_after": "restaurant_info",
				"label": "Restaurant",
				"options": "URY Restaurant",
				"reqd": 1
			},
			{
				"fieldname": "column_break_e3dky",
				"fieldtype": "Column Break",
				"insert_after": "restaurant",
			},
			{	
				"fieldname": "branch",
				"fieldtype": "Link",
				"insert_after": "column_break_e3dky",
				"label": "Branch",
				"options": "Branch",
				"reqd": 1
			}
		],

		"Price List": [
			{
				"fieldname": "restaurant_menu",
				"fieldtype": "Link",
				"options": "URY Menu",
				"label": "Restaurant Menu",
				"insert_after": "currency",
			}
		],
  
		"Branch": [
			{
				"fieldname": "user",
				"fieldtype": "Table",
				"options": "URY User",
				"label": "User",
				"insert_after": "branch",
				"reqd": 1
			}
		],

		"Customer": [
			{
				"fieldname": "mobile_number",
				"fieldtype": "Data",
				"label": "Mobile Number",
				"insert_after": "customer_name",
				"translatable": 0,
				"reqd": 1
			},
		],

		"POS Invoice Iten": [
			{
				"fieldname": "comment",
				"fieldtype": "Data",
				"label": "Comment",
				"insert_after": "description",
				"translatable": 0
			}
		],

		"Stock Entry": [
			{
				"fieldname": "custom_issue_reason",
				"fieldtype": "Select",
				"label": "Issue / Wastage Reason",
				"insert_after": "purpose",
				"options": "\nSpoilage\nBreakage\nTheft\nExpired\nDamaged\nSample\nDonation\nOther",
				"description": "For Material Issue: reason for issue/wastage (used in wastage reports)",
				"depends_on": "eval:doc.purpose==\"Material Issue\"",
			},
		],

		"POS Invoice Item": [
			{
				"fieldname": "custom_ury_line_kind",
				"fieldtype": "Select",
				"label": "URY Line Kind",
				"options": "Normal\nIncluded\nGiveaway",
				"default": "Normal",
				"insert_after": "description",
			},
		],
     
    }
 
def delete_custom_fields(custom_fields):
    for doctype, fields in custom_fields.items():
        frappe.db.delete(
			"Custom Field",
			{
				"fieldname": ("in", [field["fieldname"] for field in fields]),
				"dt": doctype,
			},
		)
        
        frappe.clear_cache(doctype=doctype)
 
 
    
