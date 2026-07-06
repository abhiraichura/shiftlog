import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
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
  Select,
  Checkbox,
  Banner,
  Divider,
  Modal,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { hasPlanFeature } from "~/utils/planCheck.server";
import { PLAN_DISPLAY_NAMES } from "~/utils/plans";

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Europe/London", value: "Europe/London" },
  { label: "Europe/Paris", value: "Europe/Paris" },
  { label: "Europe/Berlin", value: "Europe/Berlin" },
  { label: "Asia/Dubai", value: "Asia/Dubai" },
  { label: "Asia/Karachi", value: "Asia/Karachi" },
  { label: "Asia/Kolkata", value: "Asia/Kolkata" },
  { label: "Asia/Singapore", value: "Asia/Singapore" },
  { label: "Asia/Tokyo", value: "Asia/Tokyo" },
  { label: "Australia/Sydney", value: "Australia/Sydney" },
  { label: "America/New_York", value: "America/New_York" },
  { label: "America/Chicago", value: "America/Chicago" },
  { label: "America/Los_Angeles", value: "America/Los_Angeles" },
  { label: "America/Toronto", value: "America/Toronto" },
  { label: "America/Sao_Paulo", value: "America/Sao_Paulo" },
];

const DIGEST_TIMES = Array.from({ length: 24 }, (_, h) => {
  const label = `${String(h).padStart(2, "0")}:00`;
  return { label, value: label };
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );
  return json({
    store: {
      shop: store.shop,
      timezone: store.timezone,
      digestTime: store.digestTime,
      digestEnabled: store.digestEnabled,
      slackWebhookUrl: store.slackWebhookUrl,
      whatsappNumber: store.whatsappNumber,
      ownerEmail: store.ownerEmail,
      ownerName: store.ownerName,
      planTier: store.planTier,
    },
    canSlack: hasPlanFeature(store.planTier, "slack"),
    canWhatsApp: hasPlanFeature(store.planTier, "whatsapp"),
    isOwner: staffMember?.role === "OWNER",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );
  if (staffMember?.role !== "OWNER") {
    return json({ error: "Only the owner can change settings" }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_general") {
    await prisma.store.update({
      where: { id: store.id },
      data: {
        timezone: (formData.get("timezone") as string) || "UTC",
        digestTime: (formData.get("digestTime") as string) || "09:00",
        digestEnabled: formData.get("digestEnabled") === "true",
        ownerEmail: (formData.get("ownerEmail") as string)?.trim() || store.ownerEmail,
      },
    });
    return json({ success: true, message: "Settings saved" });
  }

  if (intent === "save_integrations") {
    const updates: any = {};
    if (hasPlanFeature(store.planTier, "slack")) {
      updates.slackWebhookUrl = (formData.get("slackWebhookUrl") as string)?.trim() || null;
    }
    if (hasPlanFeature(store.planTier, "whatsapp")) {
      updates.whatsappNumber = (formData.get("whatsappNumber") as string)?.trim() || null;
    }
    await prisma.store.update({ where: { id: store.id }, data: updates });
    return json({ success: true, message: "Integrations saved" });
  }

  if (intent === "delete_all_data") {
    const confirmText = (formData.get("confirmText") as string)?.trim();
    const shopName = store.shop.replace(".myshopify.com", "");
    if (confirmText !== shopName) {
      return json({ error: `Type "${shopName}" exactly to confirm.` }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.shiftNoteComment.deleteMany({ where: { storeId: store.id } }),
      prisma.shiftNote.deleteMany({ where: { storeId: store.id } }),
      prisma.orderAnnotation.deleteMany({ where: { storeId: store.id } }),
      prisma.customerNote.deleteMany({ where: { storeId: store.id } }),
      prisma.supplierNote.deleteMany({ where: { storeId: store.id } }),
      prisma.supplier.deleteMany({ where: { storeId: store.id } }),
      prisma.auditLog.deleteMany({ where: { storeId: store.id } }),
      prisma.pendingItem.deleteMany({ where: { storeId: store.id } }),
      prisma.digestLog.deleteMany({ where: { storeId: store.id } }),
      prisma.staffMember.updateMany({
        where: { storeId: store.id, role: { not: "OWNER" } },
        data: { isActive: false },
      }),
      prisma.store.update({
        where: { id: store.id },
        data: { onboardingDone: false },
      }),
    ]);
    return json({ success: true, message: "All data deleted. Your account has been reset." });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function SettingsPage() {
  const { store, canSlack, canWhatsApp, isOwner } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [timezone, setTimezone] = useState(store.timezone);
  const [digestTime, setDigestTime] = useState(store.digestTime);
  const [digestEnabled, setDigestEnabled] = useState(store.digestEnabled);
  const [ownerEmail, setOwnerEmail] = useState(store.ownerEmail);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(store.slackWebhookUrl ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(store.whatsappNumber ?? "");
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const shopName = store.shop.replace(".myshopify.com", "");

  return (
    <Page title="Settings" subtitle={`Current plan: ${PLAN_DISPLAY_NAMES[store.planTier] ?? store.planTier}`}>
      <Layout>
        {actionData && "success" in actionData && (
          <Layout.Section>
            <Banner tone="success">{"message" in actionData ? String(actionData.message) : "Saved"}</Banner>
          </Layout.Section>
        )}
        {actionData && "error" in actionData && (
          <Layout.Section>
            <Banner tone="critical">{"error" in actionData ? String(actionData.error) : "Error"}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save_general" />
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">General settings</Text>
                <Divider />
                <TextField label="Digest email address" name="ownerEmail" type="email" value={ownerEmail} onChange={setOwnerEmail} autoComplete="email" helpText="The daily summary email is sent here." disabled={!isOwner} />
                <Select label="Store timezone" name="timezone" options={TIMEZONES} value={timezone} onChange={setTimezone} disabled={!isOwner} />
                <Select label="Daily digest time" name="digestTime" options={DIGEST_TIMES} value={digestTime} onChange={setDigestTime} helpText="Time in your timezone when the daily email is sent." disabled={!isOwner} />
                <input type="hidden" name="digestEnabled" value={digestEnabled ? "true" : "false"} />
                <Checkbox label="Enable daily digest email" checked={digestEnabled} onChange={setDigestEnabled} disabled={!isOwner} helpText="Uncheck to pause the daily summary." />
                {isOwner && <Button submit variant="primary" loading={isSubmitting}>Save settings</Button>}
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="save_integrations" />
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Integrations</Text>
                  {!canSlack && <Badge tone="warning">Agency plan required</Badge>}
                </InlineStack>
                <Divider />
                {canSlack ? (
                  <TextField label="Slack webhook URL" name="slackWebhookUrl" value={slackWebhookUrl} onChange={setSlackWebhookUrl} autoComplete="off" placeholder="https://hooks.slack.com/services/..." helpText="Posts urgent alerts and daily digest to a Slack channel." disabled={!isOwner} />
                ) : (
                  <BlockStack gap="100">
                    <Text as="p" tone="subdued">Slack alerts require the Agency plan.</Text>
                    <Button url="/app/settings/billing" variant="plain" size="slim">Upgrade to Agency</Button>
                  </BlockStack>
                )}
                {canWhatsApp ? (
                  <TextField label="WhatsApp number for urgent alerts" name="whatsappNumber" value={whatsappNumber} onChange={setWhatsappNumber} autoComplete="off" placeholder="+971501234567" helpText="Receive a WhatsApp when any item is marked urgent. Include country code." disabled={!isOwner} />
                ) : (
                  <Text as="p" tone="subdued">WhatsApp alerts require the Agency plan.</Text>
                )}
                {isOwner && (canSlack || canWhatsApp) && <Button submit variant="primary" loading={isSubmitting}>Save integrations</Button>}
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Store info</Text>
              <Divider />
              <InlineStack align="space-between"><Text as="p" tone="subdued">Store</Text><Text as="p">{store.shop}</Text></InlineStack>
              <InlineStack align="space-between"><Text as="p" tone="subdued">Owner</Text><Text as="p">{store.ownerName ?? "—"}</Text></InlineStack>
              <InlineStack align="space-between"><Text as="p" tone="subdued">Plan</Text><Badge>{store.planTier}</Badge></InlineStack>
              <Button url="/app/settings/billing">Manage billing →</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {isOwner && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd" tone="critical">Danger Zone</Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" fontWeight="semibold">Delete all store data</Text>
                  <Text as="p" tone="subdued">Permanently deletes all shift notes, order annotations, customer notes, supplier notes, audit logs, and pending items. Cannot be undone. Your Shopify account and subscription are unaffected.</Text>
                  <Button tone="critical" onClick={() => setShowDangerModal(true)}>Delete all data</Button>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>

      <Modal
        open={showDangerModal}
        onClose={() => { setShowDangerModal(false); setConfirmText(""); }}
        title="Delete all store data"
        primaryAction={{
          content: "Permanently delete all data",
          destructive: true,
          disabled: confirmText !== shopName || isSubmitting,
          loading: isSubmitting,
          onAction: () => { (document.getElementById("danger-form") as HTMLFormElement)?.submit(); },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setShowDangerModal(false); setConfirmText(""); } }]}
      >
        <Modal.Section>
          <Form method="post" id="danger-form">
            <input type="hidden" name="intent" value="delete_all_data" />
            <BlockStack gap="400">
              <Banner tone="critical">
                <p>This will <strong>permanently delete</strong> all operational data for <strong>{shopName}</strong>. This cannot be undone.</p>
              </Banner>
              <TextField label={`Type "${shopName}" to confirm`} value={confirmText} onChange={setConfirmText} name="confirmText" autoComplete="off" placeholder={shopName} />
            </BlockStack>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
