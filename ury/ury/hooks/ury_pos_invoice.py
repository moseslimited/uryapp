import frappe
from datetime import datetime
from frappe.utils import now_datetime, get_time, now, flt


def before_insert(doc, method):
    pos_invoice_naming(doc, method)
    order_type_update(doc, method)
    restrict_existing_order(doc, method)


def validate(doc, method):
    validate_invoice(doc, method)
    validate_customer(doc, method)
    validate_price_list(doc, method)


def before_submit(doc, method):
    calculate_and_set_times(doc, method)
    validate_invoice_print(doc, method)
    ro_reload_submit(doc, method)


def on_submit(doc, method):
    _free_table_if_no_drafts(doc)
    _set_customer_as_restaurant_customer(doc)
    _backflush_raw_materials_on_sale(doc)


def _set_customer_as_restaurant_customer(doc):
    """Mark this POS Invoice's customer as restaurant customer (for POS customer list)."""
    if not doc.customer or not frappe.db.has_column("Customer", "custom_is_restaurant_customer"):
        return
    frappe.db.set_value(
        "Customer",
        doc.customer,
        "custom_is_restaurant_customer",
        1,
        update_modified=False,
    )


def _backflush_raw_materials_on_sale(doc):
    """On POS Invoice submit: for each item with a default BOM, deduct BOM raw materials from the POS warehouse (Material Issue)."""
    if not doc.items:
        return
    company = doc.company
    warehouse = getattr(doc, "set_warehouse", None) or None
    if not warehouse and doc.pos_profile:
        warehouse = frappe.db.get_value("POS Profile", doc.pos_profile, "warehouse")
    if not warehouse or not company:
        return
    # Optional: use wastage expense account from POS Profile so all material issues hit one account
    profile = frappe.get_doc("POS Profile", doc.pos_profile) if doc.pos_profile else None
    expense_account = None
    if profile and getattr(profile, "custom_wastage_expense_account", None):
        expense_account = profile.custom_wastage_expense_account
    if not expense_account:
        expense_account = frappe.get_cached_value("Company", company, "stock_adjustment_account")
    if not expense_account:
        return

    from erpnext.manufacturing.doctype.bom.bom import get_bom_items_as_dict

    # Aggregate raw materials: item_code -> {qty, item_name, stock_uom, expense_account}
    raw_aggregate = {}
    for row in doc.items:
        item_code = getattr(row, "item_code", None)
        qty = flt(getattr(row, "qty", 0) or getattr(row, "stock_qty", 0), 6)
        if not item_code or qty <= 0:
            continue
        bom_name = frappe.db.get_value(
            "BOM",
            {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1},
            "name",
        )
        if not bom_name:
            continue
        try:
            items_dict = get_bom_items_as_dict(bom_name, company, qty=qty, fetch_exploded=1)
        except Exception:
            continue
        for detail in (items_dict or {}).values():
            rm_code = getattr(detail, "item_code", None)
            rm_qty = flt(getattr(detail, "qty", 0), 6)
            if not rm_code or rm_qty <= 0:
                continue
            if rm_code not in raw_aggregate:
                raw_aggregate[rm_code] = {
                    "qty": 0,
                    "item_name": getattr(detail, "item_name", rm_code),
                    "stock_uom": getattr(detail, "stock_uom", None),
                    "expense_account": getattr(detail, "expense_account", None) or expense_account,
                }
            raw_aggregate[rm_code]["qty"] += rm_qty

    if not raw_aggregate:
        return

    # Build Stock Entry Material Issue
    ste = frappe.new_doc("Stock Entry")
    ste.purpose = "Material Issue"
    ste.company = company
    ste.set_stock_entry_type()  # mandatory: sets stock_entry_type from purpose (e.g. Material Issue)
    ste.set_posting_time = 1
    ste.posting_date = doc.posting_date or frappe.utils.getdate()
    ste.posting_time = doc.posting_time or frappe.utils.nowtime()
    # Do not set custom_issue_reason: it only allows wastage reasons (Spoilage, Breakage, etc.). Leave blank for BOM backflush.
    for rm_code, data in raw_aggregate.items():
        qty = flt(data["qty"], 6)
        if qty <= 0:
            continue
        item_doc = frappe.get_cached_doc("Item", rm_code)
        ste.append("items", {
            "item_code": rm_code,
            "item_name": data.get("item_name") or item_doc.item_name,
            "qty": qty,
            "s_warehouse": warehouse,
            "stock_uom": data.get("stock_uom") or item_doc.stock_uom,
            "expense_account": data.get("expense_account") or expense_account,
        })
    if not ste.items:
        return
    ste.flags.ignore_permissions = True
    ste.insert()
    ste.submit()


def on_trash(doc, method):
    table_status_delete(doc, method)


def _free_table_if_no_drafts(doc):
    """Set table to free (occupied=0) when no other draft orders exist for this table."""
    if doc.restaurant_table:
        other = frappe.db.count(
            "POS Invoice",
            {"restaurant_table": doc.restaurant_table, "docstatus": 0, "status": "Draft"},
        )
        if other == 0:
            frappe.db.set_value(
                "URY Table",
                doc.restaurant_table,
                {"occupied": 0, "latest_invoice_time": None},
            )


def validate_invoice(doc, method):
    if doc.waiter == None or doc.waiter == "":
        doc.waiter = doc.modified_by
    remove_items = frappe.db.get_value("POS Profile", doc.pos_profile, "remove_items")
    
    if doc.invoice_printed == 1 and remove_items == 0:
        # Get the original items from db
        original_doc = frappe.get_doc("POS Invoice", doc.name)
        
        # Create dictionaries to store both quantities and names
        original_items = {
            item.item_code: {"qty": item.qty, "name": item.item_name} 
            for item in original_doc.items
        }
        current_items = {
            item.item_code: {"qty": item.qty, "name": item.item_name} 
            for item in doc.items
        }
          
        # Check for removed items
        removed_items = set(original_items.keys()) - set(current_items.keys())
        
        # Check for quantity reductions
        reduced_qty_items = []
        for item_code, item_data in original_items.items():
            if (item_code in current_items and 
                current_items[item_code]["qty"] < item_data["qty"]):
                reduced_qty_items.append(
                    f"{item_data['name']} (qty reduced from {item_data['qty']} "
                    f"to {current_items[item_code]['qty']})"
                )
        
        if removed_items or reduced_qty_items:
            error_msg = []
            if removed_items:
                removed_item_names = [
                    original_items[item_code]["name"] 
                    for item_code in removed_items
                ]
                error_msg.append(f"Removed items: {', '.join(removed_item_names)}")
            if reduced_qty_items:
                error_msg.append(f"Modified quantities: {', '.join(reduced_qty_items)}")
                
            frappe.throw(
                ("Cannot modify items after invoice is printed.\n{0}")
                .format("\n".join(error_msg))
            )


def validate_customer(doc, method):
    if doc.customer_name == None or doc.customer_name == "":
        frappe.throw(
            (" Failed to load data , Please Refresh the page ").format(
                doc.customer_name
            )
        )


def calculate_and_set_times(doc, method):
    doc.arrived_time = doc.creation

    current_time_str = now()
    
    current_time = datetime.strptime(current_time_str, "%Y-%m-%d %H:%M:%S.%f")
    
    time_difference = current_time - doc.creation
    
    total_seconds = int(time_difference.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    
    formatted_spend_time = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    doc.total_spend_time = formatted_spend_time


def validate_invoice_print(doc, method):
    # Check if the invoice has been printed
    invoice_printed = frappe.db.get_value("POS Invoice", doc.name, "invoice_printed")

    # If the invoice is associated with a restaurant table and hasn't been printed
    if doc.restaurant_table and invoice_printed == 0:
        frappe.throw(
            "Printing the invoice is mandatory before submitting. Please print the invoice."
        )


def table_status_delete(doc, method):
    if doc.restaurant_table:
        # Free table only if no other draft orders exist for this table
        other = frappe.db.count(
            "POS Invoice",
            {
                "restaurant_table": doc.restaurant_table,
                "docstatus": 0,
                "status": "Draft",
                "name": ("!=", doc.name),
            },
        )
        if other == 0:
            frappe.db.set_value(
                "URY Table",
                doc.restaurant_table,
                {"occupied": 0, "latest_invoice_time": None},
            )


def pos_invoice_naming(doc, method):
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    restaurant = pos_profile.restaurant

    if not doc.restaurant_table:
        doc.naming_series = frappe.db.get_value(
            "URY Restaurant", restaurant, "invoice_series_prefix"
        )
        
        if doc.order_type == "Aggregators":
            doc.naming_series = frappe.db.get_value(
                "URY Restaurant", restaurant, "aggregator_series_prefix"
            )
    


def order_type_update(doc, method):
    if doc.restaurant_table:
        if not doc.order_type:
            is_take_away = frappe.db.get_value(
                "URY Table", doc.restaurant_table, "is_take_away"
            )
            if is_take_away == 1:
                doc.order_type = "Take Away"
            else:
                doc.order_type = "Dine In"
    


# reload restaurant order page if submitted invoice is open there
def ro_reload_submit(doc, method):
    frappe.publish_realtime("reload_ro", {"name": doc.name})


def validate_price_list(doc, method):
    if doc.restaurant:
        if doc.order_type == "Aggregators":
            price_list = frappe.db.get_value(
                "Aggregator Settings",
                {"customer": doc.customer, "parent": doc.branch, "parenttype": "Branch"},
                "price_list",
            )
            if not price_list:
                frappe.throw(
                    f"Price list for customer {doc.customer} in branch {doc.branch} not found in Aggregator Settings."
                )
            doc.selling_price_list = price_list
        else:
            # Use Standard Selling only (no Drinks/Food-specific price lists)
            doc.selling_price_list = "Standard Selling"
            

def restrict_existing_order(doc, event):
    # Allow multiple orders per table (e.g. separate bills for different groups at same table)
    pass
