import type { APIRoute } from "astro";
import { PAGES } from "../data/pages";
import { type Catalogue, chargerCatalogue } from "../lib/annonces-d1";
import { urlCanonique } from "../lib/seo";

/**
 * Remplace le sitemap.xml injecté par EmDash (qui ne liste que ses
 * collections, vides ici). Rendu par le Worker, car il liste les annonces
 * actives (D1).
 *
 * Coût par requête (plan gratuit, 10 ms de CPU) : le catalogue est celui des
 * pages d'annonces (une requête D1 au plus, gardé 60 s dans l'isolat) et le
 * XML produit est gardé avec lui : tant que le catalogue est le même objet,
 * rien n'est recalculé. Cache HTTP d'une heure.
 *
 * Les URL sont les URL CANONIQUES (domaine de production, URL_SITE), comme
 * les <link rel="canonical"> des pages. Seules les pages publiées et
 * indexables sont listées. `lastmod` n'est renseigné que lorsqu'il est connu :
 * date de mise à jour de chaque annonce (flux Immonot), et la plus récente
 * pour /annonces/. Les pages prérendues n'ont pas de date fiable.
 */
const CHEMINS: readonly string[] = [
	"/",
	...PAGES.map((p) => p.url),
	"/contact/",
	"/simulateur-pret/",
	"/politique-de-confidentialite/",
	"/plan-du-site/",
];

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const jour = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ligne = (chemin: string, lastmod?: number) =>
	`  <url><loc>${echapper(urlCanonique(chemin))}</loc>${lastmod ? `<lastmod>${jour(lastmod)}</lastmod>` : ""}</url>`;

function construire(catalogue: Catalogue | null): string {
	const actives = catalogue?.actives ?? [];
	const plusRecente = actives.reduce((max, a) => Math.max(max, a.majLe || 0), 0);
	const lignes = [
		...CHEMINS.map((c) => ligne(c)),
		ligne("/annonces/", plusRecente || undefined),
		...actives.map((a) => ligne(`/annonces/${a.slug}/`, a.majLe || undefined)),
	];
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...lignes,
		"</urlset>",
		"",
	].join("\n");
}

/** Dernier XML produit, pour le catalogue en cache dans l'isolat. */
let memo: { catalogue: Catalogue; xml: string } | undefined;

export const GET: APIRoute = async () => {
	let xml: string;
	let ok = true;
	try {
		const catalogue = await chargerCatalogue();
		if (memo?.catalogue !== catalogue) memo = { catalogue, xml: construire(catalogue) };
		xml = memo.xml;
	} catch (erreur) {
		// Sans D1, le sitemap reste valide (pages fixes seulement), sans cache.
		console.error(JSON.stringify({ evenement: "sitemap", erreur: String(erreur) }));
		xml = construire(null);
		ok = false;
	}
	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": ok ? "public, max-age=3600" : "no-store",
		},
	});
};
