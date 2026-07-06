import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  Divider,
  Box,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getTrialDaysRemaining, isTrialExpired } from "~/utils/planCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    pendingCount,
    todayShiftCount,
    todayRefunds,
    customerWarnings,
    recentAudit,
    recentShifts,
  ] = await Promise.all([
    prisma.pendingItem.count({ where: { storeId: store.id, resolvedAt: null } }),
    prisma.shiftNote.count({ where: { storeId: store.id, createdAt: { gte: today } } }),
    prisma.auditLog.findMany({
      where: { storeId: store.id, actionType: "REFUND_ISSUED", detectedAt: { gte: today } },
    }),
    prisma.customerNote.count({ where: { storeId: store.id, isWarning: true } }),
    prisma.auditLog.findMany({
      where: { storeId: store.id },
      orderBy: { detectedAt: "desc" },
      take: 8,
      include: { staffMember: true },
    }),
    prisma.shiftNote.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { staffMember: true },
    }),
  ]);

  const totalRefundedToday = todayRefunds.reduce(
    (sum, r) => sum + ((r.metadata as any)?.amount ?? 0),
    0
  );

  const trialDaysRemaining = getTrialDaysRemaining(store);

  // Review prompt: 14+ days old AND 5+ shift notes
  const daysSinceInstall = (Date.now() - new Date(store.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const showReviewPrompt = daysSinceInstall >= 14 && (await prisma.shiftNote.count({ where: { storeId: store.id } })) >= 5;

  return json({
    store: {
      planTier: store.planTier,
      ownerName: store.ownerName,
      trialDaysRemaining,
      createdAt: store.createdAt.toISOString(),
    },
    showReviewPrompt,
    staffMember,
    pendingCount,
    todayShiftCount,
    todayRefundCount: todayRefunds.length,
    totalRefundedToday,
    customerWarnings,
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      actionType: a.actionType,
      resourceLabel: a.resourceLabel,
      staffName: a.staffMember?.name ?? "System",
      detectedAt: a.detectedAt.toISOString(),
    })),
    recentShifts: recentShifts.map((s) => ({
      id: s.id,
      summary: s.summary,
      staffName: s.staffMember.name,
      needsOwner: s.needsOwner,
      createdAt: s.createdAt.toISOString(),
    })),
  });
};

function actionLabel(type: string) {
  const labels: Record<string, string> = {
    REFUND_ISSUED: "Refund issued",
    ORDER_EDITED: "Order edited",
    ORDER_CANCELLED: "Order cancelled",
    PRODUCT_PRICE_CHANGED: "Price changed",
    PRODUCT_STOCK_CHANGED: "Stock changed",
    DISCOUNT_APPLIED: "Discount applied",
    CUSTOMER_TAGGED: "Customer tagged",
    NOTE_ADDED: "Note added",
    FULFILLMENT_UPDATED: "Fulfillment updated",
  };
  return labels[type] ?? type;
}

function actionBadgeTone(type: string): "critical" | "warning" | "info" | "success" {
  if (type === "REFUND_ISSUED" || type === "ORDER_CANCELLED") return "critical";
  if (type === "PRODUCT_PRICE_CHANGED") return "warning";
  return "info";
}

export default function Dashboard() {
  const {
    store,
    staffMember,
    pendingCount,
    todayShiftCount,
    todayRefundCount,
    totalRefundedToday,
    customerWarnings,
    recentAudit,
    recentShifts,
    showReviewPrompt,
  } = useLoaderData<typeof loader>();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <Page
      title={`${greeting()}, ${staffMember?.name ?? store.ownerName ?? "there"}`}
      subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      primaryAction={
        <Button url="/app/shifts" variant="primary">
          Write shift note
        </Button>
      }
    >
      <Layout>
        {store.planTier === "TRIAL" && store.trialDaysRemaining <= 3 && store.trialDaysRemaining > 0 && (
          <Layout.Section>
            <Banner
              title={`Your free trial ends in ${store.trialDaysRemaining} day${store.trialDaysRemaining !== 1 ? "s" : ""}`}
              tone="critical"
              action={{ content: "Choose a plan", url: "/app/settings/billing" }}
            >
              <p>Upgrade now to keep your shift notes, annotations, and audit log.</p>
            </Banner>
          </Layout.Section>
        )}

        {store.planTier === "TRIAL" && store.trialDaysRemaining > 3 && store.trialDaysRemaining <= 5 && (
          <Layout.Section>
            <Banner
              title={`${store.trialDaysRemaining} days left in your free trial`}
              tone="warning"
              action={{ content: "See plans", url: "/app/settings/billing" }}
            >
              <p>Your trial ends soon. Choose a plan to keep access to all your data.</p>
            </Banner>
          </Layout.Section>
        )}

        {showReviewPrompt && (
          <Layout.Section>
            <Banner
              title="Loving ShiftLog? A quick review helps us keep building."
              tone="info"
              action={{
                content: "Leave a review — takes 30 seconds",
                url: "https://apps.shopify.com/shiftlog#modal-show=ReviewListingModal",
                target: "_blank",
              }}
              onDismiss={() => {}}
            >
              <p>Your feedback helps other store owners discover ShiftLog.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Summary Cards */}
        <Layout.Section>
          <InlineGrid columns={4} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Pending items</Text>
                <Text as="p" variant="headingXl" tone={pendingCount > 0 ? "critical" : undefined}>
                  {pendingCount}
                </Text>
                <Button url="/app/pending" size="slim" variant="plain">
                  View all
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Shift notes today</Text>
                <Text as="p" variant="headingXl">{todayShiftCount}</Text>
                <Button url="/app/shifts" size="slim" variant="plain">
                  View shifts
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Refunds today</Text>
                <Text as="p" variant="headingXl" tone={todayRefundCount > 0 ? "critical" : undefined}>
                  {todayRefundCount}
                </Text>
                {todayRefundCount > 0 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    ${totalRefundedToday.toFixed(2)} total
                  </Text>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Customer warnings</Text>
                <Text as="p" variant="headingXl" tone={customerWarnings > 0 ? "warning" : undefined}>
                  {customerWarnings}
                </Text>
                <Button url="/app/customers" size="slim" variant="plain">
                  View customers
                </Button>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={2} gap="400">
            {/* Recent Activity */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent activity</Text>
                  <Button url="/app/audit" size="slim" variant="plain">View audit log</Button>
                </InlineStack>
                <Divider />
                {recentAudit.length === 0 ? (
                  <Text as="p" tone="subdued">No activity logged yet. Activity appears here automatically when staff take actions in your store.</Text>
                ) : (
                  <BlockStack gap="300">
                    {recentAudit.map((entry) => (
                      <InlineStack key={entry.id} align="space-between" gap="200">
                        <BlockStack gap="100">
                          <InlineStack gap="200">
                            <Badge tone={actionBadgeTone(entry.actionType)}>
                              {actionLabel(entry.actionType)}
                            </Badge>
                          </InlineStack>
                          <Text as="p" variant="bodySm">{entry.resourceLabel}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {entry.staffName} · {timeAgo(entry.detectedAt)}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Recent Shift Notes */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent shift notes</Text>
                  <Button url="/app/shifts" size="slim" variant="plain">View all</Button>
                </InlineStack>
                <Divider />
                {recentShifts.length === 0 ? (
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">No shift notes yet. Ask your team to submit their first note.</Text>
                    <Button url="/app/shifts" variant="primary">Write first note</Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    {recentShifts.map((note) => (
                      <Box key={note.id} borderWidth="025" borderColor="border" borderRadius="200" padding="300">
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <InlineStack gap="200">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{note.staffName}</Text>
                              {note.needsOwner && (
                                <Badge tone="critical">Needs attention</Badge>
                              )}
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="subdued">{timeAgo(note.createdAt)}</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {note.summary.length > 100
                              ? note.summary.slice(0, 100) + "…"
                              : note.summary}
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
      </Layout>
    </Page>
  );
}
