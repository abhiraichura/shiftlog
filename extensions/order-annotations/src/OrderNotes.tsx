import {
  extension, AdminBlock, BlockStack, Button, Checkbox,
  Divider, InlineStack, Text, TextArea, Badge, Box,
} from "@shopify/ui-extensions/admin";

export default extension("admin.order-details.block.render", (root, api) => {
  const orderId = (api.data.selected[0] as any)?.id ?? "";
  const orderNumber = (api.data.selected[0] as any)?.name ?? orderId;
  const shop = (api as any).shop?.myshopifyDomain ?? "";
  const rawScript = (api.extension as any).scriptUrl ?? "";
  const appUrl = rawScript.includes("/extensions") ? rawScript.split("/extensions")[0] : "";
  const h = { "Content-Type": "application/json", "X-Shopify-Shop-Domain": shop };

  let noteValue = "";
  let needsOwner = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Order Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);
  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading…");
  stack.appendChild(statusText);
  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);
  stack.appendChild(root.createComponent(Divider));
  const textarea = root.createComponent(TextArea, {
    label: "Add a note", value: noteValue,
    onChange: (v: string) => { noteValue = v; },
    placeholder: "e.g. Customer called, confirmed address updated",
  });
  stack.appendChild(textarea);
  stack.appendChild(root.createComponent(Checkbox, {
    id: "no", checked: needsOwner,
    onChange: (v: boolean) => { needsOwner = v; },
  }, "Flag for owner attention"));
  const fb = root.createComponent(Text, {});
  stack.appendChild(fb);
  const btn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) { fb.replaceChildren("Please enter a note."); return; }
      btn.updateProps({ loading: true });
      try {
        const r = await fetch(`${appUrl}/api/order-annotations?shop=${encodeURIComponent(shop)}`, {
          method: "POST", headers: h,
          body: JSON.stringify({ orderId, orderNumber, note: noteValue.trim(), needsOwner }),
        });
        if (!r.ok) throw new Error();
        noteValue = ""; textarea.updateProps({ value: "" });
        fb.replaceChildren("Note saved."); await load();
      } catch { fb.replaceChildren("Failed to save. Please try again."); }
      finally { btn.updateProps({ loading: false }); }
    },
  }, "Save note");
  stack.appendChild(btn);
  root.appendChild(block);

  async function load() {
    try {
      const r = await fetch(`${appUrl}/api/order-annotations?orderId=${encodeURIComponent(orderId)}&shop=${encodeURIComponent(shop)}`, { headers: h });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const ann = d.annotations ?? [];
      notesList.replaceChildren();
      statusText.replaceChildren(ann.length === 0 ? "No notes yet." : "");
      for (const a of ann) {
        const box = root.createComponent(Box, { padding: "base", borderWidth: "base", borderColor: a.needsOwner && !a.resolvedAt ? "caution" : "subdued", borderRadius: "base" });
        const s = root.createComponent(BlockStack, { gap: "extraTight" });
        const row = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        row.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, a.staffName));
        if (a.needsOwner && !a.resolvedAt) row.appendChild(root.createComponent(Badge, { tone: "warning" }, "Flagged"));
        if (a.resolvedAt) row.appendChild(root.createComponent(Badge, { tone: "success" }, "Resolved"));
        s.appendChild(row);
        s.appendChild(root.createComponent(Text, {}, a.note));
        if (d.canResolve && a.needsOwner && !a.resolvedAt) {
          s.appendChild(root.createComponent(Button, { size: "slim", variant: "plain", onPress: async () => {
            await fetch(`${appUrl}/api/order-annotations?shop=${encodeURIComponent(shop)}`, { method: "PUT", headers: h, body: JSON.stringify({ annotationId: a.id }) });
            await load();
          }}, "Resolve"));
        }
        box.appendChild(s); notesList.appendChild(box);
      }
    } catch { statusText.replaceChildren("Could not load notes."); }
  }
  if (orderId) load();
});
