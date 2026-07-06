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

export default extension("admin.order-details.block.render", (root, api) => {
  const orderId = (api.data.selected[0] as any)?.id ?? "";
  const orderNumber = (api.data.selected[0] as any)?.name ?? orderId;
  const appUrl = api.extension.scriptUrl.split("/extensions")[0];

  // State
  let annotations: any[] = [];
  let noteValue = "";
  let needsOwner = false;
  let canResolve = false;

  // Build UI
  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Order Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);

  // Status text shown while loading
  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading notes…");
  stack.appendChild(statusText);

  // Notes list container
  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);

  // Divider
  stack.appendChild(root.createComponent(Divider));

  // Note input
  const textarea = root.createComponent(TextArea, {
    label: "Add a note",
    value: noteValue,
    onChange: (val: string) => { noteValue = val; },
    placeholder: "e.g. Customer called about delivery, confirmed address updated",
  });
  stack.appendChild(textarea);

  // Flag checkbox
  const checkbox = root.createComponent(Checkbox, {
    id: "needsOwner",
    checked: needsOwner,
    onChange: (val: boolean) => { needsOwner = val; },
  }, "Flag for owner attention");
  stack.appendChild(checkbox);

  // Error/success feedback
  const feedbackText = root.createComponent(Text, {});
  stack.appendChild(feedbackText);

  // Submit button
  const submitBtn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) {
        feedbackText.replaceChildren("Please enter a note.");
        return;
      }
      submitBtn.updateProps({ loading: true });
      try {
        const res = await fetch(`${appUrl}/api/order-annotations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, orderNumber, note: noteValue.trim(), needsOwner }),
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

  // Load notes function
  async function loadNotes() {
    try {
      const res = await fetch(`${appUrl}/api/order-annotations?orderId=${encodeURIComponent(orderId)}`);
      const json = await res.json();
      annotations = json.annotations ?? [];
      canResolve = json.canResolve ?? false;

      notesList.replaceChildren();
      statusText.replaceChildren(annotations.length === 0 ? "No notes yet. Add one below." : "");

      for (const a of annotations) {
        const noteBox = root.createComponent(Box, {
          padding: "base",
          borderWidth: "base",
          borderColor: a.needsOwner && !a.resolvedAt ? "caution" : "subdued",
          borderRadius: "base",
        });
        const noteStack = root.createComponent(BlockStack, { gap: "extraTight" });

        const headerRow = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        headerRow.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, a.staffName));
        if (a.needsOwner && !a.resolvedAt) {
          headerRow.appendChild(root.createComponent(Badge, { tone: "warning" }, "Flagged"));
        }
        if (a.resolvedAt) {
          headerRow.appendChild(root.createComponent(Badge, { tone: "success" }, "Resolved"));
        }
        noteStack.appendChild(headerRow);
        noteStack.appendChild(root.createComponent(Text, {}, a.note));

        const footerRow = root.createComponent(InlineStack, { gap: "tight" });
        const ago = timeAgo(a.createdAt);
        footerRow.appendChild(root.createComponent(Text, { tone: "subdued", size: "small" }, ago));

        if (canResolve && a.needsOwner && !a.resolvedAt) {
          const resolveBtn = root.createComponent(Button, {
            size: "slim",
            variant: "plain",
            onPress: async () => {
              await fetch(`${appUrl}/api/order-annotations`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ annotationId: a.id }),
              });
              await loadNotes();
            },
          }, "Resolve");
          footerRow.appendChild(resolveBtn);
        }

        noteStack.appendChild(footerRow);
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

  // Initial load
  if (orderId) loadNotes();
});
