// Contrôles SEO de TOUTES les pages publiées (lancer d'abord `npm run build`,
// pour staging comme en CI) :
// - pages prérendues (dist/client/**/index.html) ;
// - pages rendues par le Worker (accueil, liste paginée et fiches des
//   annonces), servies par `wrangler dev` sur la D1 locale du kit.
//
// Pour chaque page indexable : lang="fr", un seul <h1>, un alt sur chaque
// image, <title> (≤ 60) et meta description (≤ 155) présents et UNIQUES,
// canonical absolue sur le domaine de production, Open Graph et Twitter,
// JSON-LD valide (WebSite, Notary avec ses 3 études, BreadcrumbList,
// RealEstateListing sans adresse ni coordonnées). Puis le sitemap (toutes ces
// pages et seulement elles) et robots.txt / noindex de staging.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { demarrerServeur, disponible } from "./outils/serveur.mjs";

const URL_SITE = "https://www.saccoccio-et-associes-manosque-notaires.fr";
const TITRE_MAX = 60;
const DESCRIPTION_MAX = 155;

const racine = new URL("../", import.meta.url);
const client = new URL("dist/client/", racine);

const decoder = (t) =>
	t
		.replace(/&#39;|&#x27;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

const attribut = (balise, nom) => {
	const m = new RegExp(`\\s${nom}="([^"]*)"`).exec(balise);
	return m ? decoder(m[1]) : null;
};

/** Valeur d'une balise <meta> (name ou property). */
function meta(html, cle) {
	for (const [balise] of html.matchAll(/<meta\b[^>]*>/g)) {
		if (attribut(balise, "name") === cle || attribut(balise, "property") === cle) return attribut(balise, "content");
	}
	return null;
}

function analyser(html) {
	const head = html.slice(0, html.indexOf("</head>"));
	const ld = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
	return {
		lang: /<html\b[^>]*\slang="([^"]*)"/.exec(html)?.[1],
		titres: [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => decoder(m[1])),
		description: meta(head, "description"),
		robots: meta(head, "robots"),
		canoniques: [...head.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)].map((m) => attribut(m[0], "href")),
		h1: html.match(/<h1\b/g)?.length ?? 0,
		images: [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]),
		ld,
		head,
	};
}

/** Pages prérendues : chemin → HTML. */
function pagesPrerendues() {
	const pages = new Map();
	for (const f of readdirSync(client, { recursive: true })) {
		const fichier = String(f);
		if (!fichier.endsWith("index.html")) continue;
		const chemin = `/${fichier.replace(/index\.html$/, "")}`;
		pages.set(chemin, readFileSync(new URL(fichier, client), "utf8"));
	}
	return pages;
}

let serveur;
/** chemin (avec paramètres) → { statut, entetes, html } */
const rendues = new Map();
let sitemap = "";
let robots = "";

before(
	async () => {
		if (!disponible) return;
		serveur = await demarrerServeur();
		const lire = async (chemin) => {
			const r = await fetch(`${serveur.base}${chemin}`, { redirect: "manual" });
			return { statut: r.status, entetes: r.headers, html: (await r.text()).replace(/\u00a0/g, " ") };
		};
		sitemap = (await lire("/sitemap.xml")).html;
		robots = (await lire("/robots.txt")).html;
		const fiches = [...sitemap.matchAll(/<loc>[^<]*(\/annonces\/[a-z0-9-]+\/)<\/loc>/g)].map((m) => m[1]);
		for (const chemin of ["/", "/annonces/", "/annonces/?page=1", "/annonces/?page=2", "/annonces/?page=3", ...fiches]) {
			rendues.set(chemin, await lire(chemin));
		}
		for (const chemin of ["/annonces/?ville=Valensole", "/annonces/maison-valensole-025-1958/"]) {
			rendues.set(chemin, await lire(chemin));
		}
	},
	{ timeout: 240_000 },
);

after(() => serveur?.arreter());

/** Pages indexables : chemin canonique attendu → HTML. */
function pagesIndexables() {
	const pages = new Map();
	for (const [chemin, html] of pagesPrerendues()) pages.set(chemin, html);
	for (const [chemin, r] of rendues) {
		if (chemin === "/annonces/?page=1" || chemin.includes("ville=") || r.statut !== 200) continue;
		pages.set(chemin, r.html);
	}
	return pages;
}

test("pages prérendues : toutes contrôlées (34 pages, contact, simulateur, confidentialité, plan)", () => {
	const chemins = [...pagesPrerendues().keys()];
	for (const c of ["/contact/", "/simulateur-pret/", "/politique-de-confidentialite/", "/plan-du-site/", "/office-notarial/"]) {
		assert.ok(chemins.includes(c), c);
	}
	assert.ok(chemins.length >= 38, `${chemins.length} pages`);
});

test("chaque page : lang, un seul h1, alt, title et description, canonical, Open Graph, Twitter", { skip: !disponible }, () => {
	for (const [chemin, html] of pagesIndexables()) {
		const p = analyser(html);
		const ou = `(${chemin})`;
		assert.equal(p.lang, "fr", `lang ${ou}`);
		assert.equal(p.h1, 1, `un seul h1 ${ou}`);
		for (const img of p.images) assert.ok(attribut(img, "alt") !== null, `alt absent ${ou} : ${img}`);
		for (const img of p.images) {
			if (!attribut(img, "alt")) assert.equal(attribut(img, "role") ?? attribut(img, "aria-hidden"), null, img);
		}
		assert.equal(p.titres.length, 1, `un seul title ${ou}`);
		const [titre] = p.titres;
		assert.ok(titre.length > 10 && titre.length <= TITRE_MAX, `title de ${titre.length} caractères ${ou} : ${titre}`);
		assert.ok(p.description, `description absente ${ou}`);
		assert.ok(
			p.description.length > 50 && p.description.length <= DESCRIPTION_MAX,
			`description de ${p.description.length} caractères ${ou} : ${p.description}`,
		);
		assert.deepEqual(p.canoniques, [`${URL_SITE}${chemin}`], `canonical ${ou}`);
		assert.equal(meta(p.head, "og:locale"), "fr_FR", ou);
		assert.equal(meta(p.head, "og:title"), titre, ou);
		assert.equal(meta(p.head, "og:description"), p.description, ou);
		assert.equal(meta(p.head, "og:url"), `${URL_SITE}${chemin}`, ou);
		assert.ok(meta(p.head, "og:type"), ou);
		assert.match(meta(p.head, "og:image") ?? "", /^https:\/\//, `og:image absolue ${ou}`);
		assert.ok(meta(p.head, "og:image:alt"), ou);
		assert.equal(meta(p.head, "twitter:card"), "summary_large_image", ou);
		assert.equal(meta(p.head, "twitter:title"), titre, ou);
		assert.equal(meta(p.head, "twitter:description"), p.description, ou);
		assert.equal(meta(p.head, "twitter:image"), meta(p.head, "og:image"), ou);
	}
});

test("titles et descriptions uniques", { skip: !disponible }, () => {
	const titres = new Map();
	const descriptions = new Map();
	for (const [chemin, html] of pagesIndexables()) {
		const p = analyser(html);
		const titre = p.titres[0];
		assert.ok(!titres.has(titre), `title en double : « ${titre} » (${titres.get(titre)} et ${chemin})`);
		assert.ok(
			!descriptions.has(p.description),
			`description en double : « ${p.description} » (${descriptions.get(p.description)} et ${chemin})`,
		);
		titres.set(titre, chemin);
		descriptions.set(p.description, chemin);
	}
	assert.ok(titres.size >= 38 + 25 + 3, `${titres.size} pages`);
});

test("liste paginée : canonical sans ?page=1, pages 2 et 3 vers elles-mêmes ; recherche en noindex", { skip: !disponible }, () => {
	assert.deepEqual(analyser(rendues.get("/annonces/?page=1").html).canoniques, [`${URL_SITE}/annonces/`]);
	assert.deepEqual(analyser(rendues.get("/annonces/?page=2").html).canoniques, [`${URL_SITE}/annonces/?page=2`]);
	const recherche = rendues.get("/annonces/?ville=Valensole");
	assert.equal(analyser(recherche.html).robots, "noindex, follow");
	// Hors production, le middleware pose « noindex, nofollow » sur toutes les réponses.
	assert.match(recherche.entetes.get("x-robots-tag") ?? "", /^noindex/);
	assert.deepEqual(analyser(recherche.html).canoniques, [`${URL_SITE}/annonces/?ville=Valensole`]);
});

test("doublons de /office-notarial/ : chaque page garde sa propre canonical", () => {
	const pages = pagesPrerendues();
	for (const chemin of ["/office-notarial/", "/office-notarial/fonctions/", "/office-notarial/lexique/"]) {
		assert.deepEqual(analyser(pages.get(chemin)).canoniques, [`${URL_SITE}${chemin}`]);
	}
});

/** Nœuds du graphe JSON-LD de la page (un seul script, avec @graph). */
function graphe(html) {
	const { ld } = analyser(html);
	assert.equal(ld.length, 1, "un seul script JSON-LD");
	assert.equal(ld[0]["@context"], "https://schema.org");
	assert.ok(Array.isArray(ld[0]["@graph"]));
	return ld[0]["@graph"];
}

const TELEPHONES = { Manosque: "+33 4 92 70 70 70", "Gréoux-les-Bains": "+33 4 92 70 14 40", Valensole: "+33 4 92 70 14 30" };
const CODES_POSTAUX = { Manosque: "04101", "Gréoux-les-Bains": "04800", Valensole: "04210" };

test("JSON-LD : Notary (3 études), WebSite et BreadcrumbList valides sur chaque page", { skip: !disponible }, () => {
	for (const [chemin, html] of pagesIndexables()) {
		const noeuds = graphe(html);
		for (const n of noeuds) assert.ok(typeof n["@type"] === "string", `@type ${chemin}`);
		const site = noeuds.find((n) => n["@type"] === "WebSite");
		assert.equal(site?.url, `${URL_SITE}/`);
		const etude = noeuds.find((n) => n["@type"] === "Notary");
		assert.ok(etude, `Notary absent (${chemin})`);
		const etudes = [etude, ...etude.department];
		assert.equal(etudes.length, 3);
		for (const e of etudes) {
			assert.equal(e["@type"], "Notary");
			const ville = e.address.addressLocality;
			assert.equal(e.telephone, TELEPHONES[ville], `téléphone ${ville}`);
			assert.equal(e.address.postalCode, CODES_POSTAUX[ville], `code postal ${ville}`);
			assert.ok(e.address.streetAddress, `adresse ${ville}`);
			assert.equal(e.address.addressCountry, "FR");
		}
		const fil = noeuds.find((n) => n["@type"] === "BreadcrumbList");
		if (chemin === "/") {
			assert.equal(fil, undefined, "pas de fil d'Ariane sur l'accueil");
			continue;
		}
		assert.ok(fil, `BreadcrumbList absent (${chemin})`);
		const elements = fil.itemListElement;
		assert.ok(elements.length >= 2);
		elements.forEach((el, i) => {
			assert.equal(el["@type"], "ListItem");
			assert.equal(el.position, i + 1);
			assert.ok(el.name);
			assert.match(el.item, new RegExp(`^${URL_SITE.replace(/\./g, "\\.")}/`));
		});
		assert.equal(elements[0].item, `${URL_SITE}/`);
		assert.equal(elements.at(-1).item, `${URL_SITE}${chemin}`, `dernier maillon (${chemin})`);
	}
});

test("JSON-LD des fiches : RealEstateListing + Offer, commune et code postal, jamais d'adresse ni de coordonnées", { skip: !disponible }, () => {
	const fiches = [...rendues].filter(([c, r]) => /^\/annonces\/[a-z0-9-]+\/$/.test(c) && r.statut === 200);
	assert.equal(fiches.length, 25);
	for (const [chemin, { html }] of fiches) {
		const annonce = graphe(html).find((n) => n["@type"] === "RealEstateListing");
		assert.ok(annonce, `RealEstateListing absent (${chemin})`);
		assert.equal(annonce.url, `${URL_SITE}${chemin}`);
		assert.ok(annonce.name && annonce.identifier);
		const offre = annonce.offers;
		assert.equal(offre["@type"], "Offer");
		if (offre.price !== undefined) {
			assert.ok(typeof offre.price === "number" && offre.price > 0);
			assert.equal(offre.priceCurrency, "EUR");
		}
		const adresse = annonce.about.address;
		assert.deepEqual(Object.keys(adresse).sort(), ["@type", "addressCountry", "addressLocality", "postalCode"].sort());
		assert.match(adresse.postalCode, /^04\d{3}$/);
		const json = JSON.stringify(annonce);
		assert.doesNotMatch(json, /streetAddress|latitude|longitude|"geo"|GeoCoordinates/i, chemin);
		// Ni adresse ni coordonnées du flux nulle part dans la page.
		assert.doesNotMatch(html, /adresse retirée|"latitude"|"longitude"/i, chemin);
		// Image de partage : la première photo de l'annonce.
		if (annonce.image) assert.equal(meta(html, "og:image"), annonce.image[0], `og:image (${chemin})`);
	}
});

test("sitemap : toutes les pages indexables, URL canoniques, lastmod des annonces", { skip: !disponible }, () => {
	const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
	assert.equal(new Set(locs).size, locs.length, "aucune URL en double");
	for (const loc of locs) assert.ok(loc.startsWith(`${URL_SITE}/`), loc);
	const attendues = [...pagesIndexables().keys()].filter((c) => !c.includes("?"));
	for (const chemin of attendues) assert.ok(locs.includes(`${URL_SITE}${chemin}`), `absente du sitemap : ${chemin}`);
	assert.deepEqual(locs.map((l) => l.slice(URL_SITE.length)).sort(), attendues.sort(), "le sitemap ne liste que ces pages");
	const annonces = [...sitemap.matchAll(/<url><loc>[^<]*\/annonces\/[a-z0-9-]+\/<\/loc>(.*?)<\/url>/g)];
	assert.equal(annonces.length, 25);
	for (const [, reste] of annonces) assert.match(reste, /^<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>$/);
	assert.match(sitemap, /\/annonces\/<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
	assert.ok(!sitemap.includes("maison-valensole-025-1958"), "annonce retirée absente");
});

const environnement = disponible
	? JSON.parse(readFileSync(new URL("dist/server/wrangler.json", racine), "utf8")).vars?.SITE_ENV
	: undefined;

test("production : robots.txt autorise tout, avec la ligne Sitemap, sans noindex", { skip: environnement !== "production" }, () => {
	assert.match(robots, /^User-agent: \*\nAllow: \//);
	assert.match(robots, new RegExp(`^Sitemap: ${URL_SITE.replace(/\./g, "\\.")}/sitemap\\.xml$`, "m"));
	for (const [chemin, html] of pagesIndexables()) assert.equal(analyser(html).robots, null, chemin);
});

test("staging : robots.txt interdit tout, noindex en meta et en X-Robots-Tag", { skip: !disponible || environnement === "production" }, () => {
	assert.match(robots, /^User-agent: \*\nDisallow: \/\n/);
	assert.doesNotMatch(robots, /Sitemap:/);
	for (const [chemin, html] of pagesIndexables()) {
		assert.match(analyser(html).robots ?? "", /^noindex/, `meta robots noindex absente (${chemin})`);
	}
	assert.match(rendues.get("/").entetes.get("x-robots-tag") ?? "", /noindex/);
	assert.match(readFileSync(new URL("_headers", client), "utf8"), /X-Robots-Tag: noindex/);
});
