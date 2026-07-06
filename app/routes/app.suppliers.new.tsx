import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * /app/suppliers/new → redirects to /app/suppliers
 * The suppliers page opens the Add Supplier modal via ?new=1
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  throw redirect("/app/suppliers?new=1");
};
