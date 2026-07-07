import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import { type LoaderFunctionArgs, redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // If hitting root with shop param, redirect to /app
  if (url.pathname === "/" && url.searchParams.get("shop")) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }
  return null;
};

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
