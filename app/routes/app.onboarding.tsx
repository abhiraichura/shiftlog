import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { getStoreAndStaff } from "~/utils/store.server";
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
  Select,
  Banner,
  ProgressBar,
  Icon,
  Box,
  Divider,
} from "@shopify/polaris";
import { CheckCircleIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { sendInviteEmail } from "~/utils/email.server";

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Europe/London", value: "Europe/London" },
  { label: "Europe/Dubai", value: "Asia/Dubai" },
  { label: "Asia/Karachi", value: "Asia/Karachi" },
  { label: "Asia/Kolkata", value: "Asia/Kolkata" },
  { label: "America/New_York", value: "America/New_York" },
  { label: "America/Los_Angeles", value: "America/Los_Angeles" },
  { label: "Australia/Sydney", value: "Australia/Sydney" },
];

const DIGEST_TIMES = Array.from({ length: 24 }, (_, h) => {
  const label = `${String(h).padStart(2, "0")}:00`;
  return { label, value: label };
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  // Skip if already done
  if (store.onboardingDone) throw redirect("/app");

  const url = new URL(request.url);
  const step = parseInt(url.searchParams.get("step") ?? "1");

  // Count shift notes submitted for this store
  const shiftNoteCount = await prisma.shiftNote.count({ where: { storeId: store.id } });

  return json({ step, store: { timezone: store.timezone, digestTime: store.digestTime }, shiftNoteCount });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "skip_invite" || intent === "send_invite") {
    if (intent === "send_invite") {
      const name = (formData.get("name") as string)?.trim();
      const email = (formData.get("email") as string)?.trim().toLowerCase();
      if (name && email) {
        const existing = await prisma.staffMember.findUnique({
          where: { storeId_email: { storeId: store.id, email } },
        });
        if (!existing) {
          const inviteToken = uuidv4();
          await prisma.staffMember.create({
            data: {
              storeId: store.id,
              name,
              email,
              role: "STAFF",
              inviteToken,
              inviteExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            },
          });
          try {
            await sendInviteEmail({
              toEmail: email,
              toName: name,
              storeName: store.shop.replace(".myshopify.com", ""),
              ownerName: store.ownerName ?? "The owner",
              inviteToken,
            });
          } catch {}
        }
      }
    }
    throw redirect("/app/onboarding?step=2");
  }

  if (intent === "skip_note" || intent === "write_note") {
    if (intent === "write_note" && staffMember) {
      const summary = (formData.get("summary") as string)?.trim();
      if (summary) {
        await prisma.shiftNote.create({
          data: {
            storeId: store.id,
            staffMemberId: staffMember.id,
            summary,
          },
        });
      }
    }
    throw redirect("/app/onboarding?step=3");
  }

  if (intent === "finish") {
    const timezone = formData.get("timezone") as string || "UTC";
    const digestTime = formData.get("digestTime") as string || "09:00";
    await prisma.store.update({
      where: { id: store.id },
      data: { timezone, digestTime, onboardingDone: true },
    });
    throw redirect("/app");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

function StepDot({ n, current }: { n: number; current: number }) {
  const done = current > n;
  const active = current === n;
  return (
    <Box
      borderRadius="full"
      background={done ? "bg-fill-success" : active ? "bg-fill-brand" : "bg-fill-secondary"}
      width="32px"
      minHeight="32px"
      padding="100"
    >
      <Text as="p" tone={done || active ? "text-inverse" : "subdued"} alignment="center" fontWeight="bold">
        {done ? "✓" : String(n)}
      </Text>
    </Box>
  );
}

export default function OnboardingPage() {
  const { step, store, shiftNoteCount } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [timezone, setTimezone] = useState(store.timezone);
  const [digestTime, setDigestTime] = useState(store.digestTime);

  const progress = ((step - 1) / 3) * 100;

  return (
    <Page narrowWidth>
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Progress */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h1" variant="headingLg">Welcome to ShiftLog 👋</Text>
                  <Text as="p" tone="subdued">Step {step} of 3</Text>
                </InlineStack>
                <ProgressBar progress={progress} size="small" tone="highlight" />
                <InlineStack gap="400" align="center">
                  <InlineStack gap="200">
                    <StepDot n={1} current={step} />
                    <Text as="p" variant="bodySm" tone={step >= 1 ? "base" : "subdued"}>Invite team</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">→</Text>
                  <InlineStack gap="200">
                    <StepDot n={2} current={step} />
                    <Text as="p" variant="bodySm" tone={step >= 2 ? "base" : "subdued"}>First note</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">→</Text>
                  <InlineStack gap="200">
                    <StepDot n={3} current={step} />
                    <Text as="p" variant="bodySm" tone={step >= 3 ? "base" : "subdued"}>Set digest</Text>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Step 1: Invite */}
            {step === 1 && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Invite your first team member</Text>
                    <Text as="p" tone="subdued">
                      ShiftLog works best when your whole team uses it. Invite someone now — you
                      can always do it later from Team settings.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <Form method="post">
                    <BlockStack gap="300">
                      <TextField
                        label="Name"
                        name="name"
                        value={name}
                        onChange={setName}
                        autoComplete="name"
                        placeholder="e.g. Sarah"
                      />
                      <TextField
                        label="Email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        autoComplete="email"
                        placeholder="sarah@yourstore.com"
                      />
                      <InlineStack gap="300">
                        <Button submit name="intent" value="send_invite" variant="primary" loading={isSubmitting}>
                          Send invite
                        </Button>
                        <Button submit name="intent" value="skip_invite" variant="plain" loading={isSubmitting}>
                          Skip for now
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            )}

            {/* Step 2: Write first shift note */}
            {step === 2 && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Write your first shift note</Text>
                    <Text as="p" tone="subdued">
                      A shift note is a quick summary of what happened during your shift. It
                      takes 2 minutes and keeps your whole team informed.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <Form method="post">
                    <BlockStack gap="300">
                      <TextField
                        label="What happened today? (optional)"
                        name="summary"
                        value={summary}
                        onChange={setSummary}
                        multiline={3}
                        autoComplete="off"
                        placeholder="e.g. Processed 24 orders, called Ahmed about the XL stock delay, updated the sale banner."
                      />
                      <InlineStack gap="300">
                        <Button submit name="intent" value="write_note" variant="primary" loading={isSubmitting} disabled={!summary.trim()}>
                          Submit note
                        </Button>
                        <Button submit name="intent" value="skip_note" variant="plain" loading={isSubmitting}>
                          Skip for now
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            )}

            {/* Step 3: Set digest */}
            {step === 3 && (
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Set your daily digest time</Text>
                    <Text as="p" tone="subdued">
                      Every morning, ShiftLog sends you a plain-text email with what happened
                      yesterday — refunds, shift notes, pending items. Takes 60 seconds to read.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <Form method="post">
                    <input type="hidden" name="intent" value="finish" />
                    <BlockStack gap="300">
                      <Select
                        label="Your timezone"
                        name="timezone"
                        options={TIMEZONES}
                        value={timezone}
                        onChange={setTimezone}
                      />
                      <Select
                        label="Send digest at"
                        name="digestTime"
                        options={DIGEST_TIMES}
                        value={digestTime}
                        onChange={setDigestTime}
                        helpText="You'll receive the daily summary at this time in your timezone."
                      />
                      <Button submit variant="primary" size="large" loading={isSubmitting}>
                        Finish setup — open ShiftLog 🎉
                      </Button>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
