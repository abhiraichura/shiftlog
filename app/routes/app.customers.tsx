import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, IndexTable, Text, Badge,
  Button, EmptyState, BlockStack, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  const notes = await prisma.customerNote.findMany({
    where: { storeId: store.id },
    orderBy: [{ isWarning: "desc" }, { createdAt: "desc" }],
    include: { staffMember: true },
  });

  const customerMap = new Map<string, {
    shopifyCustomerId: string;
    customerName: string;
    customerEmail: string | null;
    hasWarning: boolean;
    noteCount: number;
    lastNote: string;
    lastDate: string;
    lastStaff: string;
  }>();

  for (const n of notes) {
    const existing = customerMap.get(n.shopifyCustomerId);
    if (!existing) {
      customerMap.set(n.shopifyCustomerId, {
        shopifyCustomerId: n.shopifyCustomerId,
        customerName: n.customerName,
        customerEmail: n.customerEmail,
        hasWarning: n.isWarning,
        noteCount: 1,
        lastNote: n.note,
        lastDate: n.createdAt.toISOString(),
        lastStaff: n.staffMember.name,
      });
    } else {
      existing.noteCount++;
      if (n.isWarning) existing.hasWarning = true;
    }
  }

  const numericId = (gid: string) => gid.replace("gid://shopify/Customer/", "");

  return json({
    customers: Array.from(customerMap.values()),
    shop: store.shop,
    numericIdMap: Object.fromEntries(
      Array.from(customerMap.values()).map((c) => [c.shopifyCustomerId, numericId(c.shopifyCustomerId)])
    ),
  });
};

export default function CustomersPage() {
  const { customers, shop, numericIdMap } = useLoaderData<typeof loader>();
  const warningCount = customers.filter((c) => c.hasWarning).length;

  return (
    <Page
      title="Customer Notes"
      subtitle="Internal notes on customers. Warning customers are shown first."
    >
      <Layout>
        {warningCount > 0 && (
          <Layout.Section>
            <Banner
              tone="warning"
              title={`${warningCount} customer${warningCount !== 1 ? "s" : ""} flagged with warnings`}
            >
              <p>Warning customers show a red alert in the ShiftLog panel when their profile is opened by any staff member.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            {customers.length === 0 ? (
              <div style={{ padding: "2rem" }}>
                <EmptyState
                  heading="No customer notes yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Open any customer in Shopify admin, click <strong>+ Block</strong> and add <strong>ShiftLog — Customer Notes</strong>. Notes appear here automatically.</p>
                </EmptyState>
              </div>
            ) : (
              <IndexTable
                resourceName={{ singular: "customer", plural: "customers" }}
                itemCount={customers.length}
                selectable={false}
                headings={[
                  { title: "Customer" },
                  { title: "Email" },
                  { title: "Status" },
                  { title: "Notes" },
                  { title: "Last note" },
                  { title: "By" },
                  { title: "" },
                ]}
              >
                {customers.map((customer, i) => (
                  <IndexTable.Row
                    key={customer.shopifyCustomerId}
                    id={customer.shopifyCustomerId}
                    position={i}
                    tone={customer.hasWarning ? "critical" : undefined}
                  >
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">{customer.customerName}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {customer.customerEmail ?? "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {customer.hasWarning ? (
                        <Badge tone="critical">⚠ Warning</Badge>
                      ) : (
                        <Badge tone="info">Note</Badge>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge>{String(customer.noteCount)}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {customer.lastNote.length > 50
                          ? customer.lastNote.slice(0, 50) + "…"
                          : customer.lastNote}
                        <br />
                        {timeAgo(customer.lastDate)}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">{customer.lastStaff}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button
                        size="slim"
                        url={`https://${shop}/admin/customers/${numericIdMap[customer.shopifyCustomerId]}`}
                        target="_blank"
                      >
                        Open in Shopify
                      </Button>
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
