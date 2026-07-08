import {
  extension,
  AdminBlock,
  BlockStack,
  Button,
  Checkbox,
  Divider,
  InlineStack,
  Text,
  TextArea,
  Badge,
  Box,
} from "@shopify/ui-extensions/admin";

export default extension("admin.order-details.block.render", (root, api) => {
  const orderId = (api.data.selected[0] as any)?.id ?? "";
  const orderNumber = (api.data.selected[0] as any)?.name ?? orderId;
  const shop = (api as any).shop?.myshopifyDomain ?? 
    (api as any).shop?.domain ?? 
    "unravelers.myshopify.com";
  const appUrl = "https://shiftlog-production-2a26.up.railway.app";

  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Shop-Domain": shop,
  };

  let noteValue = "";
  let needsOwner = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Order Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);

  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading notes…");
  stack.appendChild(statusText);

  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);

  stack.appendChild(root.createComponent(Divider));

  const textarea = root.createComponent(TextArea, {
    label: "Add a note",
    value: noteValue,
    onChange: (val: string) => { noteValue = val; },
    placeholder: "e.g. Customer called about delivery",
  });
  stack.appendChild(textarea);

  const checkbox = root.createComponent(Checkbox, {
    id: "needsOwner",
    checked: needsOwner,
    onChange: (val: boolean) => { needsOwner = val; },
  }, "Flag for owner attention");
  stack.appendChild(checkbox);

  const feedbackText = root.createComponent(Text, {});
  stack.appendChild(feedbackText);

  const submitBtn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) { feedbackText.replaceChildren("Please enter a note."); return; }
      submitBtn.updateProps({ loading: true });
      try {
        const res = await fetch(`${appUrl}/api/order-annotations?shop=${encodeURIComponent(shop)}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ orderId, orderNumber, note: noteValue.trim(), needsOwner }),
        });
        if (!res.ok) throw new Error("Failed");
        noteValue = "";
        textarea.updateProps({ value: "" });
        feedbackText.replaceChildren("Note saved.");
        await loadNotes();
      } catch { feedbackText.replaceChildren("Failed to save. Please try again."); }
      finally { submitBtn.updateProps({ loading: false }); }
    },
  }, "Save note");
  stack.appendChild(submitBtn);
  root.appendChild(block);

  async function loadNotes() {
    try {
      const res = await fetch(
        `${appUrl}/api/order-annotations?orderId=${encodeURIComponent(orderId)}&shop=${encodeURIComponent(shop)}`,
        { headers }
      );
      const json = await res.json();
      const annotations = json.annotations ?? [];
      notesList.replaceChildren();
      statusText.replaceChildren(annotations.length === 0 ? "No notes yet." : "");
      for (const a of annotations) {
        const box = root.createComponent(Box, { padding: "base", borderWidth: "base", borderColor: "subdued", borderRadius: "base" });
        const s = root.createComponent(BlockStack, { gap: "extraTight" });
        const row = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        row.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, a.staffName));
        if (a.needsOwner && !a.resolvedAt) row.appendChild(root.createComponent(Badge, { tone: "warning" }, "Flagged"));
        if (a.resolvedAt) row.appendChild(root.createComponent(Badge, { tone: "success" }, "Resolved"));
        s.appendChild(row);
        s.appendChild(root.createComponent(Text, {}, a.note));
        if (a.needsOwner && !a.resolvedAt) {
          const rb = root.createComponent(Button, { size: "slim", variant: "plain", onPress: async () => {
            await fetch(`${appUrl}/api/order-annotations?shop=${encodeURIComponent(shop)}`, {
              method: "PUT", headers,
              body: JSON.stringify({ annotationId: a.id }),
            });
            await loadNotes();
          }}, "Resolve");
          s.appendChild(rb);
        }
        box.appendChild(s);
        notesList.appendChild(box);
      }
    } catch (e) {
      statusText.replaceChildren("Failed to load notes.");
    }
  }

  if (orderId) loadNotes();
});
