import type { APIRoute } from "astro";
import { PAGES } from "../data/pages";
import { chargerCatalogue } from "../lib/annonces-d1";

/**
 * Remplace le sitemap.xml injecté par EmDash (qui ne liste que ses
 * collections, vides ici). Rendu par le Worker pour connaître l'origine
 * (workers.dev aujourd'hui, domaine plus tard). Seules les pages publiées
 * sont listées (pas de pages à venir), plus la liste des annonces et les
 * annonces actives (catalogue D1, partagé avec les pages d'annonces : une
 * requête au plus, en cache 60 s).
 */
const CHEMINS = [
	"/",
	...PAGES.map((p) => p.url),
	"/annonces/",
	"/contact/",
	"/politique-de-confidentialite/",
	"/plan-du-site/",
];

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export const GET: APIRoute = async ({ url }) => {
	const lignes = CHEMINS.map((chemin) => `  <url><loc>${new URL(chemin, url.origin).href}</loc></url>`);
	let annoncesOk = true;
	try {
		const { actives } = await chargerCatalogue();
		for (const a of actives) {
			const lastmod = a.majLe ? `<lastmod>${new Date(a.majLe).toISOString().slice(0, 10)}</lastmod>` : "";
			lignes.push(`  <url><loc>${echapper(new URL(`/annonces/${a.slug}/`, url.origin).href)}</loc>${lastmod}</url>`);
		}
	} catch (erreur) {
		// Sans D1, le sitemap reste valide (pages fixes seulement), sans cache long.
		console.error(JSON.stringify({ evenement: "sitemap", erreur: String(erreur) }));
		annoncesOk = false;
	}
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
			"Cache-Control": annoncesOk ? "public, max-age=3600" : "no-store",
		},
	});
};
