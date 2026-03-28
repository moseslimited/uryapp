// Persist favicon via server (fresh get_doc + save) — reliable for singles.
// Use ury.ury.api.ury_website_settings.set_website_favicon

const URY_WS_FAVICON_METHOD = "ury.ury.api.ury_website_settings.set_website_favicon";

function ury_resolve_upload_payload(att) {
	if (!att) {
		return { file_url: "", file_name: null };
	}
	if (typeof att === "string") {
		return { file_url: att, file_name: null };
	}
	const url = att.file_url || att.message?.file_url || "";
	const file_name = att.name || att.message?.name || null;
	return { file_url: url, file_name: file_name };
}

function ury_call_set_favicon(args, done) {
	frappe.call({
		method: URY_WS_FAVICON_METHOD,
		args,
		freeze: true,
		freeze_message: __("Saving favicon..."),
		callback: (r) => {
			if (r.exc) {
				frappe.msgprint({
					title: __("Could not save favicon"),
					indicator: "red",
					message: __("Check the error in the desk or try <b>Set Favicon from attachment</b>."),
				});
				done(false);
				return;
			}
			done(true, r.message);
		},
	});
}

frappe.ui.form.on("Website Settings", {
	refresh(frm) {
		if (!sessionStorage.getItem("ury_ws_favicon_hint")) {
			sessionStorage.setItem("ury_ws_favicon_hint", "1");
			frappe.show_alert(
				{
					message: __(
						"For the browser tab icon: use <b>FavIcon → Attach</b>, or attach from the sidebar then click <b>Set Favicon from attachment</b>."
					),
					indicator: "blue",
				},
				14
			);
		}

		if (!frm._ury_favicon_from_attachment_btn) {
			frm._ury_favicon_from_attachment_btn = true;
			frm.add_custom_button(__("Set Favicon from attachment"), () => {
				ury_pick_attachment_and_set_favicon(frm);
			});
		}

		const c = frm.fields_dict.favicon;
		if (!c || c.df.fieldtype !== "Attach" || c._ury_favicon_upload_fixed) {
			return;
		}
		c._ury_favicon_upload_fixed = true;

		c.on_upload_complete = function (attachment) {
			const f = this.frm;
			const { file_url, file_name } = ury_resolve_upload_payload(attachment);
			if (!f) {
				this.set_value(file_url);
				return;
			}
			const args = file_name ? { file_name } : { file_url };
			if (!file_name && !file_url) {
				return;
			}

			ury_call_set_favicon(args, (ok) => {
				if (!ok) {
					return;
				}
				const att = attachment && typeof attachment === "object" ? attachment : {};
				if (att.name) {
					f.attachments.update_attachment(att);
				}
				frappe.model.remove_from_locals(f.doctype, f.docname);
				frappe.model.with_doc(f.doctype, f.docname, () => {
					f.refresh();
				});
				frappe.show_alert({ message: __("Favicon saved."), indicator: "green" });
			});
		};
	},
});

function ury_pick_attachment_and_set_favicon(frm) {
	const atts = (frm.get_docinfo().attachments || []).slice();
	if (!atts.length) {
		frappe.msgprint(__("No attachments. Add a file from the sidebar or use FavIcon → Attach."));
		return;
	}
	const image_re = /\.(png|jpe?g|gif|ico|webp|svg)(\?|$)/i;
	const candidates = atts.filter((a) => image_re.test(a.file_url || a.file_name || ""));
	const list = candidates.length ? candidates : atts;

	if (list.length > 1) {
		frappe.msgprint({
			title: __("Multiple attachments"),
			indicator: "blue",
			message: __(
				"Using the last file in the attachment list: <b>{0}</b>. Remove older copies from the sidebar if that is wrong.",
				[list[list.length - 1].file_name || list[list.length - 1].name]
			),
		});
	}
	const chosen = list[list.length - 1];
	ury_call_set_favicon({ file_name: chosen.name }, (ok) => {
		if (!ok) {
			return;
		}
		frappe.model.remove_from_locals(frm.doctype, frm.docname);
		frappe.model.with_doc(frm.doctype, frm.docname, () => {
			frm.refresh();
		});
		frappe.show_alert({ message: __("Favicon saved."), indicator: "green" });
	});
}
