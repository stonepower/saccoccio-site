import type { APIRoute } from "astro";
import { PAGES } from "../data/pages";

/**
 * Remplace le sitemap.xml injecté par EmDash (qui ne liste que ses
 * collections, vides ici). Rendu par le Worker pour connaître l'origine
 * (workers.dev aujourd'hui, domaine plus tard) ; aucun accès à la D1.
 * Seules les pages publiées sont listées (pas de pages à venir).
 */
const CHEMINS = ["/", ...PAGES.map((p) => p.url), "/plan-du-site/"];

export const GET: APIRoute = ({ url }) => {
	const lignes = CHEMINS.map((chemin) => `  <url><loc>${new URL(chemin, url.origin).href}</loc></url>`);
	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...lignes,
		"</urlset>",
		"",
	].join("\n");
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
