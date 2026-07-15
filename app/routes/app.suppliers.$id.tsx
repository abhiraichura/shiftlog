import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, TextField, Checkbox, Divider, Box,
  EmptyState, Banner, Modal,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, storeId: store.id },
    include: {
      supplierNotes: {
        orderBy: { createdAt: "desc" },
        include: { staffMember: true },
      },
    },
  });

  if (!supplier) throw new Response("Supplier not found", { status: 404 });

  return json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      email: supplier.email,
      phone: supplier.phone,
      whatsapp: supplier.whatsapp,
      website: supplier.website,
      isActive: supplier.isActive,
      notes: supplier.supplierNotes.map((n) => ({
        id: n.id,
        note: n.note,
        isUrgent: n.isUrgent,
        createdAt: n.createdAt.toISOString(),
        staffName: n.staffMember.name,
      })),
    },
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);
  if (!staffMember) return json({ error: "Unauthorized" }, { status: 403 });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add_note") {
    const note = (formData.get("note") as string)?.trim();
    const isUrgent = formData.get("isUrgent") === "true";
    if (!note) return json({ error: "Note is required" }, { status: 400 });

    const supplierNote = await prisma.supplierNote.create({
      data: {
        storeId: store.id,
        supplierId: params.id!,
        staffMemberId: staffMember.id,
        note,
        isUrgent,
      },
    });

    if (isUrgent) {
      const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
      await prisma.pendingItem.create({
        data: {
          storeId: store.id,
          createdById: staffMember.id,
          title: `Urgent supplier update — ${supplier?.name}`,
          description: note,
          sourceType: "supplier_note",
          sourceId: supplierNote.id,
          priority: "URGENT",
        },
      });
    }

    return json({ success: true });
  }

  if (intent === "update_supplier") {
    await prisma.supplier.update({
      where: { id: params.id, storeId: store.id },
      data: {
        name: (formData.get("name") as string)?.trim() || undefined,
        contactName: (formData.get("contactName") as string)?.trim() || null,
        email: (formData.get("email") as string)?.trim() || null,
        phone: (formData.get("phone") as string)?.trim() || null,
        whatsapp: (formData.get("whatsapp") as string)?.trim() || null,
        website: (formData.get("website") as string)?.trim() || null,
      },
    });
    return json({ success: true, message: "Supplier updated" });
  }

  if (intent === "deactivate") {
    await prisma.supplier.update({
      where: { id: params.id, storeId: store.id },
      data: { isActive: false },
    });
    return redirect("/app/suppliers");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SupplierDetailPage() {
  const { supplier, staffMember } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [note, setNote] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(supplier.name);
  const [editContact, setEditContact] = useState(supplier.contactName ?? "");
  const [editEmail, setEditEmail] = useState(supplier.email ?? "");
  const [editPhone, setEditPhone] = useState(supplier.phone ?? "");
  const [editWhatsapp, setEditWhatsapp] = useState(supplier.whatsapp ?? "");
  const [editWebsite, setEditWebsite] = useState(supplier.website ?? "");
  const [showDeactivate, setShowDeactivate] = useState(false);

  const isOwnerOrManager = staffMember?.role === "OWNER" || staffMember?.role === "MANAGER";

  return (
    <Page
      title={supplier.name}
      backAction={{ content: "Suppliers", url: "/app/suppliers" }}
      secondaryActions={
        isOwnerOrManager
          ? [
              { content: "Edit supplier", onAction: () => setShowEdit(true) },
              { content: "Deactivate", destructive: true, onAction: () => setShowDeactivate(true) },
            ]
          : undefined
      }
    >
      <Layout>
        {actionData && "success" in actionData && "message" in actionData && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>{String((actionData as any).message)}</Banner>
          </Layout.Section>
        )}

        {/* Contact info */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Contact info</Text>
              <Divider />
              {supplier.contactName && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Contact person</Text>
                  <Text as="p">{supplier.contactName}</Text>
                </BlockStack>
              )}
              {supplier.email && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Email</Text>
                  <Text as="p"><a href={`mailto:${supplier.email}`}>{supplier.email}</a></Text>
                </BlockStack>
              )}
              {supplier.phone && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Phone</Text>
                  <Text as="p">{supplier.phone}</Text>
                </BlockStack>
              )}
              {supplier.whatsapp && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">WhatsApp</Text>
                  <Text as="p">{supplier.whatsapp}</Text>
                </BlockStack>
              )}
              {supplier.website && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Website</Text>
                  <Text as="p"><a href={supplier.website} target="_blank" rel="noreferrer">{supplier.website}</a></Text>
                </BlockStack>
              )}
              {!supplier.contactName && !supplier.email && !supplier.phone && (
                <Text as="p" tone="subdued">No contact details added. Click Edit supplier to add them.</Text>
              )}
              {isOwnerOrManager && (
                <Button onClick={() => setShowEdit(true)} variant="plain" size="slim">Edit contact info</Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Notes thread */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Add note */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Add note</Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="add_note" />
                  <input type="hidden" name="isUrgent" value={isUrgent ? "true" : "false"} />
                  <BlockStack gap="300">
                    <TextField
                      label="Note"
                      name="note"
                      value={note}
                      onChange={setNote}
                      multiline={3}
                      autoComplete="off"
                      placeholder="e.g. Ahmed confirmed XL black delayed until July 15. Will send partial shipment next week."
                    />
                    <Checkbox
                      label="Mark as urgent"
                      helpText="Creates a pending item and appears in the daily digest."
                      checked={isUrgent}
                      onChange={setIsUrgent}
                    />
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
                      disabled={!note.trim()}
                    >
                      Add note
                    </Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>

            {/* Notes list */}
            {supplier.notes.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No notes yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add notes about stock updates, delays, contacts, and anything your team needs to know about this supplier.</p>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="300">
                {supplier.notes.map((n) => (
                  <Card key={n.id}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <InlineStack gap="200">
                          <Text as="span" fontWeight="semibold">{n.staffName}</Text>
                          {n.isUrgent && <Badge tone="critical">Urgent</Badge>}
                        </InlineStack>
                        <Text as="span" variant="bodySm" tone="subdued">{timeAgo(n.createdAt)}</Text>
                      </InlineStack>
                      <Text as="p">{n.note}</Text>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Edit modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title={`Edit ${supplier.name}`}
        primaryAction={{
          content: "Save changes",
          onAction: () => (document.getElementById("edit-supplier-form") as HTMLFormElement)?.submit(),
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowEdit(false) }]}
      >
        <Modal.Section>
          <Form method="post" id="edit-supplier-form" onSubmit={() => setShowEdit(false)}>
            <input type="hidden" name="intent" value="update_supplier" />
            <BlockStack gap="300">
              <TextField label="Supplier name" name="name" value={editName} onChange={setEditName} autoComplete="off" requiredIndicator />
              <TextField label="Contact name" name="contactName" value={editContact} onChange={setEditContact} autoComplete="off" />
              <TextField label="Email" name="email" type="email" value={editEmail} onChange={setEditEmail} autoComplete="off" />
              <TextField label="Phone" name="phone" value={editPhone} onChange={setEditPhone} autoComplete="off" />
              <TextField label="WhatsApp" name="whatsapp" value={editWhatsapp} onChange={setEditWhatsapp} autoComplete="off" />
              <TextField label="Website" name="website" value={editWebsite} onChange={setEditWebsite} autoComplete="off" />
            </BlockStack>
          </Form>
        </Modal.Section>
      </Modal>

      {/* Deactivate confirm */}
      <Modal
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        title="Deactivate supplier?"
        primaryAction={{
          content: "Deactivate",
          destructive: true,
          onAction: () => (document.getElementById("deactivate-form") as HTMLFormElement)?.submit(),
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowDeactivate(false) }]}
      >
        <Modal.Section>
          <Form method="post" id="deactivate-form">
            <input type="hidden" name="intent" value="deactivate" />
            <Text as="p">This will hide {supplier.name} from the supplier list. All notes are preserved and the supplier can be reactivated by an admin.</Text>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
