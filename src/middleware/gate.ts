import { defineMiddleware } from "astro:middleware";
// Carte des anciennes URL → nouvelles (5 Ko, incluse dans le Worker).
import carteUrls from "../../reference/contenus-kit/urls.csv?raw";
import { construireTable, type TableRedirections, trouverRedirection } from "../lib/redirections";
import { isAdminEnabled, isIndexable } from "../lib/site-env";

/** Construite à la première requête de l'isolat, puis réutilisée. */
let redirections: TableRedirections | undefined;

/**
 * Middleware « externe » d'EmDash (option `middleware.outer`) : il s'exécute
 * avant toute initialisation d'EmDash et de la base.
 *
 * 1. Tant qu'il n'y a pas de back-office, tout ce qui est sous /_emdash/
 *    (admin, assistant d'installation, API, MCP) répond 404. Sans ce verrou,
 *    la première personne à ouvrir /_emdash/admin/ deviendrait administratrice.
 * 2. Redirections 301 des anciennes URL de l'ancien site (osCommerce), avant
 *    EmDash : aucune requête D1 pour elles. Voir src/lib/redirections.ts.
 * 3. Hors production, toutes les réponses portent X-Robots-Tag: noindex.
 *
 * Les pages prérendues et les fichiers de public/ sont servis comme assets
 * statiques, SANS passer par ce middleware.
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

	if (path.endsWith(".php") || path.endsWith(".html") || path.endsWith(".htm")) {
		redirections ??= construireTable(carteUrls);
		const destination = trouverRedirection(redirections, path, context.url.search);
		if (destination) {
			return withRobotsHeader(
				new Response(null, {
					status: 301,
					headers: {
						Location: new URL(destination, context.url).href,
						"Cache-Control": "public, max-age=86400",
					},
				}),
			);
		}
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
