import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation, Link } from "@remix-run/react";
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
  Divider,
  Box,
  Banner,
  Avatar,
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

  const note = await prisma.shiftNote.findFirst({
    where: { id: params.id, storeId: store.id },
    include: {
      staffMember: true,
      comments: {
        orderBy: { createdAt: "asc" },
        include: { staffMember: true },
      },
    },
  });

  if (!note) throw new Response("Shift note not found", { status: 404 });

  return json({
    note: {
      id: note.id,
      summary: note.summary,
      whatWasDone: note.whatWasDone,
      whatIsPending: note.whatIsPending,
      needsOwner: note.needsOwner,
      resolvedAt: note.resolvedAt?.toISOString() ?? null,
      resolvedBy: note.resolvedBy,
      createdAt: note.createdAt.toISOString(),
      staffMember: { id: note.staffMember.id, name: note.staffMember.name, role: note.staffMember.role },
      comments: note.comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        staffMember: { name: c.staffMember.name, role: c.staffMember.role },
      })),
    },
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
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

  if (intent === "add_comment") {
    const body = (formData.get("body") as string)?.trim();
    if (!body) return json({ error: "Comment cannot be empty" }, { status: 400 });

    await prisma.shiftNoteComment.create({
      data: {
        storeId: store.id,
        shiftNoteId: params.id!,
        staffMemberId: staffMember.id,
        body,
      },
    });
    return json({ success: true });
  }

  if (intent === "resolve") {
    if (staffMember.role !== "OWNER" && staffMember.role !== "MANAGER") {
      return json({ error: "Only owners and managers can resolve notes" }, { status: 403 });
    }
    await prisma.shiftNote.update({
      where: { id: params.id, storeId: store.id },
      data: { resolvedAt: new Date(), resolvedBy: staffMember.name },
    });
    // Also resolve related pending items
    await prisma.pendingItem.updateMany({
      where: { storeId: store.id, sourceType: "shift_note", sourceId: params.id, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedNote: `Resolved by ${staffMember.name}` },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function roleBadgeTone(role: string): "info" | "success" | "warning" {
  if (role === "OWNER") return "success";
  if (role === "MANAGER") return "info";
  return "warning";
}

export default function ShiftNoteDetailPage() {
  const { note, staffMember } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [comment, setComment] = useState("");
  const isOwnerOrManager = staffMember?.role === "OWNER" || staffMember?.role === "MANAGER";

  const initials = (name: string) =>
    name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Page
      title="Shift Note"
      backAction={{ content: "Shift Notes", url: "/app/shifts" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Header */}
              <InlineStack align="space-between">
                <InlineStack gap="300">
                  <Avatar initials={initials(note.staffMember.name)} size="md" />
                  <BlockStack gap="100">
                    <InlineStack gap="200">
                      <Text as="span" variant="headingMd">{note.staffMember.name}</Text>
                      <Badge tone={roleBadgeTone(note.staffMember.role)}>
                        {note.staffMember.role.charAt(0) + note.staffMember.role.slice(1).toLowerCase()}
                      </Badge>
                      {note.needsOwner && !note.resolvedAt && (
                        <Badge tone="critical">Needs attention</Badge>
                      )}
                      {note.resolvedAt && (
                        <Badge tone="success">Resolved by {note.resolvedBy}</Badge>
                      )}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {formatDateTime(note.createdAt)}
                    </Text>
                  </BlockStack>
                </InlineStack>

                {isOwnerOrManager && note.needsOwner && !note.resolvedAt && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="resolve" />
                    <Button submit tone="success">Mark resolved</Button>
                  </Form>
                )}
              </InlineStack>

              <Divider />

              {/* Note content */}
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">SUMMARY</Text>
                  <Text as="p">{note.summary}</Text>
                </BlockStack>

                {note.whatWasDone && (
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">WHAT WAS DONE</Text>
                    <Text as="p">{note.whatWasDone}</Text>
                  </BlockStack>
                )}

                {note.whatIsPending && (
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">WHAT IS PENDING</Text>
                    <Text as="p">{note.whatIsPending}</Text>
                  </BlockStack>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Comments thread */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Comments {note.comments.length > 0 && `(${note.comments.length})`}
              </Text>
              <Divider />

              {note.comments.length === 0 ? (
                <Text as="p" tone="subdued">No comments yet. Be the first to reply.</Text>
              ) : (
                <BlockStack gap="300">
                  {note.comments.map((c) => (
                    <Box key={c.id} background="bg-surface-secondary" borderRadius="200" padding="300">
                      <BlockStack gap="100">
                        <InlineStack align="space-between">
                          <InlineStack gap="200">
                            <Text as="span" fontWeight="semibold">{c.staffMember.name}</Text>
                            <Badge tone={roleBadgeTone(c.staffMember.role)}>
                              {c.staffMember.role.charAt(0) + c.staffMember.role.slice(1).toLowerCase()}
                            </Badge>
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">{timeAgo(c.createdAt)}</Text>
                        </InlineStack>
                        <Text as="p">{c.body}</Text>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              )}

              <Divider />

              {/* Add comment */}
              {staffMember ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="add_comment" />
                  <BlockStack gap="200">
                    {actionData && "success" in actionData && (
                      <Banner tone="success">Comment added.</Banner>
                    )}
                    {actionData && "error" in actionData && (
                      <Banner tone="critical">{"error" in actionData ? String(actionData.error) : ""}</Banner>
                    )}
                    <TextField
                      label="Add a comment"
                      name="body"
                      value={comment}
                      onChange={setComment}
                      multiline={2}
                      autoComplete="off"
                      placeholder="Reply to this shift note…"
                      labelHidden
                    />
                    <Button submit loading={isSubmitting} disabled={!comment.trim()}>
                      Post comment
                    </Button>
                  </BlockStack>
                </Form>
              ) : (
                <Text as="p" tone="subdued">You need to be a team member to comment.</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
