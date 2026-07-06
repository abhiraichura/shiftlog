import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
} from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";
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
  EmptyState,
  Modal,
  InlineGrid,
  Box,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const openNew = url.searchParams.get("new") === "1";
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const suppliers = await prisma.supplier.findMany({
    where: { storeId: store.id, isActive: true },
    orderBy: { name: "asc" },
    include: {
      supplierNotes: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return json({
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      email: s.email,
      phone: s.phone,
      whatsapp: s.whatsapp,
      website: s.website,
      lastNote: s.supplierNotes[0]?.note ?? null,
      lastNoteDate: s.supplierNotes[0]?.createdAt.toISOString() ?? null,
      hasUrgent: s.supplierNotes[0]?.isUrgent ?? false,
    })),
    staffMember: staffMember ? { id: staffMember.id, role: staffMember.role } : null,
    storeId: store.id,
    openNew,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );
  if (!staffMember) return json({ error: "Unauthorized" }, { status: 403 });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add_supplier") {
    const name = (formData.get("name") as string)?.trim();
    if (!name) return json({ error: "Name required" }, { status: 400 });

    await prisma.supplier.create({
      data: {
        storeId: store.id,
        name,
        contactName: (formData.get("contactName") as string)?.trim() || null,
        email: (formData.get("email") as string)?.trim() || null,
        phone: (formData.get("phone") as string)?.trim() || null,
        whatsapp: (formData.get("whatsapp") as string)?.trim() || null,
        website: (formData.get("website") as string)?.trim() || null,
      },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SuppliersPage() {
  const { suppliers, staffMember, openNew } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showModal, setShowModal] = useState(openNew);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");

  return (
    <Page
      title="Suppliers"
      subtitle="Your supplier directory with threaded notes."
      primaryAction={<Button onClick={() => setShowModal(true)} variant="primary">Add supplier</Button>}
    >
      <Layout>
        <Layout.Section>
          {suppliers.length === 0 ? (
            <Card>
              <EmptyState
                heading="No suppliers yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{ content: "Add first supplier", onAction: () => setShowModal(true) }}
              >
                <p>Add your suppliers and keep threaded notes on each — stock updates, delays, contacts.</p>
              </EmptyState>
            </Card>
          ) : (
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              {suppliers.map((supplier) => (
                <Card key={supplier.id}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="h3" variant="headingMd">{supplier.name}</Text>
                      {supplier.hasUrgent && <Badge tone="critical">Urgent</Badge>}
                    </InlineStack>

                    {supplier.contactName && (
                      <Text as="p" variant="bodySm" tone="subdued">{supplier.contactName}</Text>
                    )}

                    <BlockStack gap="100">
                      {supplier.email && (
                        <Text as="p" variant="bodySm">
                          📧 <a href={`mailto:${supplier.email}`}>{supplier.email}</a>
                        </Text>
                      )}
                      {supplier.phone && (
                        <Text as="p" variant="bodySm">📞 {supplier.phone}</Text>
                      )}
                      {supplier.whatsapp && (
                        <Text as="p" variant="bodySm">💬 {supplier.whatsapp}</Text>
                      )}
                    </BlockStack>

                    {supplier.lastNote && (
                      <>
                        <Divider />
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Latest note:</Text>
                          <Text as="p" variant="bodySm">
                            {supplier.lastNote.length > 80
                              ? supplier.lastNote.slice(0, 80) + "…"
                              : supplier.lastNote}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {timeAgo(supplier.lastNoteDate!)}
                          </Text>
                        </BlockStack>
                      </>
                    )}

                    <Button url={`/app/suppliers/${supplier.id}`} fullWidth>
                      View notes
                    </Button>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          )}
        </Layout.Section>
      </Layout>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Add supplier"
        primaryAction={{
          content: "Add supplier",
          onAction: () => {
            (document.getElementById("add-supplier-form") as HTMLFormElement)?.submit();
          },
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowModal(false) }]}
      >
        <Modal.Section>
          <Form method="post" id="add-supplier-form">
            <input type="hidden" name="intent" value="add_supplier" />
            <BlockStack gap="300">
              <TextField label="Supplier name" name="name" value={name} onChange={setName} autoComplete="off" requiredIndicator />
              <TextField label="Contact name" name="contactName" value={contactName} onChange={setContactName} autoComplete="off" />
              <TextField label="Email" name="email" type="email" value={email} onChange={setEmail} autoComplete="off" />
              <TextField label="Phone" name="phone" value={phone} onChange={setPhone} autoComplete="off" />
              <TextField label="WhatsApp" name="whatsapp" value={whatsapp} onChange={setWhatsapp} autoComplete="off" />
              <TextField label="Website" name="website" value={website} onChange={setWebsite} autoComplete="off" />
            </BlockStack>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
