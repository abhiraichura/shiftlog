import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Divider, Box, InlineGrid, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { getTrialDaysRemaining } from "~/utils/planCheck.server";
import { timeAgo } from "~/utils/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    pendingCount, todayShiftCount, todayRefunds,
    customerWarnings, recentAudit, recentShifts, totalShiftNotes,
  ] = await Promise.all([
    prisma.pendingItem.count({ where: { storeId: store.id, resolvedAt: null } }),
    prisma.shiftNote.count({ where: { storeId: store.id, createdAt: { gte: today } } }),
    prisma.auditLog.findMany({ where: { storeId: store.id, actionType: "REFUND_ISSUED", detectedAt: { gte: today } } }),
    prisma.customerNote.count({ where: { storeId: store.id, isWarning: true } }),
    prisma.auditLog.findMany({ where: { storeId: store.id }, orderBy: { detectedAt: "desc" }, take: 6, include: { staffMember: true } }),
    prisma.shiftNote.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 4, include: { staffMember: true } }),
    prisma.shiftNote.count({ where: { storeId: store.id } }),
  ]);

  const totalRefundedToday = todayRefunds.reduce((sum, r) => sum + ((r.metadata as any)?.amount ?? 0), 0);
  const trialDaysRemaining = getTrialDaysRemaining(store);
  const daysSince = (Date.now() - new Date(store.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const showReviewPrompt = store.onboardingDone && daysSince >= 14 && totalShiftNotes >= 5;

  return json({
    store: { planTier: store.planTier, ownerName: store.ownerName, trialDaysRemaining },
    staffMember: staffMember ? { name: staffMember.name, role: staffMember.role } : null,
    pendingCount, todayShiftCount,
    todayRefundCount: todayRefunds.length, totalRefundedToday,
    customerWarnings, showReviewPrompt,
    recentAudit: recentAudit.map((a) => ({
      id: a.id, actionType: a.actionType, resourceLabel: a.resourceLabel,
      staffName: a.staffMember?.name ?? "System", detectedAt: a.detectedAt.toISOString(),
    })),
    recentShifts: recentShifts.map((s) => ({
      id: s.id, summary: s.summary, staffName: s.staffMember.name,
      needsOwner: s.needsOwner, resolvedAt: s.resolvedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
};

const ACTION_TONES: Record<string, "critical" | "warning" | "info" | "success"> = {
  REFUND_ISSUED: "critical", ORDER_CANCELLED: "critical",
  PRODUCT_PRICE_CHANGED: "warning", DISCOUNT_APPLIED: "warning",
  ORDER_EDITED: "info", FULFILLMENT_UPDATED: "success",
  NOTE_ADDED: "info", CUSTOMER_TAGGED: "info", PRODUCT_STOCK_CHANGED: "warning",
};
const ACTION_LABELS: Record<string, string> = {
  REFUND_ISSUED: "Refund issued", ORDER_CANCELLED: "Order cancelled",
  PRODUCT_PRICE_CHANGED: "Price changed", ORDER_EDITED: "Order edited",
  FULFILLMENT_UPDATED: "Fulfilled", NOTE_ADDED: "Note added",
  DISCOUNT_APPLIED: "Discount applied", CUSTOMER_TAGGED: "Customer tagged",
};

export default function Dashboard() {
  const {
    store, staffMember, pendingCount, todayShiftCount,
    todayRefundCount, totalRefundedToday, customerWarnings,
    showReviewPrompt, recentAudit, recentShifts,
  } = useLoaderData<typeof loader>();

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = staffMember?.name?.split(" ")[0] ?? store.ownerName?.split(" ")[0] ?? "there";
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <Page>
      <Layout>
        {store.planTier === "TRIAL" && store.trialDaysRemaining <= 5 && (
          <Layout.Section>
            <Banner
              tone={store.trialDaysRemaining <= 2 ? "critical" : "warning"}
              title={`${store.trialDaysRemaining} day${store.trialDaysRemaining !== 1 ? "s" : ""} left in your free trial`}
              action={{ content: "Choose a plan", url: "/app/settings/billing" }}
              onDismiss={() => {}}
            >
              <p>Upgrade to keep your data and all features.</p>
            </Banner>
          </Layout.Section>
        )}

        {showReviewPrompt && (
          <Layout.Section>
            <Banner
              tone="info"
              title="Enjoying ShiftLog? A quick review helps us keep building."
              action={{ content: "Leave a review ⭐", url: "https://apps.shopify.com/shiftlog-team-operations-log#modal-show=ReviewListingModal", target: "_blank" }}
              onDismiss={() => {}}
            />
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack align="space-between" blockAlignment="center">
            <BlockStack gap="100">
              <Text as="h1" variant="headingXl">{greeting}, {name} 👋</Text>
              <Text as="p" tone="subdued">{todayStr}</Text>
            </BlockStack>
            <Button url="/app/shifts" variant="primary" size="large">Write shift note</Button>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={4} gap="400">
            {[
              { label: "Pending items", value: pendingCount, tone: pendingCount > 0 ? "critical" : undefined, sub: pendingCount > 0 ? "Need attention" : "All clear ✓", url: "/app/pending" },
              { label: "Shift notes today", value: todayShiftCount, sub: todayShiftCount === 0 ? "None submitted" : "Submitted today", url: "/app/shifts" },
              { label: "Refunds today", value: todayRefundCount, tone: todayRefundCount > 0 ? "critical" : undefined, sub: todayRefundCount > 0 ? `$${totalRefundedToday.toFixed(2)} total` : "No refunds" },
              { label: "Customer warnings", value: customerWarnings, tone: customerWarnings > 0 ? "warning" : undefined, sub: customerWarnings > 0 ? "Flagged" : "None", url: "/app/customers" },
            ].map((stat) => (
              <Card key={stat.label}>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">{stat.label}</Text>
                  <Text as="p" variant="heading2xl" tone={stat.tone as any}>{stat.value}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{stat.sub}</Text>
                  {stat.url && <Button url={stat.url} variant="plain" size="slim">View →</Button>}
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={2} gap="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent activity</Text>
                  <Button url="/app/audit" variant="plain" size="slim">Audit log →</Button>
                </InlineStack>
                <Divider />
                {recentAudit.length === 0 ? (
                  <Text as="p" tone="subdued">Activity appears automatically when staff process orders, refunds, and more.</Text>
                ) : (
                  <BlockStack gap="300">
                    {recentAudit.map((e) => (
                      <InlineStack key={e.id} align="space-between" blockAlignment="start">
                        <InlineStack gap="200" blockAlignment="start">
                          <Badge tone={ACTION_TONES[e.actionType] ?? "info"}>
                            {ACTION_LABELS[e.actionType] ?? e.actionType}
                          </Badge>
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm">{e.resourceLabel}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{e.staffName}</Text>
                          </BlockStack>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">{timeAgo(e.detectedAt)}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent shift notes</Text>
                  <Button url="/app/shifts" variant="plain" size="slim">View all →</Button>
                </InlineStack>
                <Divider />
                {recentShifts.length === 0 ? (
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">No shift notes yet. Ask your team to submit their first note at the end of each shift.</Text>
                    <Button url="/app/shifts" variant="primary">Write first note</Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="200">
                    {recentShifts.map((note) => (
                      <Box
                        key={note.id}
                        background={note.needsOwner && !note.resolvedAt ? "bg-surface-critical-subdued" : "bg-surface-secondary"}
                        borderRadius="200"
                        padding="300"
                      >
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <InlineStack gap="200">
                              <Text as="span" fontWeight="semibold" variant="bodySm">{note.staffName}</Text>
                              {note.needsOwner && !note.resolvedAt && <Badge tone="critical">Needs attention</Badge>}
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="subdued">{timeAgo(note.createdAt)}</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {note.summary.length > 90 ? note.summary.slice(0, 90) + "…" : note.summary}
                          </Text>
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Quick actions</Text>
              <Divider />
              <InlineStack gap="300" wrap>
                <Button url="/app/shifts">📝 Write shift note</Button>
                <Button url="/app/pending">⚠️ View pending items</Button>
                <Button url="/app/suppliers">🏭 Supplier notes</Button>
                <Button url="/app/team">👥 Invite staff</Button>
                <Button url="/app/settings/billing">💳 Manage billing</Button>
                <Button url="/app/settings">⚙️ Settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
