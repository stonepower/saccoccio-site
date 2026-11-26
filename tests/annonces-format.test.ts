// Annonces : formats (prix, surfaces, chauffage, téléphone), slugs, recherche
// et contenu de la fiche (modules purs, sans build ni D1).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lireFlux } from "../scripts/annonces/flux.mjs";
import {
	bornesEchelle,
	classeDpe,
	construireSlug,
	formaterNombre,
	formaterPrix,
	formaterSurface,
	formaterTelephone,
	libelleChauffage,
	lienTelephone,
	paragraphes,
	prixAffiche,
	resume,
	SEUILS_ENERGIE,
	slugifier,
} from "../src/lib/annonces.ts";
import { centreCommune } from "../src/data/communes.ts";
import type { Annonce } from "../src/lib/annonces-d1.ts";
import {
	caracteristiques,
	contact,
	donneesStructurees,
	informations,
	jsonLd,
	liensCarte,
	titreAnnonce,
	vueDpe,
} from "../src/lib/annonces-fiche.ts";
import { correspond, lireCriteres, options, paginer, urlRecherche } from "../src/lib/annonces-recherche.ts";

const nb = (s: string) => s.replace(/ /g, " ");

test("prix : « 280 280 € FAI », prix sur demande", () => {
	assert.equal(nb(formaterPrix(280280)), "280 280 €");
	assert.equal(nb(formaterPrix(1666600)), "1 666 600 €");
	assert.equal(nb(formaterPrix(0)), "0 €");
	assert.equal(nb(prixAffiche({ prix: 280280, affichePrix: true, modeNego: "NV" })), "280 280 € FAI");
	assert.equal(nb(prixAffiche({ prix: 143000, affichePrix: true, modeNego: "HNI" })), "143 000 € FAI");
	assert.equal(nb(prixAffiche({ prix: 200000, affichePrix: true, modeNego: "HN" })), "200 000 € hors honoraires");
	assert.equal(prixAffiche({ prix: 280280, affichePrix: false, modeNego: "NV" }), "Prix sur demande");
	assert.equal(prixAffiche({ prix: null, affichePrix: true, modeNego: "NV" }), "Prix sur demande");
	assert.equal(nb(formaterSurface(125.69)), "125,69 m²");
	assert.equal(nb(formaterSurface(56.7)), "56,7 m²");
	assert.equal(nb(formaterSurface(1819)), "1 819 m²");
	assert.equal(nb(formaterNombre(4.9734, 2)), "4,97");
});

test("chauffage lisible", () => {
	assert.equal(libelleChauffage("fuel,climReversible,cheminee"), "Fuel, climatisation réversible, cheminée");
	assert.equal(libelleChauffage("electricite,central,fuel,climReversible,"), "Électricité, chauffage central, fuel, climatisation réversible");
	assert.equal(libelleChauffage("electricite,electricite"), "Électricité");
	assert.equal(libelleChauffage("poeleAPellets"), "Poele a pellets");
	assert.equal(libelleChauffage(""), "");
});

test("téléphone : format à espaces et lien tel:", () => {
	assert.equal(formaterTelephone("06.81.04.34.53"), "06 81 04 34 53");
	assert.equal(formaterTelephone("+33 6 81 04 34 53"), "06 81 04 34 53");
	assert.equal(lienTelephone("06.81.04.34.53"), "tel:+33681043453");
	assert.equal(lienTelephone("00.00.00.00.00"), null, "numéro anonymisé du kit : pas de lien");
});

test("slug stable « type-ville-référence »", () => {
	const base = { typeBien: "MAIS", ville: "Valensole", afficheCommune: true, departement: "04", refClient: "025/1912", immonotId: "x__w1" };
	assert.equal(construireSlug(base), "maison-valensole-025-1912");
	assert.equal(construireSlug({ ...base, typeBien: "FMCO", ville: "Gréoux-les-Bains" }), "fonds-de-commerce-greoux-les-bains-025-1912");
	assert.equal(construireSlug({ ...base, afficheCommune: false }), "maison-departement-04-025-1912");
	assert.equal(construireSlug({ ...base, refClient: "" }), "maison-valensole-w1");
	assert.equal(construireSlug(base), construireSlug({ ...base }), "déterministe");
	assert.equal(slugifier("  Œuvre d'Été ! "), "oeuvre-d-ete");
});

test("texte : paragraphes et résumé", () => {
	assert.deepEqual(paragraphes("Un.    Deux\nTrois"), ["Un.", "Deux", "Trois"]);
	const r = resume("mot ".repeat(200));
	assert.ok(r.endsWith(" [...]") && r.length < 310);
	assert.equal(resume("court"), "court");
});

test("DPE : classes et échelles", () => {
	assert.equal(classeDpe(70, SEUILS_ENERGIE), "A");
	assert.equal(classeDpe(245, SEUILS_ENERGIE), "D");
	assert.equal(classeDpe(500, SEUILS_ENERGIE), "G");
	assert.deepEqual(bornesEchelle(SEUILS_ENERGIE), ["≤ 70", "71 à 110", "111 à 180", "181 à 250", "251 à 330", "331 à 420", "> 420"]);
});

/** Annonces du kit telles que le Worker les lit (après passage par D1). */
function annoncesDuKit(): Annonce[] {
	const { annonces } = lireFlux(new Uint8Array(readFileSync(new URL("../reference/annonces-kit/xml/04025_20261124011818.xml", import.meta.url))));
	return annonces.map((a) => ({ ...a, slug: construireSlug(a), majLe: 0 }) as unknown as Annonce);
}

test("fiche 025/1912 : caractéristiques, informations, DPE, contact", () => {
	const a = annoncesDuKit().find((x) => x.refClient === "025/1912");
	assert.ok(a);
	assert.equal(titreAnnonce(a), "Maison - Valensole");
	const c = caracteristiques(a).map((l) => `${l.libelle} : ${nb(l.valeur)}`);
	assert.deepEqual(c.slice(0, 4), [
		"Type de chauffage : Fuel, climatisation réversible, cheminée",
		"Surface terrain : 1 819 m²",
		"Surface habitable : 125,69 m²",
		"Nombre de pièces : 4",
	]);
	assert.ok(c.includes("Garage : Oui"));
	assert.ok(c.includes("Taxe foncière : 1 388 € par an"));
	assert.ok(!c.some((l) => l.startsWith("Piscine")), "valeur vide non affichée");

	const infos = Object.fromEntries(informations(a).map((l) => [l.libelle, nb(l.valeur)]));
	assert.equal(infos.Prix, "280 280 € FAI");
	assert.equal(infos["Réf."], "025/1912");
	assert.equal(infos["Code postal"], "04210", "vrai code postal, pas l'INSEE (04230)");
	assert.equal(infos.Ville, "Valensole");
	assert.equal(infos["Type de vente"], "Vente");
	assert.equal(infos["Prix net vendeur"], "267 000 €");
	assert.equal(infos["Honoraires de négociation (inclus)"], "13 280 €, soit 4,97 % du prix net vendeur, à la charge de l'acquéreur");
	assert.equal(infos["Frais d'acte (estimation)"], "21 676 €, en sus du prix");

	const dpe = vueDpe(a);
	assert.equal(dpe.etat, "complet");
	if (dpe.etat === "complet") {
		assert.deepEqual(dpe.energie, { valeur: 245, lettre: "E" });
		assert.deepEqual(dpe.ges, { valeur: 56, lettre: "E" });
		assert.equal(nb(dpe.couts ?? ""), "entre 3 430 € et 4 720 € par an");
		assert.equal(dpe.anneeReference, "2024");
	}
	assert.equal(vueDpe({ ...a, details: { dpe: { exempte: true } } }).etat, "exempte");
	assert.equal(vueDpe({ ...a, details: { dpe: { vierge: true } } }).etat, "vierge");
	assert.equal(vueDpe({ ...a, details: {} }).etat, "non-communique");

	// Négociateur du flux affiché ; téléphone anonymisé du kit → service négociation.
	assert.deepEqual(contact({ ...a, negoNom: "Marine BOURRE", negoTel: "06.81.04.34.53" }), {
		nom: "Marine BOURRE",
		tel: "06 81 04 34 53",
		telLien: "tel:+33681043453",
		email: "negociation.04025@notaires.fr",
	});
	assert.equal(contact(a).tel, "04 92 70 70 70");
});

test("données structurées schema.org et carte à l'échelle de la commune", () => {
	const a = annoncesDuKit()[0] as Annonce;
	const d = donneesStructurees(a, "https://exemple.test/annonces/x/");
	assert.equal(d["@type"], "RealEstateListing");
	assert.equal((d.offers as Record<string, unknown>).price, 280280);
	assert.ok(!JSON.stringify(d).match(/latitude|streetAddress/i));
	assert.ok(!jsonLd({ t: "</script>" }).includes("</"));
	const carte = liensCarte(centreCommune("04230"), a);
	assert.equal(carte?.agrandir, "https://www.openstreetmap.org/#map=13/43.8390/5.9390");
	assert.match(carte?.iframe ?? "", /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=/);
	assert.equal(liensCarte(null, a)?.iframe, null);
	assert.equal(liensCarte(null, { ...a, afficheCommune: false }), null);
});

test("recherche : critères, filtres, listes présentes et pagination", () => {
	const annonces = annoncesDuKit();
	const tous = lireCriteres(new URLSearchParams(""));
	assert.equal(annonces.filter((a) => correspond(a, tous)).length, 25);

	const c = lireCriteres(new URLSearchParams("ville=Valensole&type=Maison&prix_min=100000&prix_max=300000"));
	assert.deepEqual({ ...c }, { departement: "", ville: "Valensole", type: "maison", prixMin: 100000, prixMax: 300000, page: 1 });
	const trouves = annonces.filter((a) => correspond(a, c));
	assert.ok(trouves.length > 0);
	assert.ok(trouves.every((a) => a.ville === "Valensole" && a.typeBien === "MAIS" && (a.prix ?? 0) <= 300000));

	const plus = lireCriteres(new URLSearchParams("prix_min=1000000&prix_max=1000000plus"));
	assert.deepEqual(annonces.filter((a) => correspond(a, plus)).map((a) => a.refClient), ["025/1941"]);

	// Valeurs hors liste ignorées.
	const bizarre = lireCriteres(new URLSearchParams("prix_min=12&prix_max=abc&page=-4"));
	assert.equal(bizarre.prixMin, null);
	assert.equal(bizarre.prixMax, null);
	assert.equal(bizarre.page, 1);
	assert.equal(annonces.filter((a) => correspond(a, lireCriteres(new URLSearchParams("ville=Paris")))).length, 0);

	const o = options(annonces);
	assert.deepEqual(o.villes.map((v) => v.libelle), ["Digne-les-Bains", "Gréoux-les-Bains", "Manosque", "Sainte-Tulle", "Valensole", "Volx"]);
	assert.deepEqual(o.types.map((t) => t.valeur), ["appartement", "fonds-de-commerce", "immeuble-de-rapport", "maison", "terrain"]);
	assert.deepEqual(o.departements.map((d) => d.valeur), ["04"]);

	const p = paginer(annonces, 9);
	assert.deepEqual({ page: p.page, pages: p.pages, n: p.elements.length }, { page: 3, pages: 3, n: 5 });
	assert.equal(urlRecherche({ ...c, page: 2 }), "/annonces/?ville=Valensole&type=maison&prix_min=100000&prix_max=300000&page=2");
	assert.equal(urlRecherche(tous), "/annonces/");
});
