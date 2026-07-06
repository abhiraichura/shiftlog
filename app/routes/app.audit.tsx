import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { formatDateTime, timeAgo } from "~/utils/helpers";
import { useLoaderData, Form } from "@remix-run/react";
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
  EmptyState,
  Pagination,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { hasPlanFeature } from "~/utils/planCheck.server";

const PAGE_SIZE = 50;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const hasAccess = hasPlanFeature(store.planTier, "audit");

  if (!hasAccess) {
    return json({
      hasAccess: false,
      logs: [],
      total: 0,
      page: 1,
      pages: 1,
      allStaff: [],
      canExport: false,
      filterAction: "",
      filterStaff: "",
      planTier: store.planTier,
    });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const filterAction = url.searchParams.get("action") ?? "";
  const filterStaff = url.searchParams.get("staff") ?? "";

  const where: any = { storeId: store.id };
  if (filterAction) where.actionType = filterAction;
  if (filterStaff) where.staffMemberId = filterStaff;

  const [total, logs, allStaff] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { staffMember: true },
    }),
    prisma.staffMember.findMany({
      where: { storeId: store.id },
      orderBy: { name: "asc" },
    }),
  ]);

  return json({
    hasAccess: true,
    logs: logs.map((l) => ({
      id: l.id,
      actionType: l.actionType,
      resourceType: l.resourceType,
      resourceLabel: l.resourceLabel,
      metadata: l.metadata,
      detectedAt: l.detectedAt.toISOString(),
      staffName: l.staffMember?.name ?? "System / Automatic",
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    allStaff: allStaff.map((s) => ({ id: s.id, name: s.name })),
    canExport: hasPlanFeature(store.planTier, "csvExport"),
    filterAction,
    filterStaff,
    planTier: store.planTier,
  });
};

const ACTION_LABELS: Record<string, string> = {
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

function actionTone(type: string): "critical" | "warning" | "info" | "success" {
  if (type === "REFUND_ISSUED" || type === "ORDER_CANCELLED") return "critical";
  if (type === "PRODUCT_PRICE_CHANGED" || type === "DISCOUNT_APPLIED") return "warning";
  if (type === "FULFILLMENT_UPDATED") return "success";
  return "info";
}

export default function AuditPage() {
  const {
    hasAccess,
    logs,
    total,
    page,
    pages,
    allStaff,
    canExport,
    filterAction,
    filterStaff,
    planTier,
  } = useLoaderData<typeof loader>();

  const actionOptions = [
    { label: "All actions", value: "" },
    ...Object.entries(ACTION_LABELS).map(([v, l]) => ({ label: l, value: v })),
  ];

  const staffOptions = [
    { label: "All staff", value: "" },
    ...allStaff.map((s) => ({ label: s.name, value: s.id })),
  ];

  if (!hasAccess) {
    return (
      <Page title="Audit Trail">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner
                  title="Audit trail is available on Team and Agency plans"
                  tone="info"
                  action={{ content: "Upgrade your plan", url: "/app/settings/billing" }}
                >
                  <p>
                    Upgrade to Team ($49/month) to see a complete, immutable record of every
                    refund, order edit, cancellation, and price change — with the staff member's
                    name, timestamp, and details.
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Audit Trail"
      subtitle={`${total} events logged. This record is immutable and cannot be edited or deleted.`}
      primaryAction={
        canExport ? (
          <Button url="/app/audit/export" variant="secondary">Export CSV</Button>
        ) : undefined
      }
    >
      <Layout>
        {/* Filters */}
        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineStack gap="300">
                <Select
                  label="Action"
                  options={actionOptions}
                  value={filterAction}
                  onChange={() => {}}
                  name="action"
                  labelHidden
                />
                <Select
                  label="Staff member"
                  options={staffOptions}
                  value={filterStaff}
                  onChange={() => {}}
                  name="staff"
                  labelHidden
                />
                <Button submit size="slim">Filter</Button>
                <Button url="/app/audit" size="slim" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            {logs.length === 0 ? (
              <Box padding="600">
                <EmptyState
                  heading="No audit events yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Events are automatically captured when staff process refunds, edit orders,
                    change prices, and more. They'll appear here within seconds.
                  </p>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: "event", plural: "events" }}
                itemCount={logs.length}
                selectable={false}
                headings={[
                  { title: "When" },
                  { title: "Staff" },
                  { title: "Action" },
                  { title: "Resource" },
                  { title: "Details" },
                ]}
              >
                {logs.map((log, i) => (
                  <IndexTable.Row key={log.id} id={log.id} position={i}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {formatDateTime(log.detectedAt)}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">{log.staffName}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={actionTone(log.actionType)}>
                        {ACTION_LABELS[log.actionType] ?? log.actionType}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">{log.resourceLabel}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {log.metadata
                          ? (() => {
                              const m = log.metadata as any;
                              if (m.amount) return `$${Number(m.amount).toFixed(2)}`;
                              if (m.reason) return m.reason;
                              if (m.oldPrice && m.newPrice) return `$${m.oldPrice} → $${m.newPrice}`;
                              return "—";
                            })()
                          : "—"}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>

          {pages > 1 && (
            <Box paddingBlockStart="400">
              <Pagination
                hasPrevious={page > 1}
                previousURL={`/app/audit?page=${page - 1}&action=${filterAction}&staff=${filterStaff}`}
                hasNext={page < pages}
                nextURL={`/app/audit?page=${page + 1}&action=${filterAction}&staff=${filterStaff}`}
                label={`Page ${page} of ${pages}`}
              />
            </Box>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
