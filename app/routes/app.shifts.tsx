import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, TextField, Checkbox, Divider,
  EmptyState, Box, Select, Banner, Pagination, Avatar, Collapsible,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const filterStaff = url.searchParams.get("staff") ?? "";
  const filterNeeds = url.searchParams.get("needs") === "1";

  const where: any = { storeId: store.id };
  if (filterStaff) where.staffMemberId = filterStaff;
  if (filterNeeds) where.needsOwner = true;

  const [total, notes, allStaff] = await Promise.all([
    prisma.shiftNote.count({ where }),
    prisma.shiftNote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { staffMember: true, _count: { select: { comments: true } } },
    }),
    prisma.staffMember.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return json({
    notes: notes.map((n) => ({
      id: n.id,
      summary: n.summary,
      whatWasDone: n.whatWasDone,
      whatIsPending: n.whatIsPending,
      needsOwner: n.needsOwner,
      resolvedAt: n.resolvedAt?.toISOString() ?? null,
      resolvedBy: n.resolvedBy,
      createdAt: n.createdAt.toISOString(),
      staffMember: { id: n.staffMember.id, name: n.staffMember.name, role: n.staffMember.role },
      commentCount: n._count.comments,
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    allStaff: allStaff.map((s) => ({ id: s.id, name: s.name })),
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
    filterStaff,
    filterNeeds,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);
  if (!staffMember) return json({ error: "Staff member not found" }, { status: 403 });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "submit_shift") {
    const summary = (formData.get("summary") as string)?.trim();
    const whatWasDone = (formData.get("whatWasDone") as string)?.trim() || null;
    const whatIsPending = (formData.get("whatIsPending") as string)?.trim() || null;
    const needsOwner = formData.get("needsOwner") === "true";
    if (!summary) return json({ error: "Summary is required" }, { status: 400 });

    const note = await prisma.shiftNote.create({
      data: { storeId: store.id, staffMemberId: staffMember.id, summary, whatWasDone, whatIsPending, needsOwner },
    });

    if (needsOwner) {
      await prisma.pendingItem.create({
        data: {
          storeId: store.id, createdById: staffMember.id,
          title: `Shift note needs attention — ${staffMember.name}`,
          description: summary, sourceType: "shift_note", sourceId: note.id, priority: "NORMAL",
        },
      });
    }
    return json({ success: true });
  }

  if (intent === "resolve") {
    const noteId = formData.get("noteId") as string;
    if (staffMember.role !== "OWNER" && staffMember.role !== "MANAGER") {
      return json({ error: "Only managers can resolve" }, { status: 403 });
    }
    await prisma.shiftNote.update({
      where: { id: noteId, storeId: store.id },
      data: { resolvedAt: new Date(), resolvedBy: staffMember.name },
    });
    await prisma.pendingItem.updateMany({
      where: { storeId: store.id, sourceType: "shift_note", sourceId: noteId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedNote: `Resolved by ${staffMember.name}` },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function roleBadge(role: string) {
  const tones: Record<string, "success" | "info" | "warning"> = { OWNER: "success", MANAGER: "info", STAFF: "warning" };
  return <Badge tone={tones[role] ?? "info"}>{role.charAt(0) + role.slice(1).toLowerCase()}</Badge>;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function ShiftsPage() {
  const { notes, total, page, pages, allStaff, staffMember, filterStaff, filterNeeds } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState("");
  const [whatWasDone, setWhatWasDone] = useState("");
  const [whatIsPending, setWhatIsPending] = useState("");
  const [needsOwner, setNeedsOwner] = useState(false);

  useEffect(() => {
    if (actionData && "success" in actionData) {
      setShowForm(false);
      setSummary(""); setWhatWasDone(""); setWhatIsPending(""); setNeedsOwner(false);
    }
  }, [actionData]);

  const isOwnerOrManager = staffMember?.role === "OWNER" || staffMember?.role === "MANAGER";
  const staffOptions = [
    { label: "All staff", value: "" },
    ...allStaff.map((s) => ({ label: s.name, value: s.id })),
  ];

  return (
    <Page
      title="Shift Notes"
      subtitle={`${total} total`}
      primaryAction={staffMember ? { content: "+ Write shift note", onAction: () => setShowForm(true), variant: "primary" } : undefined}
    >
      <Layout>
        {actionData && "success" in actionData && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              Shift note submitted. Your team can see it now.
            </Banner>
          </Layout.Section>
        )}
        {actionData && "error" in actionData && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>{"error" in actionData ? String(actionData.error) : ""}</Banner>
          </Layout.Section>
        )}

        {/* Collapsible form */}
        {staffMember && (
          <Layout.Section>
            <Collapsible open={showForm} id="shift-form">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="050">
                      <Text as="h2" variant="headingMd">Write shift note</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Keep your team informed about what happened during your shift.</Text>
                    </BlockStack>
                    <Button variant="plain" onClick={() => setShowForm(false)}>Cancel</Button>
                  </InlineStack>
                  <Divider />
                  <Form method="post">
                    <input type="hidden" name="intent" value="submit_shift" />
                    <input type="hidden" name="needsOwner" value={needsOwner ? "true" : "false"} />
                    <BlockStack gap="300">
                      <TextField
                        label="What happened today?"
                        name="summary"
                        value={summary}
                        onChange={setSummary}
                        multiline={3}
                        autoComplete="off"
                        placeholder="Quick overview of your shift — orders processed, issues handled, what to watch."
                        requiredIndicator
                      />
                      <TextField
                        label="What did you complete? (optional)"
                        name="whatWasDone"
                        value={whatWasDone}
                        onChange={setWhatWasDone}
                        multiline={2}
                        autoComplete="off"
                        placeholder="Tasks finished, orders handled, issues resolved…"
                      />
                      <TextField
                        label="What is still pending? (optional)"
                        name="whatIsPending"
                        value={whatIsPending}
                        onChange={setWhatIsPending}
                        multiline={2}
                        autoComplete="off"
                        placeholder="Anything the next person needs to follow up on…"
                      />
                      <Checkbox
                        label="Flag for owner attention"
                        helpText="Creates a pending item and appears in the daily digest."
                        checked={needsOwner}
                        onChange={setNeedsOwner}
                      />
                      <InlineStack align="end" gap="200">
                        <Button onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button submit variant="primary" loading={isSubmitting} disabled={!summary.trim()}>
                          Submit shift note
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            </Collapsible>
          </Layout.Section>
        )}

        {/* Filters */}
        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineStack gap="300" blockAlignment="center">
                <Select label="Staff" name="staff" options={staffOptions} value={filterStaff} onChange={() => {}} labelHidden />
                <Checkbox label="Needs attention only" name="needs" value="1" checked={filterNeeds} onChange={() => {}} />
                <Button submit size="slim">Filter</Button>
                {(filterStaff || filterNeeds) && <Button url="/app/shifts" size="slim" variant="plain">Clear</Button>}
              </InlineStack>
            </Form>
          </Card>
        </Layout.Section>

        {/* Notes feed */}
        <Layout.Section>
          {notes.length === 0 ? (
            <Card>
              <EmptyState heading="No shift notes yet" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={staffMember ? { content: "Write first note", onAction: () => setShowForm(true) } : undefined}>
                <p>Ask every staff member to submit a shift note at the end of their shift.</p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="300">
              {notes.map((note) => (
                <Card key={note.id}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlignment="start">
                      <InlineStack gap="300" blockAlignment="start">
                        <Avatar initials={initials(note.staffMember.name)} size="sm" />
                        <BlockStack gap="050">
                          <InlineStack gap="200" wrap>
                            <Text as="span" fontWeight="semibold">{note.staffMember.name}</Text>
                            {roleBadge(note.staffMember.role)}
                            {note.needsOwner && !note.resolvedAt && <Badge tone="critical">Needs attention</Badge>}
                            {note.resolvedAt && <Badge tone="success">Resolved by {note.resolvedBy}</Badge>}
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">{timeAgo(note.createdAt)}</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200">
                        {note.commentCount > 0 && (
                          <Text as="span" variant="bodySm" tone="subdued">{note.commentCount} comment{note.commentCount !== 1 ? "s" : ""}</Text>
                        )}
                        <Button url={`/app/shifts/${note.id}`} size="slim" variant="plain">View →</Button>
                      </InlineStack>
                    </InlineStack>

                    <Text as="p">{note.summary}</Text>

                    {(note.whatWasDone || note.whatIsPending) && (
                      <InlineStack gap="300">
                        {note.whatWasDone && (
                          <Box background="bg-surface-secondary" borderRadius="200" padding="200" minWidth="0">
                            <BlockStack gap="050">
                              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">COMPLETED</Text>
                              <Text as="p" variant="bodySm">{note.whatWasDone}</Text>
                            </BlockStack>
                          </Box>
                        )}
                        {note.whatIsPending && (
                          <Box background="bg-surface-warning-subdued" borderRadius="200" padding="200" minWidth="0">
                            <BlockStack gap="050">
                              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">PENDING</Text>
                              <Text as="p" variant="bodySm">{note.whatIsPending}</Text>
                            </BlockStack>
                          </Box>
                        )}
                      </InlineStack>
                    )}

                    {isOwnerOrManager && note.needsOwner && !note.resolvedAt && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="resolve" />
                        <input type="hidden" name="noteId" value={note.id} />
                        <Button submit size="slim" tone="success">Mark resolved</Button>
                      </Form>
                    )}
                  </BlockStack>
                </Card>
              ))}

              {pages > 1 && (
                <Box paddingBlockStart="400">
                  <Pagination
                    hasPrevious={page > 1}
                    previousURL={`/app/shifts?page=${page - 1}&staff=${filterStaff}&needs=${filterNeeds ? "1" : ""}`}
                    hasNext={page < pages}
                    nextURL={`/app/shifts?page=${page + 1}&staff=${filterStaff}&needs=${filterNeeds ? "1" : ""}`}
                    label={`Page ${page} of ${pages}`}
                  />
                </Box>
              )}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
