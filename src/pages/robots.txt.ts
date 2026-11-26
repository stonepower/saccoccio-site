import type { APIRoute } from "astro";
import { URL_SITE } from "../data/site";
import { isIndexable } from "../lib/site-env";

/**
 * Remplace le robots.txt injecté par EmDash.
 * Production : tout est autorisé (sauf le back-office, fermé), avec la ligne
 * « Sitemap: » sur le domaine de production (URL_SITE, comme les canonical).
 * Staging (et dev) : tout est interdit, sans sitemap.
 */
export const GET: APIRoute = () => {
	const body = isIndexable()
		? ["User-agent: *", "Allow: /", "Disallow: /_emdash/", "", `Sitemap: ${URL_SITE}/sitemap.xml`, ""].join("\n")
		: ["User-agent: *", "Disallow: /", ""].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
