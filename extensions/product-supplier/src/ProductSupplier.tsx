import {
  extension,
  AdminBlock,
  BlockStack,
  Button,
  Divider,
  InlineStack,
  Text,
  Badge,
  Banner,
  Box,
  Select,
} from "@shopify/ui-extensions/admin";

export default extension("admin.product-details.block.render", (root, api) => {
  const productId = (api.data.selected[0] as any)?.id ?? "";
  const productTitle = (api.data.selected[0] as any)?.title ?? "";
  const appUrl = api.extension.scriptUrl.split("/extensions")[0];

  let suppliers: Array<{ id: string; name: string }> = [];
  let linkedSupplierId: string | null = null;
  let selectedSupplier = "";

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Supplier" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);

  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading…");
  stack.appendChild(statusText);

  const linkedContainer = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(linkedContainer);

  const notesContainer = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesContainer);

  const feedbackText = root.createComponent(Text, {});
  stack.appendChild(feedbackText);

  root.appendChild(block);

  async function loadData() {
    try {
      const res = await fetch(`${appUrl}/api/product-supplier?productId=${encodeURIComponent(productId)}`);

      if (res.status === 403) {
        statusText.replaceChildren("Product supplier linking requires the Agency plan.");
        return;
      }

      const json = await res.json();
      suppliers = json.suppliers ?? [];
      linkedSupplierId = json.linkedSupplierId ?? null;
      const recentNotes = json.recentNotes ?? [];

      statusText.replaceChildren("");
      linkedContainer.replaceChildren();
      notesContainer.replaceChildren();

      if (linkedSupplierId) {
        const supplierName = suppliers.find(s => s.id === linkedSupplierId)?.name ?? "Linked supplier";

        const headerRow = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        headerRow.appendChild(root.createComponent(Text, { fontWeight: "bold" }, supplierName));
        headerRow.appendChild(root.createComponent(Badge, { tone: "success" }, "Linked"));
        linkedContainer.appendChild(headerRow);

        const unlinkBtn = root.createComponent(Button, {
          size: "slim",
          variant: "plain",
          onPress: async () => {
            await fetch(`${appUrl}/api/product-supplier`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId }),
            });
            feedbackText.replaceChildren("Supplier unlinked.");
            await loadData();
          },
        }, "Unlink supplier");
        linkedContainer.appendChild(unlinkBtn);
      } else if (suppliers.length > 0) {
        const selectOptions = [
          { label: "Select supplier…", value: "" },
          ...suppliers.map(s => ({ label: s.name, value: s.id })),
        ];

        const select = root.createComponent(Select, {
          label: "Link a supplier",
          options: selectOptions,
          value: selectedSupplier,
          onChange: (val: string) => { selectedSupplier = val; },
        });
        linkedContainer.appendChild(select);

        const linkBtn = root.createComponent(Button, {
          variant: "primary",
          size: "slim",
          onPress: async () => {
            if (!selectedSupplier) return;
            linkBtn.updateProps({ loading: true });
            try {
              await fetch(`${appUrl}/api/product-supplier`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId, productTitle, supplierId: selectedSupplier }),
              });
              feedbackText.replaceChildren("✓ Supplier linked.");
              await loadData();
            } catch {
              feedbackText.replaceChildren("Failed to link.");
            } finally {
              linkBtn.updateProps({ loading: false });
            }
          },
        }, "Link");
        linkedContainer.appendChild(linkBtn);
      } else {
        linkedContainer.appendChild(root.createComponent(Text, { tone: "subdued" },
          "No suppliers yet. Add them in ShiftLog → Suppliers."));
      }

      // Recent notes
      if (recentNotes.length > 0) {
        notesContainer.appendChild(root.createComponent(Divider));
        notesContainer.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, "Recent supplier notes"));

        for (const n of recentNotes) {
          const noteBox = root.createComponent(Box, {
            padding: "base",
            borderWidth: "base",
            borderColor: n.isUrgent ? "critical" : "subdued",
            borderRadius: "base",
          });
          const noteStack = root.createComponent(BlockStack, { gap: "extraTight" });
          const headerRow = root.createComponent(InlineStack, { gap: "tight" });
          headerRow.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, n.staffName));
          if (n.isUrgent) headerRow.appendChild(root.createComponent(Badge, { tone: "critical" }, "Urgent"));
          noteStack.appendChild(headerRow);
          noteStack.appendChild(root.createComponent(Text, { size: "small" }, n.note));
          noteBox.appendChild(noteStack);
          notesContainer.appendChild(noteBox);
        }
      }

    } catch {
      statusText.replaceChildren("Failed to load supplier info.");
    }
  }

  if (productId) loadData();
});
