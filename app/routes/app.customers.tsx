import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  EmptyState,
  BlockStack,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  const notes = await prisma.customerNote.findMany({
    where: { storeId: store.id },
    orderBy: [{ isWarning: "desc" }, { createdAt: "desc" }],
    include: { staffMember: true },
  });

  // Group by customer
  const customerMap = new Map<
    string,
    {
      shopifyCustomerId: string;
      customerName: string;
      customerEmail: string | null;
      hasWarning: boolean;
      noteCount: number;
      lastNote: string;
      lastDate: string;
    }
  >();

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
      });
    } else {
      existing.noteCount++;
      if (n.isWarning) existing.hasWarning = true;
    }
  }

  return json({
    customers: Array.from(customerMap.values()),
    shop: store.shop,
  });
};

export default function CustomersPage() {
  const { customers, shop } = useLoaderData<typeof loader>();

  const warningCount = customers.filter((c) => c.hasWarning).length;

  return (
    <Page
      title="Customer Notes"
      subtitle="Customers with internal notes. Warning customers are shown first."
    >
      <Layout>
        {warningCount > 0 && (
          <Layout.Section>
            <Banner tone="warning" title={`${warningCount} customer${warningCount !== 1 ? "s" : ""} flagged with warnings`}>
              <p>Warning customers are highlighted to alert all staff when their profile is opened.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            {customers.length === 0 ? (
              <EmptyState
                heading="No customer notes yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Open any customer profile in your Shopify admin and use the ShiftLog panel to
                  add notes or flag customers as warnings.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "customer", plural: "customers" }}
                itemCount={customers.length}
                selectable={false}
                headings={[
                  { title: "Customer" },
                  { title: "Status" },
                  { title: "Notes" },
                  { title: "Last note" },
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
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">{customer.customerName}</Text>
                        {customer.customerEmail && (
                          <Text as="span" variant="bodySm" tone="subdued">{customer.customerEmail}</Text>
                        )}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {customer.hasWarning ? (
                        <Badge tone="critical">⚠ Warning</Badge>
                      ) : (
                        <Badge>Note</Badge>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge>{String(customer.noteCount)}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {customer.lastNote.length > 60
                          ? customer.lastNote.slice(0, 60) + "…"
                          : customer.lastNote}
                      </Text>
                      <br />
                      <Text as="span" variant="bodySm" tone="subdued">{timeAgo(customer.lastDate)}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button
                        size="slim"
                        url={`https://${shop}/admin/customers/${customer.shopifyCustomerId.replace("gid://shopify/Customer/", "")}`}
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
