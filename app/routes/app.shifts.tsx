import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
import { formatDate, timeAgo } from "~/utils/helpers";
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
  EmptyState,
  Pagination,
  Box,
  Select,
  Banner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

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
      include: { staffMember: true },
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
      createdAt: n.createdAt.toISOString(),
      staffMember: { id: n.staffMember.id, name: n.staffMember.name, role: n.staffMember.role },
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    allStaff: allStaff.map((s) => ({ id: s.id, name: s.name })),
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
    storeId: store.id,
    filterStaff,
    filterNeeds,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  if (!staffMember) {
    return json({ error: "Staff member not found" }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "submit_shift") {
    const summary = (formData.get("summary") as string)?.trim();
    const whatWasDone = (formData.get("whatWasDone") as string)?.trim() || null;
    const whatIsPending = (formData.get("whatIsPending") as string)?.trim() || null;
    const needsOwner = formData.get("needsOwner") === "true";

    if (!summary) {
      return json({ error: "Summary is required" }, { status: 400 });
    }

    const note = await prisma.shiftNote.create({
      data: {
        storeId: store.id,
        staffMemberId: staffMember.id,
        summary,
        whatWasDone,
        whatIsPending,
        needsOwner,
      },
    });

    if (needsOwner) {
      await prisma.pendingItem.create({
        data: {
          storeId: store.id,
          createdById: staffMember.id,
          title: `Shift note needs attention — ${staffMember.name}`,
          description: summary,
          sourceType: "shift_note",
          sourceId: note.id,
          priority: "NORMAL",
        },
      });
    }

    return json({ success: true });
  }

  if (intent === "resolve") {
    const noteId = formData.get("noteId") as string;
    await prisma.shiftNote.update({
      where: { id: noteId, storeId: store.id },
      data: { resolvedAt: new Date(), resolvedBy: staffMember.name },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function RoleBadge({ role }: { role: string }) {
  const toneMap: Record<string, "info" | "success" | "warning"> = {
    OWNER: "success",
    MANAGER: "info",
    STAFF: "warning",
  };
  return (
    <Badge tone={toneMap[role] ?? "info"}>
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </Badge>
  );
}

export default function ShiftsPage() {
  const {
    notes,
    total,
    page,
    pages,
    allStaff,
    staffMember,
    filterStaff,
    filterNeeds,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [summary, setSummary] = useState("");
  const [whatWasDone, setWhatWasDone] = useState("");
  const [whatIsPending, setWhatIsPending] = useState("");
  const [needsOwner, setNeedsOwner] = useState(false);

  const handleSuccess = useCallback(() => {
    if (actionData && "success" in actionData) {
      setSummary("");
      setWhatWasDone("");
      setWhatIsPending("");
      setNeedsOwner(false);
    }
  }, [actionData]);

  const staffOptions = [
    { label: "All staff", value: "" },
    ...allStaff.map((s) => ({ label: s.name, value: s.id })),
  ];

  return (
    <Page
      title="Shift Notes"
      subtitle="Log what happened during your shift so your team stays in sync."
    >
      <Layout>
        {/* Submit new note */}
        {staffMember && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Write today's shift note
                </Text>
                {actionData && "success" in actionData && (
                  <Banner tone="success">Shift note submitted successfully.</Banner>
                )}
                {actionData && "error" in actionData && (
                  <Banner tone="critical">{actionData.error}</Banner>
                )}
                <Form method="post">
                  <input type="hidden" name="intent" value="submit_shift" />
                  <BlockStack gap="300">
                    <TextField
                      label="Summary — what happened today?"
                      name="summary"
                      value={summary}
                      onChange={setSummary}
                      multiline={3}
                      autoComplete="off"
                      helpText="Give your team a quick overview of your shift."
                    />
                    <TextField
                      label="What did you complete? (optional)"
                      name="whatWasDone"
                      value={whatWasDone}
                      onChange={setWhatWasDone}
                      multiline={3}
                      autoComplete="off"
                      helpText="List tasks you finished, orders you handled, issues you resolved."
                    />
                    <TextField
                      label="What is still pending? (optional)"
                      name="whatIsPending"
                      value={whatIsPending}
                      onChange={setWhatIsPending}
                      multiline={3}
                      autoComplete="off"
                      helpText="Anything the next person should know about or follow up on."
                    />
                    <input
                      type="hidden"
                      name="needsOwner"
                      value={needsOwner ? "true" : "false"}
                    />
                    <Checkbox
                      label="Flag for owner attention"
                      helpText="This will appear in the Pending Items inbox and the daily digest."
                      checked={needsOwner}
                      onChange={setNeedsOwner}
                    />
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
                      onClick={handleSuccess}
                    >
                      Submit shift note
                    </Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Filter bar */}
        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineStack gap="300" align="start">
                <Select
                  label="Filter by staff"
                  name="staff"
                  options={staffOptions}
                  value={filterStaff}
                  onChange={() => {}}
                  labelHidden
                />
                <Checkbox
                  label="Needs attention only"
                  name="needs"
                  value="1"
                  checked={filterNeeds}
                  onChange={() => {}}
                />
                <Button submit size="slim">Filter</Button>
                <Button url="/app/shifts" size="slim" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </Card>
        </Layout.Section>

        {/* Notes feed */}
        <Layout.Section>
          {notes.length === 0 ? (
            <Card>
              <EmptyState
                heading="No shift notes yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{ content: "Write first note", url: "#submit" }}
              >
                <p>
                  Shift notes keep your team aligned. Ask every staff member to
                  submit a note at the end of each shift.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="300">
              {notes.map((note) => (
                <Card key={note.id}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <InlineStack gap="200">
                        <Text as="span" fontWeight="semibold">{note.staffMember.name}</Text>
                        <RoleBadge role={note.staffMember.role} />
                        {note.needsOwner && !note.resolvedAt && (
                          <Badge tone="critical">Needs owner attention</Badge>
                        )}
                        {note.resolvedAt && (
                          <Badge tone="success">Resolved</Badge>
                        )}
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {timeAgo(note.createdAt)}
                      </Text>
                    </InlineStack>

                    <Text as="p">{note.summary}</Text>

                    {note.whatWasDone && (
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                          COMPLETED
                        </Text>
                        <Text as="p" variant="bodySm">{note.whatWasDone}</Text>
                      </BlockStack>
                    )}

                    {note.whatIsPending && (
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
                          PENDING
                        </Text>
                        <Text as="p" variant="bodySm">{note.whatIsPending}</Text>
                      </BlockStack>
                    )}

                    {note.needsOwner && !note.resolvedAt && staffMember &&
                      (staffMember.role === "OWNER" || staffMember.role === "MANAGER") && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="resolve" />
                          <input type="hidden" name="noteId" value={note.id} />
                          <Button submit size="slim" tone="success">
                            Mark resolved
                          </Button>
                        </Form>
                      )}
                  </BlockStack>
                </Card>
              ))}

              {pages > 1 && (
                <Box paddingBlockStart="400">
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => {}}
                    previousURL={`/app/shifts?page=${page - 1}`}
                    hasNext={page < pages}
                    onNext={() => {}}
                    nextURL={`/app/shifts?page=${page + 1}`}
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
// DEBUG
