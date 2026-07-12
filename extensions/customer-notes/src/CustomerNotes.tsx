import {
  extension, AdminBlock, BlockStack, Button, Checkbox,
  Divider, InlineStack, Text, TextArea, Badge, Banner, Box,
} from "@shopify/ui-extensions/admin";

export default extension("admin.customer-details.block.render", (root, api) => {
  const customerId = (api.data.selected[0] as any)?.id ?? "";
  const customerName = (api.data.selected[0] as any)?.displayName ?? customerId;
  const customerEmail = (api.data.selected[0] as any)?.email ?? null;
  const shop = (api as any).shop?.myshopifyDomain ?? "";
  const rawScript = (api.extension as any).scriptUrl ?? "";
  const appUrl = rawScript.includes("/extensions") ? rawScript.split("/extensions")[0] : "";
  const h = { "Content-Type": "application/json", "X-Shopify-Shop-Domain": shop };

  let noteValue = "";
  let isWarning = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Customer Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);
  const warnContainer = root.createComponent(BlockStack, {});
  stack.appendChild(warnContainer);
  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading…");
  stack.appendChild(statusText);
  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);
  stack.appendChild(root.createComponent(Divider));
  const textarea = root.createComponent(TextArea, {
    label: "Add a note", value: noteValue,
    onChange: (v: string) => { noteValue = v; },
    placeholder: "e.g. Fraud attempted — verify before fulfilling",
  });
  stack.appendChild(textarea);
  stack.appendChild(root.createComponent(Checkbox, {
    id: "iw", checked: isWarning,
    onChange: (v: boolean) => { isWarning = v; },
  }, "Mark as warning (shows red alert to all staff)"));
  const fb = root.createComponent(Text, {});
  stack.appendChild(fb);
  const btn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) { fb.replaceChildren("Please enter a note."); return; }
      btn.updateProps({ loading: true });
      try {
        const r = await fetch(`${appUrl}/api/customer-notes?shop=${encodeURIComponent(shop)}`, {
          method: "POST", headers: h,
          body: JSON.stringify({ customerId, customerName, customerEmail, note: noteValue.trim(), isWarning }),
        });
        if (!r.ok) throw new Error();
        noteValue = ""; textarea.updateProps({ value: "" });
        fb.replaceChildren("Note saved."); await load();
      } catch { fb.replaceChildren("Failed to save."); }
      finally { btn.updateProps({ loading: false }); }
    },
  }, "Save note");
  stack.appendChild(btn);
  root.appendChild(block);

  async function load() {
    try {
      const r = await fetch(`${appUrl}/api/customer-notes?customerId=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(shop)}`, { headers: h });
      if (!r.ok) throw new Error();
      const d = await r.json();
      warnContainer.replaceChildren();
      if (d.hasWarning) {
        const b = root.createComponent(Banner, { tone: "critical" });
        b.appendChild(root.createComponent(Text, { fontWeight: "bold" }, "WARNING: This customer has been flagged. Read notes before processing orders."));
        warnContainer.appendChild(b);
      }
      notesList.replaceChildren();
      statusText.replaceChildren((d.notes ?? []).length === 0 ? "No notes yet." : "");
      for (const n of (d.notes ?? [])) {
        const box = root.createComponent(Box, { padding: "base", borderWidth: "base", borderColor: n.isWarning ? "critical" : "subdued", borderRadius: "base" });
        const s = root.createComponent(BlockStack, { gap: "extraTight" });
        const row = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        row.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, n.staffName));
        if (n.isWarning) row.appendChild(root.createComponent(Badge, { tone: "critical" }, "Warning"));
        s.appendChild(row);
        s.appendChild(root.createComponent(Text, {}, n.note));
        box.appendChild(s); notesList.appendChild(box);
      }
    } catch { statusText.replaceChildren("Could not load notes."); }
  }
  if (customerId) load();
});
