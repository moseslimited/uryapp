import frappe
from frappe.utils import today
from frappe.utils import  get_datetime,today,now
from frappe import _

def validate(doc,method):
    set_cashier_room(doc,method)
    
def before_save(doc, method):
    main_pos_open_check(doc, method)
    set_current_time(doc,method)
    
    
def set_cashier_room(doc,method):
    room =  frappe.db.sql("""
                SELECT room , parent
                FROM `tabURY User`
                WHERE parent=%s AND user=%s         
            """,(doc.branch,doc.user),as_dict=True)
    
    if room:
        doc.custom_room = room[0]['room']
        multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
        if multiple_cashier:
            doc.custom_rooms = []
            for room in room:
                doc.append('custom_rooms', {
                    'room': room['room']
                })

def set_current_time(doc,method):
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        date_time = now()
        doc.period_start_date = date_time
    else:
        pass

def main_pos_open_check(doc,method):
    current_date = today()
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        # Check if there's already an open POS opening entry for this branch and posting date
        # Only one POS opening entry should exist per branch per day
        # Waiters use their assigned codes to track entries within this single opening
        filters = {
            "branch": doc.branch,
            "posting_date": current_date,
            "status": "Open",
            "docstatus": 1,
        }
        
        # Exclude the current document if it's being updated (has a name)
        if doc.name:
            filters["name"] = ["!=", doc.name]
        
        existing_opening_list = frappe.get_all(
            "POS Opening Entry",
            fields=["name", "docstatus", "status", "posting_date", "user"],
            filters=filters,
        )
        
        if existing_opening_list:
            # There's already an open POS opening entry for this branch today
            existing_entry = existing_opening_list[0]
            frappe.throw(
                _("A POS Opening Entry is already open for branch {0} on {1}. Only one POS opening entry is allowed per branch per day. Waiters track entries using their assigned codes.").format(
                    doc.branch, 
                    current_date
                ),
                title=_("POS Opening Entry Already Exists")
            )
    else:
        pass
