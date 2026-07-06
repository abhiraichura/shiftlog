import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";
import { useLoaderData, Form } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  EmptyState,
  TextField,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

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

  const orderMap = new Map<
    string,
    {
      shopifyOrderId: string;
      orderNumber: string;
      count: number;
      lastNote: string;
      lastDate: string;
      hasFlagged: boolean;
    }
  >();

  for (const a of annotations) {
    const existing = orderMap.get(a.shopifyOrderId);
    if (!existing) {
      orderMap.set(a.shopifyOrderId, {
        shopifyOrderId: a.shopifyOrderId,
        orderNumber: a.orderNumber,
        count: 1,
        lastNote: a.note,
        lastDate: a.createdAt.toISOString(),
        hasFlagged: a.needsOwner && !a.resolvedAt,
      });
    } else {
      existing.count++;
      if (!a.resolvedAt && a.needsOwner) existing.hasFlagged = true;
    }
  }

  return json({
    orders: Array.from(orderMap.values()),
    search,
    shop: store.shop,
  });
};

export default function OrdersPage() {
  const { orders, search, shop } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState(search);

  return (
    <Page
      title="Order Notes"
      subtitle="Orders your team has added notes to."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Form method="get">
                <InlineStack gap="200">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Search orders"
                      name="q"
                      value={searchValue}
                      onChange={setSearchValue}
                      placeholder="Search by order number…"
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
                  <p>Open any order in your Shopify admin and use the ShiftLog panel to add notes.</p>
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
                    { title: "" },
                  ]}
                >
                  {orders.map((order, i) => (
                    <IndexTable.Row key={order.shopifyOrderId} id={order.shopifyOrderId} position={i}>
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">{order.orderNumber}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge>{String(order.count)}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {order.hasFlagged ? (
                          <Badge tone="critical">Flagged</Badge>
                        ) : (
                          <Badge tone="success">Clear</Badge>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {order.lastNote.length > 60 ? order.lastNote.slice(0, 60) + "…" : order.lastNote}
                        </Text>
                        <br />
                        <Text as="span" variant="bodySm" tone="subdued">
                          {timeAgo(order.lastDate)}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Button
                          size="slim"
                          url={`https://${shop}/admin/orders/${order.shopifyOrderId.replace("gid://shopify/Order/", "")}`}
                          target="_blank"
                        >
                          Open in Shopify
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
