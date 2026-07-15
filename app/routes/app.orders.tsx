import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { useState } from "react";
import {
  Page, Layout, Card, IndexTable, Text, Badge,
  Button, EmptyState, BlockStack, InlineStack, TextField,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? "";

  const annotations = await prisma.orderAnnotation.findMany({
    where: {
      storeId: store.id,
      ...(search ? { orderNumber: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { staffMember: true },
  });

  // Group by order - use orderNumber (e.g. #1001) as display, not GID
  const orderMap = new Map<string, {
    shopifyOrderId: string;
    orderNumber: string;
    count: number;
    lastNote: string;
    lastDate: string;
    lastStaff: string;
    hasFlagged: boolean;
    hasUnresolved: boolean;
  }>();

  for (const a of annotations) {
    const existing = orderMap.get(a.shopifyOrderId);
    if (!existing) {
      orderMap.set(a.shopifyOrderId, {
        shopifyOrderId: a.shopifyOrderId,
        orderNumber: a.orderNumber,
        count: 1,
        lastNote: a.note,
        lastDate: a.createdAt.toISOString(),
        lastStaff: a.staffMember.name,
        hasFlagged: a.needsOwner,
        hasUnresolved: a.needsOwner && !a.resolvedAt,
      });
    } else {
      existing.count++;
      if (a.needsOwner) existing.hasFlagged = true;
      if (a.needsOwner && !a.resolvedAt) existing.hasUnresolved = true;
    }
  }

  const numericId = (gid: string) => gid.replace("gid://shopify/Order/", "");

  return json({
    orders: Array.from(orderMap.values()),
    search,
    shop: store.shop,
    numericIdMap: Object.fromEntries(
      Array.from(orderMap.values()).map((o) => [o.shopifyOrderId, numericId(o.shopifyOrderId)])
    ),
  });
};

export default function OrdersPage() {
  const { orders, search, shop, numericIdMap } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState(search);

  return (
    <Page
      title="Order Notes"
      subtitle="Notes your team has added to orders via the ShiftLog panel on the order page."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Form method="get">
                <InlineStack gap="200">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Search"
                      name="q"
                      value={searchValue}
                      onChange={setSearchValue}
                      placeholder="Search by order number e.g. #1001"
                      autoComplete="off"
                      labelHidden
                    />
                  </div>
                  <Button submit>Search</Button>
                  {search && <Button url="/app/orders" variant="plain">Clear</Button>}
                </InlineStack>
              </Form>

              {orders.length === 0 ? (
                <EmptyState
                  heading="No order notes yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Open any order in Shopify admin, click <strong>+ Block</strong> and add <strong>ShiftLog — Order Notes</strong>. Notes appear here automatically.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "order", plural: "orders" }}
                  itemCount={orders.length}
                  selectable={false}
                  headings={[
                    { title: "Order" },
                    { title: "Notes" },
                    { title: "Status" },
                    { title: "Last note" },
                    { title: "By" },
                    { title: "" },
                  ]}
                >
                  {orders.map((order, i) => (
                    <IndexTable.Row
                      key={order.shopifyOrderId}
                      id={order.shopifyOrderId}
                      position={i}
                      tone={order.hasUnresolved ? "critical" : undefined}
                    >
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">
                          {order.orderNumber || `#${numericIdMap[order.shopifyOrderId]}`}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge>{String(order.count)}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {order.hasUnresolved ? (
                          <Badge tone="critical">Flagged — needs attention</Badge>
                        ) : order.hasFlagged ? (
                          <Badge tone="success">Resolved</Badge>
                        ) : (
                          <Badge tone="info">No flags</Badge>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {order.lastNote.length > 50 ? order.lastNote.slice(0, 50) + "…" : order.lastNote}
                          <br />
                          {timeAgo(order.lastDate)}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm">{order.lastStaff}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Button
                          size="slim"
                          url={`https://${shop}/admin/orders/${numericIdMap[order.shopifyOrderId]}`}
                          target="_blank"
                        >
                          Open order
                        </Button>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
