import type { APIRoute } from "astro";
import { isIndexable } from "../lib/site-env";

/**
 * Remplace le robots.txt injecté par EmDash.
 * Production : indexable. Staging (et dev) : tout est interdit.
 */
export const GET: APIRoute = ({ url }) => {
	const body = isIndexable()
		? ["User-agent: *", "Allow: /", "Disallow: /_emdash/", "", `Sitemap: ${url.origin}/sitemap.xml`, ""].join("\n")
		: ["User-agent: *", "Disallow: /", ""].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
