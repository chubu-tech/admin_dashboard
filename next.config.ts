import type { NextConfig } from "next";

/**
 * Response headers for every route.
 *
 * This console shows real customers' names, phone numbers and salon documents to
 * whoever is signed in, so the headers below are part of shipping it — not polish. None
 * of them changes what the app does; they change what a browser is willing to do with
 * the response.
 *
 * **The CSP carries `frame-ancestors` and nothing else, deliberately.** A full policy is
 * the right long-term answer and is not a config-file change: Next injects inline
 * bootstrap scripts and Tailwind ships inline styles, so `script-src`/`style-src` need
 * either a nonce threaded through the proxy or `unsafe-inline`, and a policy with
 * `unsafe-inline` in it buys almost nothing while reading as though it did. One
 * directive that is completely enforced beats five that are half-true.
 *
 * `X-Frame-Options` is the same control for browsers that predate `frame-ancestors`.
 * Keeping both is intentional; where they disagree, the CSP wins.
 */
const securityHeaders = [
  // Clickjacking. An admin console framed by another origin is a UI-redress attack
  // against the one account that can delete salons.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },

  // Stop the browser second-guessing a Content-Type — the vector that turns an
  // uploaded document into a script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Also set in `app/layout.tsx`'s metadata. The header is the one that governs
  // non-document requests, so both are needed to cover everything the page issues.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Nothing here uses any of these, so the console declines them outright rather than
  // leaving them available to injected code.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },

  // Two years, subdomains included, and **no `preload`** — preloading is a one-way
  // door that is honoured by browsers long after a domain stops serving HTTPS, and it
  // is not a decision a config file should make on an operator's behalf.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` tells an attacker which framework and therefore which
  // advisories to try. It buys nothing.
  poweredByHeader: false,

  // Belt to `app/robots.ts`: a console that is never crawled has no use for the
  // trailing-slash redirect variants either, and one canonical URL per route keeps the
  // pagination links in `components/pagination.tsx` unambiguous.
  trailingSlash: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
