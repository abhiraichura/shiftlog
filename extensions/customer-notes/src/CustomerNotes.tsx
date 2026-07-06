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
  const customerName = (api.data.selected[0] as any)?.displayName ?? (api.data.selected[0] as any)?.email ?? customerId;
  const customerEmail = (api.data.selected[0] as any)?.email ?? null;
  const appUrl = api.extension.scriptUrl.split("/extensions")[0];

  let notes: any[] = [];
  let noteValue = "";
  let isWarning = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Customer Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);

  // Warning banner container
  const warningBannerContainer = root.createComponent(BlockStack, {});
  stack.appendChild(warningBannerContainer);

  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading notes…");
  stack.appendChild(statusText);

  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);

  stack.appendChild(root.createComponent(Divider));

  const textarea = root.createComponent(TextArea, {
    label: "Add a note",
    value: noteValue,
    onChange: (val: string) => { noteValue = val; },
    placeholder: "e.g. Fraud attempted on order #1050 — verify before fulfilling",
  });
  stack.appendChild(textarea);

  const checkbox = root.createComponent(Checkbox, {
    id: "isWarning",
    checked: isWarning,
    onChange: (val: boolean) => { isWarning = val; },
  }, "⚠ Mark as warning (shows red alert to all staff)");
  stack.appendChild(checkbox);

  const feedbackText = root.createComponent(Text, {});
  stack.appendChild(feedbackText);

  const submitBtn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) {
        feedbackText.replaceChildren("Please enter a note.");
        return;
      }
      submitBtn.updateProps({ loading: true });
      try {
        const res = await fetch(`${appUrl}/api/customer-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, customerName, customerEmail, note: noteValue.trim(), isWarning }),
        });
        if (!res.ok) throw new Error("Failed");
        noteValue = "";
        textarea.updateProps({ value: "" });
        feedbackText.replaceChildren("✓ Note saved.");
        await loadNotes();
      } catch {
        feedbackText.replaceChildren("Failed to save. Please try again.");
      } finally {
        submitBtn.updateProps({ loading: false });
      }
    },
  }, "Save note");
  stack.appendChild(submitBtn);

  root.appendChild(block);

  async function loadNotes() {
    try {
      const res = await fetch(`${appUrl}/api/customer-notes?customerId=${encodeURIComponent(customerId)}`);
      const json = await res.json();
      notes = json.notes ?? [];
      const hasWarning = json.hasWarning ?? false;

      // Show/hide warning banner
      warningBannerContainer.replaceChildren();
      if (hasWarning) {
        const banner = root.createComponent(Banner, { tone: "critical" });
        banner.appendChild(root.createComponent(Text, { fontWeight: "bold" },
          "⚠ WARNING: This customer has been flagged. Read notes carefully before processing orders."));
        warningBannerContainer.appendChild(banner);
      }

      notesList.replaceChildren();
      statusText.replaceChildren(notes.length === 0 ? "No notes for this customer yet." : "");

      for (const n of notes) {
        const noteBox = root.createComponent(Box, {
          padding: "base",
          borderWidth: "base",
          borderColor: n.isWarning ? "critical" : "subdued",
          borderRadius: "base",
        });
        const noteStack = root.createComponent(BlockStack, { gap: "extraTight" });
        const headerRow = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        headerRow.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, n.staffName));
        if (n.isWarning) {
          headerRow.appendChild(root.createComponent(Badge, { tone: "critical" }, "⚠ Warning"));
        }
        noteStack.appendChild(headerRow);
        noteStack.appendChild(root.createComponent(Text, {}, n.note));
        noteStack.appendChild(root.createComponent(Text, { tone: "subdued", size: "small" }, timeAgo(n.createdAt)));
        noteBox.appendChild(noteStack);
        notesList.appendChild(noteBox);
      }
    } catch {
      statusText.replaceChildren("Failed to load notes.");
    }
  }

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  if (customerId) loadNotes();
});
