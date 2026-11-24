import { defineMiddleware } from "astro:middleware";
import { isAdminEnabled, isIndexable } from "../lib/site-env";

/**
 * Middleware « externe » d'EmDash (option `middleware.outer`) : il s'exécute
 * avant toute initialisation d'EmDash et de la base.
 *
 * 1. Tant qu'il n'y a pas de back-office, tout ce qui est sous /_emdash/
 *    (admin, assistant d'installation, API, MCP) répond 404. Sans ce verrou,
 *    la première personne à ouvrir /_emdash/admin/ deviendrait administratrice.
 * 2. Hors production, toutes les réponses portent X-Robots-Tag: noindex.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const path = context.url.pathname;

	if ((path === "/_emdash" || path.startsWith("/_emdash/")) && !isAdminEnabled()) {
		return withRobotsHeader(
			new Response("Not Found", {
				status: 404,
				headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
			}),
		);
	}

	return withRobotsHeader(await next());
});

function withRobotsHeader(response: Response): Response {
	if (isIndexable()) return response;
	try {
		response.headers.set("X-Robots-Tag", "noindex, nofollow");
		return response;
	} catch {
		// En-têtes immuables (réponse issue de fetch) : on recopie la réponse.
		const copy = new Response(response.body, response);
		copy.headers.set("X-Robots-Tag", "noindex, nofollow");
		return copy;
	}
}
