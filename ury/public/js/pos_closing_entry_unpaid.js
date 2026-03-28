// Warning when Orders → Unpaid POS invoices would block closing (see ury.ury_pos.api)

frappe.ui.form.on("POS Closing Entry", {
	refresh(frm) {
		if (frm.doc.docstatus !== 0) {
			return;
		}
		if (!frm.doc.pos_profile || !frm.doc.period_start_date) {
			frm.dashboard.clear_headline();
			return;
		}
		const period_end = frm.doc.period_end_date || frappe.datetime.now_datetime();
		frappe.call({
			method: "ury.ury_pos.api.get_unpaid_orders_count_for_pos_closing",
			args: {
				pos_profile: frm.doc.pos_profile,
				branch: frm.doc.branch || null,
				period_start: frm.doc.period_start_date,
				period_end: period_end,
			},
			callback(r) {
				const count = (r.message && r.message.count) || 0;
				if (count > 0) {
					frm.dashboard.set_headline_alert(
						__(
							"There are {0} unpaid order(s) in Orders. Pay each invoice or use Pay Later before submitting this closing entry.",
							[String(count)]
						),
						"orange"
					);
				} else {
					frm.dashboard.clear_headline();
				}
			},
		});
	},
});
