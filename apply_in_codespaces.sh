#!/bin/bash
# Run this script in your Codespaces terminal:
# bash apply_in_codespaces.sh

set -e
cd /workspaces/shiftlog

echo "=== Applying all fixes ==="

# Fix 1: billing try/catch
python3 << 'PYEOF'
content = open("app/routes/app.settings.billing.tsx").read()
old = '''  const { hasActivePayment } = await billing.check({
    plans: [SOLO_MONTHLY, SOLO_ANNUAL, TEAM_MONTHLY, TEAM_ANNUAL, AGENCY_MONTHLY, AGENCY_ANNUAL],
    isTest: process.env.NODE_ENV !== "production",
  });'''
new = '''  let hasActivePayment = false;
  try {
    const result = await billing.check({
      plans: [SOLO_MONTHLY, SOLO_ANNUAL, TEAM_MONTHLY, TEAM_ANNUAL, AGENCY_MONTHLY, AGENCY_ANNUAL],
      isTest: true,
    });
    hasActivePayment = result.hasActivePayment;
  } catch {
    // Expected before App Store approval
  }'''
content = content.replace(old, new)
content = content.replace(
    "isTest: process.env.NODE_ENV !== \"production\",\n    returnUrl:",
    "isTest: true,\n    returnUrl:"
)
open("app/routes/app.settings.billing.tsx", "w").write(content)
print("✓ billing.tsx fixed")
PYEOF

# Fix 2: Remove debug console.logs
python3 << 'PYEOF'
import re, os
files = ["app/routes/webhooks.billing.tsx","app/routes/webhooks.tsx","app/routes/webhooks.gdpr.tsx","app/shopify.server.ts"]
for f in files:
    if os.path.exists(f):
        content = open(f).read()
        cleaned = re.sub(r'\s*console\.log\([^;]+\);\n', '\n', content)
        open(f, "w").write(cleaned)
        print(f"✓ console.logs removed from {f}")
PYEOF

# Fix 3: Add unstable_newEmbeddedAuthStrategy
python3 << 'PYEOF'
content = open("app/shopify.server.ts").read()
if "unstable_newEmbeddedAuthStrategy" not in content:
    content = content.replace(
        "  future: {\n    v3_webhookAdminContext: true,\n  },",
        "  future: {\n    v3_webhookAdminContext: true,\n    unstable_newEmbeddedAuthStrategy: true,\n  },"
    )
    open("app/shopify.server.ts", "w").write(content)
    print("✓ unstable_newEmbeddedAuthStrategy added")
else:
    print("✓ already has unstable_newEmbeddedAuthStrategy")
PYEOF

# Fix 4: CORS Authorization header
python3 << 'PYEOF'
import os
for fname in ["app/routes/api.order-annotations.tsx","app/routes/api.customer-notes.tsx"]:
    if os.path.exists(fname):
        content = open(fname).read()
        content = content.replace(
            '"Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain"',
            '"Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain, Authorization, authorization"'
        )
        open(fname, "w").write(content)
        print(f"✓ CORS fixed in {fname}")
PYEOF

echo "=== All python fixes done ==="

# Fix 5: Replace app.tsx
cat > app/routes/app.tsx << 'APPTSX'
import { type LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "~/shopify.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { isTrialExpired, getTrialDaysRemaining, hasPlanFeature } from "~/utils/planCheck.server";
import prisma from "~/db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);
  const url = new URL(request.url);
  const path = url.pathname;

  if (!store.onboardingDone && staffMember?.role === "OWNER" && !path.includes("/onboarding")) {
    throw redirect("/app/onboarding");
  }
  if (isTrialExpired(store) && !path.includes("/settings/billing")) {
    throw redirect("/app/settings/billing");
  }

  const pendingCount = await prisma.pendingItem.count({
    where: { storeId: store.id, resolvedAt: null },
  });

  return json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
    pendingCount,
    canMultistore: hasPlanFeature(store.planTier, "multistore"),
    store: { planTier: store.planTier, trialDaysRemaining: getTrialDaysRemaining(store) },
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
  });
};

export default function App() {
  const { apiKey, pendingCount, canMultistore } = useLoaderData<typeof loader>();
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/shifts">Shift Notes</a>
        <a href="/app/pending">{pendingCount > 0 ? `Pending (${pendingCount})` : "Pending Items"}</a>
        <a href="/app/orders">Order Notes</a>
        <a href="/app/customers">Customer Notes</a>
        <a href="/app/suppliers">Suppliers</a>
        <a href="/app/audit">Audit Trail</a>
        <a href="/app/search">Search</a>
        <a href="/app/team">Team</a>
        {canMultistore && <a href="/app/multistore">Multi-Store</a>}
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return (
    <AppProvider isEmbeddedApp apiKey="">
      <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>Something went wrong</h1>
        <p style={{ color: "#666", fontSize: 14 }}>Please refresh or contact support@shiftlog.app</p>
      </div>
    </AppProvider>
  );
}
APPTSX
echo "✓ app.tsx replaced"

# Fix 6: Replace extensions
cat > extensions/order-annotations/src/OrderNotes.tsx << 'EXTEOF'
import {
  extension, AdminBlock, BlockStack, Button, Checkbox,
  Divider, InlineStack, Text, TextArea, Badge, Box,
} from "@shopify/ui-extensions/admin";

export default extension("admin.order-details.block.render", (root, api) => {
  const orderId = (api.data.selected[0] as any)?.id ?? "";
  const orderNumber = (api.data.selected[0] as any)?.name ?? orderId;
  const shop = (api as any).shop?.myshopifyDomain ?? "";
  const rawScript = (api.extension as any).scriptUrl ?? "";
  const appUrl = rawScript.includes("/extensions") ? rawScript.split("/extensions")[0] : "";
  const h = { "Content-Type": "application/json", "X-Shopify-Shop-Domain": shop };

  let noteValue = "";
  let needsOwner = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Order Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);
  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading…");
  stack.appendChild(statusText);
  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);
  stack.appendChild(root.createComponent(Divider));
  const textarea = root.createComponent(TextArea, {
    label: "Add a note", value: noteValue,
    onChange: (v: string) => { noteValue = v; },
    placeholder: "e.g. Customer called, confirmed address updated",
  });
  stack.appendChild(textarea);
  stack.appendChild(root.createComponent(Checkbox, {
    id: "no", checked: needsOwner,
    onChange: (v: boolean) => { needsOwner = v; },
  }, "Flag for owner attention"));
  const fb = root.createComponent(Text, {});
  stack.appendChild(fb);
  const btn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) { fb.replaceChildren("Please enter a note."); return; }
      btn.updateProps({ loading: true });
      try {
        const r = await fetch(`${appUrl}/api/order-annotations?shop=${encodeURIComponent(shop)}`, {
          method: "POST", headers: h,
          body: JSON.stringify({ orderId, orderNumber, note: noteValue.trim(), needsOwner }),
        });
        if (!r.ok) throw new Error();
        noteValue = ""; textarea.updateProps({ value: "" });
        fb.replaceChildren("Note saved."); await load();
      } catch { fb.replaceChildren("Failed to save. Please try again."); }
      finally { btn.updateProps({ loading: false }); }
    },
  }, "Save note");
  stack.appendChild(btn);
  root.appendChild(block);

  async function load() {
    try {
      const r = await fetch(`${appUrl}/api/order-annotations?orderId=${encodeURIComponent(orderId)}&shop=${encodeURIComponent(shop)}`, { headers: h });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const ann = d.annotations ?? [];
      notesList.replaceChildren();
      statusText.replaceChildren(ann.length === 0 ? "No notes yet." : "");
      for (const a of ann) {
        const box = root.createComponent(Box, { padding: "base", borderWidth: "base", borderColor: a.needsOwner && !a.resolvedAt ? "caution" : "subdued", borderRadius: "base" });
        const s = root.createComponent(BlockStack, { gap: "extraTight" });
        const row = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        row.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, a.staffName));
        if (a.needsOwner && !a.resolvedAt) row.appendChild(root.createComponent(Badge, { tone: "warning" }, "Flagged"));
        if (a.resolvedAt) row.appendChild(root.createComponent(Badge, { tone: "success" }, "Resolved"));
        s.appendChild(row);
        s.appendChild(root.createComponent(Text, {}, a.note));
        if (d.canResolve && a.needsOwner && !a.resolvedAt) {
          s.appendChild(root.createComponent(Button, { size: "slim", variant: "plain", onPress: async () => {
            await fetch(`${appUrl}/api/order-annotations?shop=${encodeURIComponent(shop)}`, { method: "PUT", headers: h, body: JSON.stringify({ annotationId: a.id }) });
            await load();
          }}, "Resolve"));
        }
        box.appendChild(s); notesList.appendChild(box);
      }
    } catch { statusText.replaceChildren("Could not load notes."); }
  }
  if (orderId) load();
});
EXTEOF
echo "✓ order extension replaced"

cat > extensions/customer-notes/src/CustomerNotes.tsx << 'EXTEOF'
import {
  extension, AdminBlock, BlockStack, Button, Checkbox,
  Divider, InlineStack, Text, TextArea, Badge, Banner, Box,
} from "@shopify/ui-extensions/admin";

export default extension("admin.customer-details.block.render", (root, api) => {
  const customerId = (api.data.selected[0] as any)?.id ?? "";
  const customerName = (api.data.selected[0] as any)?.displayName ?? customerId;
  const customerEmail = (api.data.selected[0] as any)?.email ?? null;
  const shop = (api as any).shop?.myshopifyDomain ?? "";
  const rawScript = (api.extension as any).scriptUrl ?? "";
  const appUrl = rawScript.includes("/extensions") ? rawScript.split("/extensions")[0] : "";
  const h = { "Content-Type": "application/json", "X-Shopify-Shop-Domain": shop };

  let noteValue = "";
  let isWarning = false;

  const block = root.createComponent(AdminBlock, { title: "ShiftLog — Customer Notes" });
  const stack = root.createComponent(BlockStack, { gap: "base" });
  block.appendChild(stack);
  const warnContainer = root.createComponent(BlockStack, {});
  stack.appendChild(warnContainer);
  const statusText = root.createComponent(Text, { tone: "subdued" }, "Loading…");
  stack.appendChild(statusText);
  const notesList = root.createComponent(BlockStack, { gap: "tight" });
  stack.appendChild(notesList);
  stack.appendChild(root.createComponent(Divider));
  const textarea = root.createComponent(TextArea, {
    label: "Add a note", value: noteValue,
    onChange: (v: string) => { noteValue = v; },
    placeholder: "e.g. Fraud attempted — verify before fulfilling",
  });
  stack.appendChild(textarea);
  stack.appendChild(root.createComponent(Checkbox, {
    id: "iw", checked: isWarning,
    onChange: (v: boolean) => { isWarning = v; },
  }, "Mark as warning (shows red alert to all staff)"));
  const fb = root.createComponent(Text, {});
  stack.appendChild(fb);
  const btn = root.createComponent(Button, {
    variant: "primary",
    onPress: async () => {
      if (!noteValue.trim()) { fb.replaceChildren("Please enter a note."); return; }
      btn.updateProps({ loading: true });
      try {
        const r = await fetch(`${appUrl}/api/customer-notes?shop=${encodeURIComponent(shop)}`, {
          method: "POST", headers: h,
          body: JSON.stringify({ customerId, customerName, customerEmail, note: noteValue.trim(), isWarning }),
        });
        if (!r.ok) throw new Error();
        noteValue = ""; textarea.updateProps({ value: "" });
        fb.replaceChildren("Note saved."); await load();
      } catch { fb.replaceChildren("Failed to save."); }
      finally { btn.updateProps({ loading: false }); }
    },
  }, "Save note");
  stack.appendChild(btn);
  root.appendChild(block);

  async function load() {
    try {
      const r = await fetch(`${appUrl}/api/customer-notes?customerId=${encodeURIComponent(customerId)}&shop=${encodeURIComponent(shop)}`, { headers: h });
      if (!r.ok) throw new Error();
      const d = await r.json();
      warnContainer.replaceChildren();
      if (d.hasWarning) {
        const b = root.createComponent(Banner, { tone: "critical" });
        b.appendChild(root.createComponent(Text, { fontWeight: "bold" }, "WARNING: This customer has been flagged. Read notes before processing orders."));
        warnContainer.appendChild(b);
      }
      notesList.replaceChildren();
      statusText.replaceChildren((d.notes ?? []).length === 0 ? "No notes yet." : "");
      for (const n of (d.notes ?? [])) {
        const box = root.createComponent(Box, { padding: "base", borderWidth: "base", borderColor: n.isWarning ? "critical" : "subdued", borderRadius: "base" });
        const s = root.createComponent(BlockStack, { gap: "extraTight" });
        const row = root.createComponent(InlineStack, { gap: "tight", blockAlignment: "center" });
        row.appendChild(root.createComponent(Text, { fontWeight: "bold", size: "small" }, n.staffName));
        if (n.isWarning) row.appendChild(root.createComponent(Badge, { tone: "critical" }, "Warning"));
        s.appendChild(row);
        s.appendChild(root.createComponent(Text, {}, n.note));
        box.appendChild(s); notesList.appendChild(box);
      }
    } catch { statusText.replaceChildren("Could not load notes."); }
  }
  if (customerId) load();
});
EXTEOF
echo "✓ customer extension replaced"

# Fix dashboard

# Fix 7: commit and push everything
git add -A
git commit -m "sell-ready: modern UI, billing fix, CORS fix, remove debug code, fix extensions"
git push origin main

# Fix 8: deploy extensions
npx shopify app deploy

echo ""
echo "=== DONE ==="
echo "Railway will auto-redeploy in 2-3 minutes."
echo "After deploy: refresh Shopify admin - new UI and fixed extensions ready."

# Fix dashboard - modern clean UI
cat > app/routes/app._index.tsx << 'DASHEOF'
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

  const [pendingCount, todayShiftCount, todayRefunds, customerWarnings, recentAudit, recentShifts, totalShiftNotes] =
    await Promise.all([
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
  REFUND_ISSUED: "Refund", ORDER_CANCELLED: "Cancelled",
  PRODUCT_PRICE_CHANGED: "Price changed", ORDER_EDITED: "Order edited",
  FULFILLMENT_UPDATED: "Fulfilled", NOTE_ADDED: "Note added",
  DISCOUNT_APPLIED: "Discount", CUSTOMER_TAGGED: "Tagged",
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
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

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
              <Text as="p" tone="subdued">{today}</Text>
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
                <BlockStack gap="300">
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
                        <InlineStack gap="200">
                          <Badge tone={ACTION_TONES[e.actionType] ?? "info"}>{ACTION_LABELS[e.actionType] ?? e.actionType}</Badge>
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
                      <Box key={note.id} background={note.needsOwner && !note.resolvedAt ? "bg-surface-critical-subdued" : "bg-surface-secondary"} borderRadius="200" padding="300">
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
                <Button url="/app/shifts">📝 Shift note</Button>
                <Button url="/app/pending">⚠️ Pending items</Button>
                <Button url="/app/suppliers">🏭 Suppliers</Button>
                <Button url="/app/team">👥 Invite staff</Button>
                <Button url="/app/settings/billing">💳 Billing</Button>
                <Button url="/app/settings">⚙️ Settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
DASHEOF
echo "✓ dashboard replaced"

# Commit and push everything
git add -A
git commit -m "sell-ready: modern UI, billing fix, CORS fix, remove debug logs, fix extensions"
git push origin main

echo ""
echo "=== Deploying extensions ==="
npx shopify app deploy

echo ""
echo "==============================="
echo "DONE! All fixes applied."
echo "Railway will redeploy in 2-3 minutes."
echo "Then refresh your Shopify admin."
echo "==============================="
