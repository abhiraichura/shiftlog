import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
} from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
import { formatDate } from "~/utils/helpers";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Select,
} from "@shopify/polaris";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { canInviteMoreStaff, PLAN_USER_LIMITS } from "~/utils/planCheck.server";
import { sendInviteEmail } from "~/utils/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const members = await prisma.staffMember.findMany({
    where: { storeId: store.id },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const activeCount = members.filter((m) => m.isActive).length;
  const limit = PLAN_USER_LIMITS[store.planTier] ?? 2;
  const canInvite = canInviteMoreStaff(store.planTier, activeCount);

  return json({
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      isActive: m.isActive,
      acceptedAt: m.acceptedAt?.toISOString() ?? null,
      inviteToken: m.inviteToken,
      createdAt: m.createdAt.toISOString(),
    })),
    activeCount,
    limit: limit === Infinity ? null : limit,
    canInvite,
    staffMember: staffMember ? { id: staffMember.id, role: staffMember.role } : null,
    planTier: store.planTier,
    appUrl: process.env.SHOPIFY_APP_URL ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );
  if (!staffMember || staffMember.role !== "OWNER") {
    return json({ error: "Only the owner can manage staff" }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "change_role") {
    const memberId = formData.get("memberId") as string;
    const role = formData.get("role") as string;
    if (!["MANAGER", "STAFF"].includes(role)) {
      return json({ error: "Invalid role" }, { status: 400 });
    }
    await prisma.staffMember.update({
      where: { id: memberId, storeId: store.id },
      data: { role: role as any },
    });
    return json({ success: true });
  }

  if (intent === "deactivate") {
    const memberId = formData.get("memberId") as string;
    await prisma.staffMember.update({
      where: { id: memberId, storeId: store.id },
      data: { isActive: false },
    });
    return json({ success: true });
  }

  if (intent === "reactivate") {
    const memberId = formData.get("memberId") as string;

    // Check limit again
    const activeCount = await prisma.staffMember.count({
      where: { storeId: store.id, isActive: true },
    });
    if (!canInviteMoreStaff(store.planTier, activeCount)) {
      return json({ error: "Staff limit reached for your plan" }, { status: 400 });
    }

    await prisma.staffMember.update({
      where: { id: memberId, storeId: store.id },
      data: { isActive: true },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function StatusBadge({ member }: { member: { isActive: boolean; acceptedAt: string | null; inviteToken: string | null } }) {
  if (!member.isActive) return <Badge tone="critical">Inactive</Badge>;
  if (!member.acceptedAt) return <Badge tone="warning">Invite pending</Badge>;
  return <Badge tone="success">Active</Badge>;
}

export default function TeamPage() {
  const { members, activeCount, limit, canInvite, staffMember, planTier, appUrl } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const isOwner = staffMember?.role === "OWNER";

  return (
    <Page
      title="Team"
      subtitle={limit ? `${activeCount} of ${limit} staff slots used` : `${activeCount} staff members`}
      primaryAction={
        isOwner
          ? {
              content: "Invite staff member",
              url: "/app/team/invite",
              disabled: !canInvite,
            }
          : undefined
      }
    >
      <Layout>
        {isOwner && !canInvite && (
          <Layout.Section>
            <Banner
              title={`You've reached the staff limit for your plan (${limit} members)`}
              tone="warning"
              action={{ content: "Upgrade your plan", url: "/app/settings/billing" }}
            >
              <p>Upgrade to add more staff members.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "staff member", plural: "staff members" }}
              itemCount={members.length}
              selectable={false}
              headings={[
                { title: "Name" },
                { title: "Email" },
                { title: "Role" },
                { title: "Status" },
                { title: "Joined" },
                { title: "" },
              ]}
            >
              {members.map((member, i) => (
                <IndexTable.Row
                  key={member.id}
                  id={member.id}
                  position={i}
                  disabled={!member.isActive}
                >
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{member.name}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm">{member.email}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {isOwner && member.role !== "OWNER" && member.isActive ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="change_role" />
                        <input type="hidden" name="memberId" value={member.id} />
                        <Select
                          label="Role"
                          options={[
                            { label: "Manager", value: "MANAGER" },
                            { label: "Staff", value: "STAFF" },
                          ]}
                          value={member.role}
                          onChange={() => {
                            (document.activeElement as HTMLSelectElement)?.form?.submit();
                          }}
                          name="role"
                          labelHidden
                        />
                      </Form>
                    ) : (
                      <Badge tone={member.role === "OWNER" ? "success" : "info"}>
                        {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                      </Badge>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <StatusBadge member={member} />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {member.acceptedAt ? formatDate(member.acceptedAt) : "—"}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {isOwner && member.role !== "OWNER" && (
                      <InlineStack gap="200">
                        {!member.acceptedAt && member.inviteToken && (
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() => {
                              navigator.clipboard.writeText(`${appUrl}/invite/${member.inviteToken}`);
                              alert("Invite link copied to clipboard");
                            }}
                          >
                            Copy invite link
                          </Button>
                        )}
                        {member.isActive ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="deactivate" />
                            <input type="hidden" name="memberId" value={member.id} />
                            <Button submit size="slim" tone="critical" variant="plain">
                              Deactivate
                            </Button>
                          </Form>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="reactivate" />
                            <input type="hidden" name="memberId" value={member.id} />
                            <Button submit size="slim" variant="plain">
                              Reactivate
                            </Button>
                          </Form>
                        )}
                      </InlineStack>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
