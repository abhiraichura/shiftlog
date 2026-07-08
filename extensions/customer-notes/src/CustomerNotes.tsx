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
  Banner,
  Box,
} from "@shopify/ui-extensions/admin";

export default extension("admin.customer-details.block.render", (root, api) => {
  const customerId = (api.data.selected[0] as any)?.id ?? "";
  const customerName = (api.data.selected[0] as any)?.displayName ?? customerId;
  const customerEmail = (api.data.selected[0] as any)?.email ?? null;
  const shop = (api as any).shop?.myshopifyDomain ?? 
    (api as any).shop?.domain ?? 
    "unravelers.myshopify.com";
  const appUrl = "https://shiftlog-production-2a26.up.railway.app";

  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Shop-Domain": shop,
  };

  let noteValue = "";
  let isWarning = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Customer Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);

  const warningContainer = root.createComponent(BlockStack, {});
  stack.appendChild(warningContainer);

  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading notes…");
  stack.appendChild(statusText);

  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);

  stack.appendChild(root.createComponent(Divider));

  const textarea = root.createComponent(TextArea, {
    label: "Add a note",
    value: noteValue,
    onChange: (val: string) => { noteValue = val; },
    placeholder: "e.g. Fraud attempted — verify before fulfilling",
  });
  stack.appendChild(textarea);

  const checkbox = root.createComponent(Checkbox, {
    id: "isWarning",
    checked: isWarning,
    onChange: (val: boolean) => { isWarning = val; },
  }, "Mark as warning (shows red alert to all staff)");
  stack.appendChild(checkbox);

  const feedbackText = root.createComponent(Text, {});
  stack.appendChild(feedbackText);

  const submitBtn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) { feedbackText.replaceChildren("Please enter a note."); return; }
      submitBtn.updateProps({ loading: true });
      try {
        const res = await fetch(`${appUrl}/api/customer-notes?shop=${encodeURIComponent(shop)}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ customerId, customerName, customerEmail, note: noteValue.trim(), isWarning }),
        });
        if (!res.ok) throw new Error("Failed");
        noteValue = "";
        textarea.updateProps({ value: "" });
        feedbackText.replaceChildren("Note saved.");
        await loadNotes();
      } catch { feedbackText.replaceChildren("Failed to save."); }
      finally { submitBtn.updateProps({ loading: false }); }
    },
  }, "Save note");
  stack.appendChild(submitBtn);
  root.appendChild(block);

  async function loadNotes() {
    try {
      const res = await fetch(
        `${appUrl}/api/customer-notes?customerId=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(shop)}`,
        { headers }
      );
      const json = await res.json();
      const notes = json.notes ?? [];
      const hasWarning = json.hasWarning ?? false;

      warningContainer.replaceChildren();
      if (hasWarning) {
        const banner = root.createComponent(Banner, { tone: "critical" });
        banner.appendChild(root.createComponent(Text, { fontWeight: "bold" },
          "WARNING: This customer has been flagged. Read notes before processing orders."));
        warningContainer.appendChild(banner);
      }

      notesList.replaceChildren();
      statusText.replaceChildren(notes.length === 0 ? "No notes yet." : "");

      for (const n of notes) {
        const box = root.createComponent(Box, { padding: "base", borderWidth: "base",
          borderColor: n.isWarning ? "critical" : "subdued", borderRadius: "base" });
        const s = root.createComponent(BlockStack, { gap: "extraTight" });
        const row = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        row.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, n.staffName));
        if (n.isWarning) row.appendChild(root.createComponent(Badge, { tone: "critical" }, "Warning"));
        s.appendChild(row);
        s.appendChild(root.createComponent(Text, {}, n.note));
        box.appendChild(s);
        notesList.appendChild(box);
      }
    } catch { statusText.replaceChildren("Failed to load notes."); }
  }

  if (customerId) loadNotes();
});
