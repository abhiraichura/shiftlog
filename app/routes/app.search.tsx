import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { timeAgo } from "~/utils/helpers";
import { useLoaderData, Form } from "@remix-run/react";
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
  Banner,
  EmptyState,
  Divider,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { hasPlanFeature } from "~/utils/planCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  const hasAccess = hasPlanFeature(store.planTier, "search");
  if (!hasAccess) {
    return json({ hasAccess: false, results: null, query: "", planTier: store.planTier });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return json({ hasAccess: true, results: null, query: "", planTier: store.planTier });
  }

  const search = { contains: q, mode: "insensitive" as const };

  const [shifts, orders, customers, suppliers] = await Promise.all([
    prisma.shiftNote.findMany({
      where: {
        storeId: store.id,
        OR: [{ summary: search }, { whatWasDone: search }, { whatIsPending: search }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { staffMember: true },
    }),
    prisma.orderAnnotation.findMany({
      where: { storeId: store.id, note: search },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { staffMember: true },
    }),
    prisma.customerNote.findMany({
      where: {
        storeId: store.id,
        OR: [{ note: search }, { customerName: search }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { staffMember: true },
    }),
    prisma.supplierNote.findMany({
      where: { storeId: store.id, note: search },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { staffMember: true, supplier: true },
    }),
  ]);

  return json({
    hasAccess: true,
    query: q,
    planTier: store.planTier,
    results: {
      shifts: shifts.map((s) => ({
        id: s.id,
        text: s.summary,
        author: s.staffMember.name,
        date: s.createdAt.toISOString(),
        url: "/app/shifts",
      })),
      orders: orders.map((o) => ({
        id: o.id,
        text: o.note,
        label: o.orderNumber,
        author: o.staffMember.name,
        date: o.createdAt.toISOString(),
        url: "/app/orders",
      })),
      customers: customers.map((c) => ({
        id: c.id,
        text: c.note,
        label: c.customerName,
        author: c.staffMember.name,
        date: c.createdAt.toISOString(),
        url: "/app/customers",
        isWarning: c.isWarning,
      })),
      suppliers: suppliers.map((s) => ({
        id: s.id,
        text: s.note,
        label: s.supplier.name,
        author: s.staffMember.name,
        date: s.createdAt.toISOString(),
        url: `/app/suppliers/${s.supplierId}`,
        isUrgent: s.isUrgent,
      })),
    },
  });
};

function highlight(text: string, query: string): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function ResultGroup({
  title,
  items,
  query,
  renderBadge,
}: {
  title: string;
  items: Array<{ id: string; text: string; label?: string; author: string; date: string; url: string; [k: string]: any }>;
  query: string;
  renderBadge?: (item: any) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm" tone="subdued">{title.toUpperCase()} — {items.length} result{items.length !== 1 ? "s" : ""}</Text>
      {items.map((item) => (
        <Box key={item.id} borderWidth="025" borderColor="border" borderRadius="200" padding="300">
          <BlockStack gap="100">
            <InlineStack align="space-between">
              <InlineStack gap="200">
                {item.label && <Text as="span" fontWeight="semibold">{item.label}</Text>}
                {renderBadge?.(item)}
              </InlineStack>
              <Button url={item.url} size="slim" variant="plain">View</Button>
            </InlineStack>
            <Text as="p" variant="bodySm">{highlight(item.text, query)}</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {item.author} · {timeAgo(item.date)}
            </Text>
          </BlockStack>
        </Box>
      ))}
    </BlockStack>
  );
}

export default function SearchPage() {
  const { hasAccess, query, results, planTier } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState(query);

  const totalResults = results
    ? results.shifts.length + results.orders.length + results.customers.length + results.suppliers.length
    : 0;

  if (!hasAccess) {
    return (
      <Page title="Search">
        <Layout>
          <Layout.Section>
            <Card>
              <Banner
                title="Search is available on Team and Agency plans"
                tone="info"
                action={{ content: "Upgrade to Team", url: "/app/settings/billing" }}
              >
                <p>
                  Search across all shift notes, order annotations, customer notes, and supplier
                  notes to find anything in your store's history.
                </p>
              </Banner>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Search" subtitle="Search across all notes, annotations, and supplier updates.">
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineStack gap="200">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Search"
                    name="q"
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search everything…"
                    autoComplete="off"
                    labelHidden
                    autoFocus
                  />
                </div>
                <Button submit variant="primary">Search</Button>
              </InlineStack>
            </Form>
          </Card>
        </Layout.Section>

        {query && results && (
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                {totalResults === 0 ? (
                  <EmptyState
                    heading={`No results for "${query}"`}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Try different keywords, or check the spelling.</p>
                  </EmptyState>
                ) : (
                  <>
                    <Text as="p" tone="subdued">{totalResults} result{totalResults !== 1 ? "s" : ""} for "{query}"</Text>
                    <Divider />
                    <ResultGroup
                      title="Shift Notes"
                      items={results.shifts}
                      query={query}
                    />
                    <ResultGroup
                      title="Order Annotations"
                      items={results.orders}
                      query={query}
                      renderBadge={(item) => item.label && <Badge>{item.label}</Badge>}
                    />
                    <ResultGroup
                      title="Customer Notes"
                      items={results.customers}
                      query={query}
                      renderBadge={(item) => item.isWarning && <Badge tone="critical">Warning</Badge>}
                    />
                    <ResultGroup
                      title="Supplier Notes"
                      items={results.suppliers}
                      query={query}
                      renderBadge={(item) => item.isUrgent && <Badge tone="critical">Urgent</Badge>}
                    />
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
