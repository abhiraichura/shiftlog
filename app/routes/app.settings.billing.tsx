import { useState } from "react";
import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
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
  Banner,
  Divider,
  List,
  InlineGrid,
  Box,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { getTrialDaysRemaining } from "~/utils/planCheck.server";
import {
  SOLO_MONTHLY,
  SOLO_ANNUAL,
  TEAM_MONTHLY,
  TEAM_ANNUAL,
  AGENCY_MONTHLY,
  AGENCY_ANNUAL,
  PLANS,
} from "~/utils/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);
  const trialDaysRemaining = getTrialDaysRemaining(store);

  let hasActivePayment = false;
  try {
    const result = await billing.check({
      plans: [SOLO_MONTHLY, SOLO_ANNUAL, TEAM_MONTHLY, TEAM_ANNUAL, AGENCY_MONTHLY, AGENCY_ANNUAL],
      isTest: true,
    });
    hasActivePayment = result.hasActivePayment;
  } catch (err) {
    console.error("[billing] check failed (app not yet approved for billing):", err);
  }

  return json({
    planTier: store.planTier,
    trialDaysRemaining,
    trialEndsAt: store.trialEndsAt?.toISOString() ?? null,
    hasActivePayment,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;

  const validPlans = [SOLO_MONTHLY, SOLO_ANNUAL, TEAM_MONTHLY, TEAM_ANNUAL, AGENCY_MONTHLY, AGENCY_ANNUAL];
  if (!validPlans.includes(plan)) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    const paymentResponse = await billing.request({
      plan,
      isTest: true,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/settings/billing?success=1`,
    });
    return redirect(paymentResponse.confirmationUrl);
  } catch (err) {
    console.error("[billing] request failed:", err);
    return json({ error: "Billing is not available until the app is approved on the Shopify App Store." }, { status: 400 });
  }
};

export default function BillingPage() {
  const { planTier, trialDaysRemaining, hasActivePayment } = useLoaderData<typeof loader>();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  const showSuccess =
    typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("success") === "1";

  return (
    <Page
      title="Plan & Billing"
      subtitle="14-day free trial included. Cancel any time."
      backAction={{ content: "Settings", url: "/app/settings" }}
    >
      <Layout>
        {showSuccess && (
          <Layout.Section>
            <Banner tone="success" title="Plan activated!">
              <p>You are all set. Your new plan is active immediately.</p>
            </Banner>
          </Layout.Section>
        )}

        {planTier === "TRIAL" && (
          <Layout.Section>
            <Banner
              tone={trialDaysRemaining <= 3 ? "critical" : "info"}
              title={
                trialDaysRemaining > 0
                  ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? "s" : ""} left in your free trial`
                  : "Your free trial has ended"
              }
            >
              <p>Choose a plan below to keep your data and access.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack align="center" gap="300">
            <Button
              pressed={billingPeriod === "monthly"}
              onClick={() => setBillingPeriod("monthly")}
              variant={billingPeriod === "monthly" ? "primary" : "secondary"}
            >
              Monthly
            </Button>
            <Button
              pressed={billingPeriod === "annual"}
              onClick={() => setBillingPeriod("annual")}
              variant={billingPeriod === "annual" ? "primary" : "secondary"}
            >
              Annual <Badge tone="success">Save ~17%</Badge>
            </Button>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            {PLANS.map((plan) => {
              const isCurrentPlan = planTier === plan.key;
              const price = billingPeriod === "monthly" ? plan.monthlyPrice : plan.annualPrice;
              const planName = billingPeriod === "monthly" ? plan.monthlyPlan : plan.annualPlan;
              const perMonth =
                billingPeriod === "annual"
                  ? `$${(plan.annualPrice / 12).toFixed(0)}/mo`
                  : null;

              return (
                <Box
                  key={plan.key}
                  borderWidth={plan.recommended ? "050" : "025"}
                  borderColor={plan.recommended ? "border-brand" : "border"}
                  borderRadius="200"
                  padding="400"
                  background={plan.recommended ? "bg-surface-brand-subdued" : "bg-surface"}
                >
                  <BlockStack gap="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="h3" variant="headingMd">{plan.name}</Text>
                        {plan.recommended && <Badge tone="info">Most popular</Badge>}
                        {isCurrentPlan && <Badge tone="success">Current plan</Badge>}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{plan.description}</Text>
                    </BlockStack>

                    <BlockStack gap="100">
                      <Text as="p" variant="headingXl">
                        ${price}
                        <Text as="span" variant="bodySm" tone="subdued">
                          /{billingPeriod === "monthly" ? "month" : "year"}
                        </Text>
                      </Text>
                      {perMonth && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          That is {perMonth} billed annually
                        </Text>
                      )}
                    </BlockStack>

                    <Divider />

                    <List type="bullet" gap="extraTight">
                      {plan.features.map((f) => (
                        <List.Item key={f}>{f}</List.Item>
                      ))}
                    </List>

                    {isCurrentPlan ? (
                      <Button disabled fullWidth>Current plan</Button>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="plan" value={planName} />
                        <Button submit variant="primary" fullWidth>
                          {planTier === "TRIAL" ? "Start with" : "Switch to"} {plan.name}
                        </Button>
                      </Form>
                    )}
                  </BlockStack>
                </Box>
              );
            })}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Billing FAQ</Text>
              <Divider />
              <Text as="p" variant="bodySm">
                <strong>Can I cancel?</strong> Yes, any time from Shopify admin under Apps then ShiftLog then Cancel subscription.
              </Text>
              <Text as="p" variant="bodySm">
                <strong>What happens to my data?</strong> Retained for 30 days after cancellation.
              </Text>
              <Text as="p" variant="bodySm">
                <strong>Refunds?</strong> Contact support@shiftlog.app within 7 days.
              </Text>
              <Text as="p" variant="bodySm">
                <strong>Billed through Shopify?</strong> Yes, charges appear on your Shopify invoice.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
