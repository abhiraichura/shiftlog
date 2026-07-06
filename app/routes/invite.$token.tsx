import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { useState } from "react";
import prisma from "~/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token;

  const member = await prisma.staffMember.findUnique({
    where: { inviteToken: token },
    include: { store: true },
  });

  if (!member) {
    return json({ valid: false, error: "This invite link is invalid or has already been used." });
  }

  if (member.acceptedAt) {
    return json({ valid: false, error: "This invite has already been accepted. You can log in via your Shopify store." });
  }

  // Check 72-hour expiry
  if (member.inviteExpiresAt && new Date() > new Date(member.inviteExpiresAt)) {
    return json({ valid: false, error: "This invite link has expired. Ask the store owner to send a new invitation." });
  }

  const storeName = member.store.shop.replace(".myshopify.com", "");

  return json({
    valid: true,
    name: member.name,
    email: member.email,
    storeName,
    role: member.role,
    token,
  });
};

export const action = async ({ params }: ActionFunctionArgs) => {
  const token = params.token;

  const member = await prisma.staffMember.findUnique({
    where: { inviteToken: token },
    include: { store: true },
  });

  if (!member || member.acceptedAt) {
    return json({ error: "Invalid or already used invite." }, { status: 400 });
  }

  await prisma.staffMember.update({
    where: { id: member.id },
    data: {
      acceptedAt: new Date(),
      inviteToken: null, // consume the token
    },
  });

  // Redirect to the store's Shopify admin with the app
  const shopDomain = member.store.shop;
  return redirect(`https://${shopDomain}/admin/apps/shiftlog`);
};

export default function InvitePage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!data.valid || !("name" in data)) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>ShiftLog</div>
          <h1 style={styles.heading}>Invite not found</h1>
          <p style={styles.body}>{"error" in data ? data.error : "Something went wrong."}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>📋 ShiftLog</div>
        <h1 style={styles.heading}>You've been invited</h1>
        <p style={styles.body}>
          <strong>{data.storeName}</strong> has invited you to join their team on ShiftLog as{" "}
          <strong>{data.role === "MANAGER" ? "a Manager" : "a Staff member"}</strong>.
        </p>

        <div style={styles.infoBox}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>Name:</strong> {data.name}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>
            <strong>Email:</strong> {data.email}
          </p>
        </div>

        <p style={styles.body}>
          Accepting this invite will link your Shopify account to ShiftLog. You'll access
          ShiftLog through your store's Shopify admin.
        </p>

        {actionData && "error" in actionData && (
          <div style={styles.error}>{actionData.error}</div>
        )}

        <Form method="post">
          <button
            type="submit"
            style={{
              ...styles.button,
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "wait" : "pointer",
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Accepting…" : "Accept invitation"}
          </button>
        </Form>

        <p style={styles.fine}>
          By accepting, you agree to ShiftLog's{" "}
          <a href="https://shiftlog.app/terms" style={{ color: "#5c6ac4" }}>
            Terms of Service
          </a>
          . Your data is only shared with your store owner.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#f6f6f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    background: "#ffffff",
    borderRadius: 12,
    padding: "40px 48px",
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.06)",
  },
  logo: {
    fontSize: 22,
    fontWeight: 700,
    color: "#202223",
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    color: "#202223",
    margin: "0 0 12px",
  },
  body: {
    fontSize: 15,
    color: "#6d7175",
    lineHeight: 1.6,
    margin: "0 0 16px",
  },
  infoBox: {
    background: "#f6f6f7",
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 16,
  },
  error: {
    background: "#ffd2d2",
    color: "#b00020",
    padding: "10px 14px",
    borderRadius: 6,
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    display: "block",
    width: "100%",
    padding: "14px",
    background: "#5c6ac4",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    textAlign: "center",
    marginBottom: 16,
  },
  fine: {
    fontSize: 12,
    color: "#8c9196",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.5,
  },
};
