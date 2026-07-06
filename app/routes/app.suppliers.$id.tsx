import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
import { formatDateTime, timeAgo } from "~/utils/helpers";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  TextField,
  Checkbox,
  Divider,
  Box,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

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
      notes: supplier.supplierNotes.map((n) => ({
        id: n.id,
        note: n.note,
        isUrgent: n.isUrgent,
        createdAt: n.createdAt.toISOString(),
        staffName: n.staffMember.name,
      })),
    },
    staffMember: staffMember ? { id: staffMember.id, name: staffMember.name, role: staffMember.role } : null,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );
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
      await prisma.pendingItem.create({
        data: {
          storeId: store.id,
          createdById: staffMember.id,
          title: `Urgent supplier update — ${(await prisma.supplier.findUnique({ where: { id: params.id } }))?.name}`,
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
        name: (formData.get("name") as string)?.trim(),
        contactName: (formData.get("contactName") as string)?.trim() || null,
        email: (formData.get("email") as string)?.trim() || null,
        phone: (formData.get("phone") as string)?.trim() || null,
        whatsapp: (formData.get("whatsapp") as string)?.trim() || null,
        website: (formData.get("website") as string)?.trim() || null,
      },
    });
    return json({ success: true });
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
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [note, setNote] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  const isOwnerOrManager =
    staffMember?.role === "OWNER" || staffMember?.role === "MANAGER";

  return (
    <Page
      title={supplier.name}
      backAction={{ content: "Suppliers", url: "/app/suppliers" }}
      primaryAction={
        isOwnerOrManager ? (
          <Button tone="critical" variant="plain" onClick={() => {
            if (confirm("Are you sure you want to deactivate this supplier?")) {
              const form = document.createElement("form");
              form.method = "post";
              const input = document.createElement("input");
              input.name = "intent";
              input.value = "deactivate";
              form.appendChild(input);
              document.body.appendChild(form);
              form.submit();
            }
          }}>
            Deactivate
          </Button>
        ) : undefined
      }
    >
      <Layout>
        {/* Supplier info card */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Contact info</Text>
              <Divider />
              {supplier.contactName && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Contact</Text>
                  <Text as="p">{supplier.contactName}</Text>
                </BlockStack>
              )}
              {supplier.email && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Email</Text>
                  <Text as="p"><a href={`mailto:${supplier.email}`}>{supplier.email}</a></Text>
                </BlockStack>
              )}
              {supplier.phone && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Phone</Text>
                  <Text as="p">{supplier.phone}</Text>
                </BlockStack>
              )}
              {supplier.whatsapp && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">WhatsApp</Text>
                  <Text as="p">{supplier.whatsapp}</Text>
                </BlockStack>
              )}
              {supplier.website && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Website</Text>
                  <Text as="p"><a href={supplier.website} target="_blank" rel="noreferrer">{supplier.website}</a></Text>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Notes thread */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Add note form */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Add note</Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="add_note" />
                  <BlockStack gap="300">
                    <TextField
                      label="Note"
                      name="note"
                      value={note}
                      onChange={setNote}
                      multiline={3}
                      autoComplete="off"
                      placeholder="e.g. Ahmed confirmed XL black delayed until July 15"
                    />
                    <input type="hidden" name="isUrgent" value={isUrgent ? "true" : "false"} />
                    <Checkbox
                      label="Mark as urgent"
                      helpText="Urgent notes appear in the Pending Items inbox and daily digest."
                      checked={isUrgent}
                      onChange={setIsUrgent}
                    />
                    <Button submit variant="primary" loading={isSubmitting}>
                      Add note
                    </Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>

            {/* Notes thread */}
            {supplier.notes.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No notes yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add notes about stock updates, delays, and anything else your team needs to know about this supplier.</p>
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
    </Page>
  );
}
