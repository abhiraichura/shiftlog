import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { useLoaderData } from "@remix-run/react";
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
  IndexTable,
  EmptyState,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { hasPlanFeature } from "~/utils/planCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const hasAccess = hasPlanFeature(store.planTier, "multistore");

  if (!hasAccess) {
    return json({ hasAccess: false, stores: [], crossStorePending: [], currentShop: store.shop });
  }

  // Find other stores linked to the same owner email
  const linkedStores = await prisma.store.findMany({
    where: {
      ownerEmail: store.ownerEmail,
      billingStatus: { not: "uninstalled" },
    },
    include: {
      staffMembers: { where: { isActive: true } },
      _count: { select: { pendingItems: { where: { resolvedAt: null } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Cross-store urgent pending items
  const storeIds = linkedStores.map((s) => s.id);
  const crossStorePending = await prisma.pendingItem.findMany({
    where: {
      storeId: { in: storeIds },
      resolvedAt: null,
      priority: "URGENT",
    },
    include: { store: true, createdBy: true },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  return json({
    hasAccess: true,
    currentShop: store.shop,
    stores: linkedStores.map((s) => ({
      id: s.id,
      shop: s.shop,
      ownerName: s.ownerName,
      planTier: s.planTier,
      isCurrentStore: s.shop === store.shop,
      activeStaffCount: s.staffMembers.length,
      pendingCount: s._count.pendingItems,
    })),
    crossStorePending: crossStorePending.map((p) => ({
      id: p.id,
      title: p.title,
      storeName: p.store.shop.replace(".myshopify.com", ""),
      flaggedBy: p.createdBy.name,
      createdAt: p.createdAt.toISOString(),
    })),
  });
};

export default function MultiStorePage() {
  const { hasAccess, stores, crossStorePending, currentShop } = useLoaderData<typeof loader>();

  if (!hasAccess) {
    return (
      <Page title="Multi-Store">
        <Layout>
          <Layout.Section>
            <Card>
              <Banner
                title="Multi-store management is available on the Agency plan"
                tone="info"
                action={{ content: "Upgrade to Agency", url: "/app/settings/billing" }}
              >
                <p>
                  The Agency plan ($129/month) lets you manage unlimited stores from a single
                  ShiftLog account, with a combined digest and cross-store pending items view.
                </p>
              </Banner>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Multi-Store"
      subtitle={`${stores.length} store${stores.length !== 1 ? "s" : ""} connected to your account`}
      primaryAction={{
        content: "Connect another store",
        url: "/auth?shop=",
        helpText: "Install ShiftLog on another store using the same owner email",
      }}
    >
      <Layout>
        {/* Cross-store urgent items */}
        {crossStorePending.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Urgent across all stores</Text>
                  <Badge tone="critical">{String(crossStorePending.length)}</Badge>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  {crossStorePending.map((p) => (
                    <InlineStack key={p.id} align="space-between">
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">{p.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {p.storeName} · flagged by {p.flaggedBy}
                        </Text>
                      </BlockStack>
                      <Badge tone="critical">Urgent</Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Store list */}
        <Layout.Section>
          <Card padding="0">
            {stores.length === 0 ? (
              <EmptyState
                heading="No stores connected"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{ content: "Connect a store", url: "/auth?shop=" }}
              >
                <p>Install ShiftLog on another Shopify store using the same owner email address to see it here.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "store", plural: "stores" }}
                itemCount={stores.length}
                selectable={false}
                headings={[
                  { title: "Store" },
                  { title: "Plan" },
                  { title: "Staff" },
                  { title: "Pending items" },
                  { title: "" },
                ]}
              >
                {stores.map((s, i) => (
                  <IndexTable.Row key={s.id} id={s.id} position={i}>
                    <IndexTable.Cell>
                      <InlineStack gap="200">
                        <Text as="span" fontWeight="semibold">
                          {s.shop.replace(".myshopify.com", "")}
                        </Text>
                        {s.isCurrentStore && <Badge tone="info">Current</Badge>}
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge>{s.planTier}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{s.activeStaffCount}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={s.pendingCount > 0 ? "critical" : "success"}>
                        {String(s.pendingCount)}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {!s.isCurrentStore ? (
                        <Button
                          size="slim"
                          url={`https://${s.shop}/admin/apps/shiftlog`}
                          target="_blank"
                        >
                          Open store
                        </Button>
                      ) : (
                        <Text as="span" variant="bodySm" tone="subdued">You are here</Text>
                      )}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
