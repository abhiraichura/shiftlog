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
  Divider,
  Box,
  Modal,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { fireUrgentAlerts } from "~/utils/alerts.server";
import { hasPlanFeature } from "~/utils/planCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const [unresolved, resolved] = await Promise.all([
    prisma.pendingItem.findMany({
      where: { storeId: store.id, resolvedAt: null },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: { createdBy: true },
    }),
    prisma.pendingItem.findMany({
      where: { storeId: store.id, resolvedAt: { not: null } },
      orderBy: { resolvedAt: "desc" },
      take: 20,
      include: { createdBy: true },
    }),
  ]);

  const serialize = (items: typeof unresolved) =>
    items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      sourceType: i.sourceType,
      sourceId: i.sourceId,
      priority: i.priority,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      resolvedNote: i.resolvedNote,
      createdAt: i.createdAt.toISOString(),
      createdBy: { id: i.createdBy.id, name: i.createdBy.name },
    }));

  return json({
    unresolved: serialize(unresolved),
    resolved: serialize(resolved),
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
    storeId: store.id,
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

  if (intent === "resolve") {
    const itemId = formData.get("itemId") as string;
    const resolvedNote = (formData.get("resolvedNote") as string)?.trim() || null;
    await prisma.pendingItem.update({
      where: { id: itemId, storeId: store.id },
      data: { resolvedAt: new Date(), resolvedNote },
    });
    return json({ success: true });
  }

  if (intent === "add_manual") {
    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const priority = (formData.get("priority") as string) ?? "NORMAL";
    if (!title) return json({ error: "Title required" }, { status: 400 });

    await prisma.pendingItem.create({
      data: {
        storeId: store.id,
        createdById: staffMember.id,
        title,
        description,
        sourceType: "manual",
        priority: priority as any,
      },
    });
    return json({ success: true });
  }

  if (intent === "set_urgent") {
    const itemId = formData.get("itemId") as string;
    const item = await prisma.pendingItem.update({
      where: { id: itemId, storeId: store.id },
      data: { priority: "URGENT" },
      include: { createdBy: true },
    });

    // Fire Slack/WhatsApp alerts if Agency plan
    if (hasPlanFeature(store.planTier, "slack") && (store.slackWebhookUrl || store.whatsappNumber)) {
      await fireUrgentAlerts({
        storeId: store.id,
        title: item.title,
        description: item.description,
        flaggedBy: item.createdBy.name,
        storeShop: store.shop,
        slackWebhookUrl: store.slackWebhookUrl,
        whatsappNumber: store.whatsappNumber,
      });
    }

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "URGENT") return <Badge tone="critical">Urgent</Badge>;
  if (priority === "LOW") return <Badge tone="info">Low</Badge>;
  return <Badge>Normal</Badge>;
}

function sourceLink(type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "shift_note") return `/app/shifts`;
  if (type === "order_annotation") return `/app/orders`;
  return null;
}

export default function PendingPage() {
  const { unresolved, resolved, staffMember } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [resolveItem, setResolveItem] = useState<string | null>(null);
  const [resolvedNote, setResolvedNote] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const isOwnerOrManager =
    staffMember?.role === "OWNER" || staffMember?.role === "MANAGER";

  return (
    <Page
      title="Pending Items"
      subtitle="Everything that needs your attention in one place."
      primaryAction={
        <Button onClick={() => setShowAddModal(true)} variant="primary">
          Add item
        </Button>
      }
    >
      <Layout>
        {/* Unresolved */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Needs attention
                  {unresolved.length > 0 && (
                    <> &nbsp;<Badge tone="critical">{unresolved.length}</Badge></>
                  )}
                </Text>
              </InlineStack>
              <Divider />

              {unresolved.length === 0 ? (
                <EmptyState
                  heading="Nothing pending"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>When staff flag issues in shift notes or order annotations, they appear here.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {unresolved.map((item) => (
                    <Box
                      key={item.id}
                      borderWidth="025"
                      borderColor={item.priority === "URGENT" ? "border-critical" : "border"}
                      borderRadius="200"
                      padding="300"
                      background={item.priority === "URGENT" ? "bg-surface-critical-subdued" : "bg-surface"}
                    >
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <InlineStack gap="200">
                            <Text as="span" fontWeight="semibold">{item.title}</Text>
                            <PriorityBadge priority={item.priority} />
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {timeAgo(item.createdAt)}
                          </Text>
                        </InlineStack>

                        {item.description && (
                          <Text as="p" variant="bodySm" tone="subdued">{item.description}</Text>
                        )}

                        <Text as="p" variant="bodySm" tone="subdued">
                          Flagged by {item.createdBy.name}
                          {item.sourceType && item.sourceType !== "manual" && (
                            <> · from {item.sourceType.replace("_", " ")}</>
                          )}
                        </Text>

                        {isOwnerOrManager && (
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              tone="success"
                              onClick={() => {
                                setResolveItem(item.id);
                                setResolvedNote("");
                              }}
                            >
                              Resolve
                            </Button>
                            {item.priority !== "URGENT" && (
                              <Form method="post">
                                <input type="hidden" name="intent" value="set_urgent" />
                                <input type="hidden" name="itemId" value={item.id} />
                                <Button submit size="slim" tone="critical" variant="plain">
                                  Mark urgent
                                </Button>
                              </Form>
                            )}
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Resolved */}
        {resolved.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Button
                  onClick={() => setShowResolved(!showResolved)}
                  variant="plain"
                  disclosure={showResolved ? "up" : "down"}
                >
                  Resolved items ({resolved.length})
                </Button>

                {showResolved && (
                  <>
                    <Divider />
                    <BlockStack gap="200">
                      {resolved.map((item) => (
                        <Box key={item.id} padding="200">
                          <BlockStack gap="100">
                            <InlineStack align="space-between">
                              <InlineStack gap="200">
                                <Text as="span" tone="subdued" textDecorationLine="line-through">
                                  {item.title}
                                </Text>
                                <Badge tone="success">Resolved</Badge>
                              </InlineStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {timeAgo(item.resolvedAt!)}
                              </Text>
                            </InlineStack>
                            {item.resolvedNote && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                Note: {item.resolvedNote}
                              </Text>
                            )}
                          </BlockStack>
                        </Box>
                      ))}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>

      {/* Resolve modal */}
      <Modal
        open={!!resolveItem}
        onClose={() => setResolveItem(null)}
        title="Resolve this item"
        primaryAction={{
          content: "Mark resolved",
          onAction: () => {
            const form = document.getElementById("resolve-form") as HTMLFormElement;
            form?.submit();
          },
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setResolveItem(null) }]}
      >
        <Modal.Section>
          <Form method="post" id="resolve-form">
            <input type="hidden" name="intent" value="resolve" />
            <input type="hidden" name="itemId" value={resolveItem ?? ""} />
            <TextField
              label="Resolution note (optional)"
              name="resolvedNote"
              value={resolvedNote}
              onChange={setResolvedNote}
              multiline={3}
              autoComplete="off"
              helpText="Add context about how this was resolved. Staff who flagged it can see this."
            />
          </Form>
        </Modal.Section>
      </Modal>

      {/* Add manual item modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add pending item"
        primaryAction={{
          content: "Add item",
          onAction: () => {
            const form = document.getElementById("add-form") as HTMLFormElement;
            form?.submit();
          },
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowAddModal(false) }]}
      >
        <Modal.Section>
          <Form method="post" id="add-form">
            <input type="hidden" name="intent" value="add_manual" />
            <BlockStack gap="300">
              <TextField
                label="Title"
                name="title"
                value={newTitle}
                onChange={setNewTitle}
                autoComplete="off"
                placeholder="e.g. Call Ahmed about delayed stock"
              />
              <TextField
                label="Description (optional)"
                name="description"
                value={newDescription}
                onChange={setNewDescription}
                multiline={3}
                autoComplete="off"
              />
              <input type="hidden" name="priority" value="NORMAL" />
            </BlockStack>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
