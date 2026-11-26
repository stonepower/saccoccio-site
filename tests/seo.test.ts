// SEO : fonctions pures (longueurs, URL canoniques, données structurées),
// sans build. Le rendu des pages est vérifié par tests/seo.test.mjs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { lireFlux } from "../scripts/annonces/flux.mjs";
import { CENTRES_COMMUNES } from "../src/data/communes.ts";
import { SITES, URL_SITE } from "../src/data/site.ts";
import { construireSlug } from "../src/lib/annonces.ts";
import type { Annonce } from "../src/lib/annonces-d1.ts";
import { descriptionSeo, donneesStructurees, titreSeo } from "../src/lib/annonces-fiche.ts";
import {
	couper,
	DESCRIPTION_MAX,
	descriptionPage,
	donneesEtude,
	filArianeLd,
	grapheLd,
	telephoneInternational,
	TITRE_MAX,
	titrePage,
	urlCanonique,
} from "../src/lib/seo.ts";

test("URL du site : production, https, sans « / » final", () => {
	assert.equal(URL_SITE, "https://www.saccoccio-et-associes-manosque-notaires.fr");
});

test("URL canonique : domaine de production, paramètres gardés, fragment retiré", () => {
	assert.equal(urlCanonique("/annonces/"), `${URL_SITE}/annonces/`);
	assert.equal(urlCanonique("/annonces/?page=2#x"), `${URL_SITE}/annonces/?page=2`);
	assert.equal(urlCanonique("https://saccoccio-staging.lcollin.workers.dev/contact/"), `${URL_SITE}/contact/`);
});

test("titres et descriptions : coupés aux longueurs maximales", () => {
	assert.equal(titrePage("Lexique"), "Lexique – Saccoccio & Associés, notaires");
	assert.equal(titrePage("Politique de confidentialité"), "Politique de confidentialité – Saccoccio & Associés");
	const long = titrePage("Droit rural : Ventes - Donations - Partages et encore un très long sujet");
	assert.ok(long.length <= TITRE_MAX, long);
	const d = descriptionPage("mot ".repeat(80));
	assert.ok(d.length <= DESCRIPTION_MAX && d.endsWith("…"), d);
	assert.equal(couper("court", 10), "court");
});

test("téléphones au format international", () => {
	assert.equal(telephoneInternational("04 92 70 70 70"), "+33 4 92 70 70 70");
	assert.equal(telephoneInternational("Fax : 04 92 70 14 32"), "+33 4 92 70 14 32");
});

test("Notary : les 3 études, adresses et téléphones du pied de page", () => {
	const [, etude] = donneesEtude() as Record<string, any>[];
	assert.equal(etude?.["@type"], "Notary");
	const etudes = [etude, ...etude?.department];
	assert.deepEqual(
		etudes.map((e) => e.address.addressLocality),
		SITES.map((s) => s.ville),
	);
	assert.deepEqual(etude?.address, {
		"@type": "PostalAddress",
		streetAddress: "29 Avenue Jean Giono",
		postOfficeBoxNumber: "103",
		postalCode: "04101",
		addressLocality: "Manosque",
		addressRegion: "Alpes-de-Haute-Provence",
		addressCountry: "FR",
	});
	assert.equal(etudes[1].address.streetAddress, "237 chemin Sainte Annette");
	assert.equal(etudes[1].telephone, "+33 4 92 70 14 40");
	assert.equal(etudes[2].address.postalCode, "04210");
	assert.equal(etudes[2].faxNumber, "+33 4 92 70 14 32");
	for (const e of etudes) assert.doesNotMatch(JSON.stringify(e), /geo|latitude/i);
});

test("BreadcrumbList : maillons sans page ignorés, page courante en dernier", () => {
	const fil = filArianeLd(
		[{ label: "Informations juridiques", href: "/informations-juridiques/" }, { label: "Droit rural" }, { label: "Baux ruraux" }],
		`${URL_SITE}/droit-rural/baux-ruraux/`,
	) as Record<string, any>;
	assert.deepEqual(
		fil.itemListElement.map((e: Record<string, unknown>) => [e.position, e.name, e.item]),
		[
			[1, "Accueil", `${URL_SITE}/`],
			[2, "Informations juridiques", `${URL_SITE}/informations-juridiques/`],
			[3, "Baux ruraux", `${URL_SITE}/droit-rural/baux-ruraux/`],
		],
	);
	assert.equal(filArianeLd([], `${URL_SITE}/`), null);
	const g = grapheLd([{ "@context": "https://schema.org", "@type": "Thing" }, null]);
	assert.deepEqual(g, { "@context": "https://schema.org", "@graph": [{ "@type": "Thing" }] });
});

function annoncesDesFlux(): Annonce[] {
	const dossier = new URL("../reference/annonces-kit/xml/", import.meta.url);
	const parRef = new Map<string, Annonce>();
	for (const f of readdirSync(dossier).filter((n) => n.endsWith(".xml"))) {
		const { annonces } = lireFlux(new Uint8Array(readFileSync(new URL(f, dossier))));
		for (const a of annonces) parRef.set(a.refClient, { ...a, slug: construireSlug(a), majLe: 0 } as unknown as Annonce);
	}
	return [...parRef.values()];
}

test("fiches du kit : title et description ≤ maximum, uniques, depuis type, commune, surface et prix", () => {
	const annonces = annoncesDesFlux();
	assert.ok(annonces.length >= 25);
	const titres = new Set<string>();
	const descriptions = new Set<string>();
	for (const a of annonces) {
		const t = titreSeo(a);
		const d = descriptionSeo(a);
		assert.ok(t.length <= TITRE_MAX, `${t.length} : ${t}`);
		assert.ok(d.length <= DESCRIPTION_MAX, `${d.length} : ${d}`);
		assert.ok(t.includes(a.refClient) && d.includes(a.refClient), "référence (unicité)");
		assert.ok(!titres.has(t) && !descriptions.has(d), `doublon : ${t}`);
		titres.add(t);
		descriptions.add(d);
	}
	const a = annonces.find((x) => x.refClient === "025/1912");
	assert.ok(a);
	assert.equal(titreSeo(a).replace(/ /g, " "), "Maison à Valensole, 126 m², 280 280 € – réf. 025/1912");
});

test("titre et description d'une fiche : cas extrêmes coupés au maximum", () => {
	const [base] = annoncesDesFlux();
	assert.ok(base);
	const extreme = {
		...base,
		typeBien: "IMMR",
		ville: "Saint-Martin-de-Brômes-sur-une-très-longue-commune",
		surfaceHabitable: 123_456.78,
		surfaceTerrain: 987_654.32,
		nbPieces: 42,
		prix: 12_345_678,
		refClient: "025/99999",
	} as Annonce;
	assert.ok(titreSeo(extreme).length <= TITRE_MAX, titreSeo(extreme));
	assert.ok(descriptionSeo(extreme).length <= DESCRIPTION_MAX, descriptionSeo(extreme));
	const masquee = { ...base, afficheCommune: false, affichePrix: false } as Annonce;
	assert.doesNotMatch(titreSeo(masquee), new RegExp(base.ville));
	assert.match(titreSeo(masquee), /prix sur demande/);
});

test("RealEstateListing : prix, commune et code postal, ni adresse ni coordonnées", () => {
	for (const a of annoncesDesFlux()) {
		const d = donneesStructurees(a, `${URL_SITE}/annonces/${a.slug}/`) as Record<string, any>;
		assert.equal(d["@type"], "RealEstateListing");
		assert.equal(d.offers["@type"], "Offer");
		assert.equal(d.offers.seller["@id"], `${URL_SITE}/#etude`);
		if (a.afficheCommune) {
			assert.equal(d.about.address.addressLocality, a.ville);
			assert.equal(d.about.address.postalCode, a.codePostal);
		}
		assert.doesNotMatch(JSON.stringify(d), /streetAddress|latitude|longitude|"geo"/i);
	}
});

test("centres des communes : 3 décimales au plus (jamais plus précis que la commune)", () => {
	for (const [insee, c] of Object.entries(CENTRES_COMMUNES)) {
		assert.match(insee, /^04\d{3}$/);
		for (const v of [c.lat, c.lon]) assert.ok(Math.round(v * 1000) / 1000 === v, `${c.nom} : ${v}`);
	}
	assert.deepEqual(CENTRES_COMMUNES["04230"], { nom: "Valensole", lat: 43.839, lon: 5.939 });
});
