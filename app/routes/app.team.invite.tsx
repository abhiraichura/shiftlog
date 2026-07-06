import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Select,
  Button,
  Banner,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { canInviteMoreStaff } from "~/utils/planCheck.server";
import { sendInviteEmail } from "~/utils/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  if (!staffMember || staffMember.role !== "OWNER") {
    throw redirect("/app/team");
  }

  const activeCount = await prisma.staffMember.count({
    where: { storeId: store.id, isActive: true },
  });

  if (!canInviteMoreStaff(store.planTier, activeCount)) {
    throw redirect("/app/team");
  }

  return json({
    storeName: store.shop.replace(".myshopify.com", ""),
    ownerName: store.ownerName ?? "The owner",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  if (!staffMember || staffMember.role !== "OWNER") {
    return json({ error: "Only the owner can invite staff" }, { status: 403 });
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as string) ?? "STAFF";

  if (!name || !email) {
    return json({ error: "Name and email are required" }, { status: 400 });
  }

  // Check if already a member
  const existing = await prisma.staffMember.findUnique({
    where: { storeId_email: { storeId: store.id, email } },
  });

  if (existing) {
    return json({ error: "This email is already a team member" }, { status: 400 });
  }

  const inviteToken = uuidv4();
  const inviteExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await prisma.staffMember.create({
    data: {
      storeId: store.id,
      name,
      email,
      role: role as any,
      inviteToken,
      inviteExpiresAt: inviteExpiry,
    },
  });

  const storeName = store.shop.replace(".myshopify.com", "");

  try {
    await sendInviteEmail({
      toEmail: email,
      toName: name,
      storeName,
      ownerName: store.ownerName ?? "The owner",
      inviteToken,
      inviteExpiresAt: inviteExpiry,
    });
  } catch (err) {
    console.error("Failed to send invite email:", err);
    // Don't fail — return invite link so owner can share manually
  }

  const inviteUrl = `${process.env.SHOPIFY_APP_URL}/invite/${inviteToken}`;
  return json({ success: true, inviteUrl, name });
};

export default function InvitePage() {
  const { storeName, ownerName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");

  return (
    <Page
      title="Invite Staff Member"
      backAction={{ content: "Team", url: "/app/team" }}
    >
      <Layout>
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              {"success" in (actionData ?? {}) && actionData && (
                <Banner tone="success" title="Invitation sent">
                  <BlockStack gap="200">
                    <p>
                      An invite email has been sent to the new team member. If they don't receive
                      it, share this link directly:
                    </p>
                    <Box
                      background="bg-surface-secondary"
                      padding="200"
                      borderRadius="200"
                    >
                      <Text as="p" variant="bodySm" breakWord>
                        {"inviteUrl" in actionData ? String(actionData.inviteUrl) : ""}
                      </Text>
                    </Box>
                    <Button url="/app/team/invite" variant="plain">Invite another</Button>
                  </BlockStack>
                </Banner>
              )}

              {"error" in (actionData ?? {}) && actionData && (
                <Banner tone="critical">
                  {"error" in actionData ? String(actionData.error) : ""}
                </Banner>
              )}

              {!("success" in (actionData ?? {})) && (
                <Form method="post">
                  <BlockStack gap="400">
                    <TextField
                      label="Name"
                      name="name"
                      value={name}
                      onChange={setName}
                      autoComplete="name"
                      requiredIndicator
                      helpText="This is how they'll appear in shift notes and logs."
                    />
                    <TextField
                      label="Email address"
                      name="email"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      autoComplete="email"
                      requiredIndicator
                      helpText="They'll receive an invite link at this address."
                    />
                    <Select
                      label="Role"
                      name="role"
                      options={[
                        { label: "Staff — can write notes, cannot see billing or resolve items", value: "STAFF" },
                        { label: "Manager — can write notes and resolve pending items", value: "MANAGER" },
                      ]}
                      value={role}
                      onChange={setRole}
                    />
                    <Button submit variant="primary" loading={isSubmitting}>
                      Send invitation
                    </Button>
                  </BlockStack>
                </Form>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">About roles</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">Staff</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Can write shift notes, add order and customer notes, view the shift log. Cannot see billing or resolve pending items.
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">Manager</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Everything Staff can do, plus: resolve pending items, view the full audit trail, deactivate staff members.
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">Owner</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Full access including billing, settings, and all staff management.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
