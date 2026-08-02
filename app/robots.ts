import type { MetadataRoute } from "next";

/** The admin console is private — keep every crawler out of all of it. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
