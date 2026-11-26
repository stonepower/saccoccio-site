// Import des annonces (scripts/import-annonces.mjs) : analyse des 3 flux du
// kit, différence successive 20261001 → 20261110 → 20261124, garde-fous,
// slug stable et absence de toute adresse dans le SQL généré.
// Hors ligne : le SQL est exécuté sur une base SQLite en mémoire (node:sqlite)
// avec les vraies migrations du projet (0002, 0003). Pas besoin de build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { CHAMPS_INTERDITS, ErreurFlux, lireFlux } from "../scripts/annonces/flux.mjs";
import { sourceFichier } from "../scripts/annonces/sources.mjs";
import { calculerDifference, ErreurGardeFou, formaterResume, genererSql, REQUETE_ETAT, sql } from "../scripts/annonces/synchro.mjs";
import { analyserXml, decoder } from "../scripts/annonces/xml.mjs";
import { importer } from "../scripts/import-annonces.mjs";

const racine = new URL("../", import.meta.url);
const KIT = new URL("reference/annonces-kit/xml/", racine);
const FLUX = {
	octobre: new URL("04025_20261001011818.xml", KIT),
	novembre: new URL("04025_20261110011816.xml", KIT),
	fin: new URL("04025_20261124011818.xml", KIT),
};
const lire = (url) => new Uint8Array(readFileSync(url));

/** Base SQLite en mémoire avec les migrations du projet, vue comme la D1. */
function nouvelleBase() {
	const db = new DatabaseSync(":memory:");
	for (const m of ["0001_contact_messages.sql", "0002_annonces.sql", "0003_annonces_empreinte_contenu.sql"]) db.exec(readFileSync(new URL(`migrations/${m}`, racine), "utf8"));
	const base = {
		db,
		sql: [],
		async lireEtat() {
			return db.prepare(REQUETE_ETAT).all();
		},
		async appliquer(requetes) {
			base.sql.push(requetes);
			db.exec(requetes);
		},
	};
	return base;
}

const silencieux = () => {};

/** Annonces communes à deux flux dont le contenu (hors dateMAJ et rang) diffère. */
function vraiesModifications(avant, apres) {
	const sans = ({ dateMaj: _d, rang: _r, empreinte: _e, ...reste }) => JSON.stringify(reste);
	const parId = new Map(lireFlux(lire(avant)).annonces.map((a) => [a.immonotId, sans(a)]));
	return lireFlux(lire(apres)).annonces.filter((a) => parId.has(a.immonotId) && parId.get(a.immonotId) !== sans(a)).length;
}

/** Le même flux, avec tous les dateMAJ décalés (comme Immonot chaque nuit). */
function fluxDateMajDecalee(url, decalageMs) {
	const xml = readFileSync(url, "utf8").replace(/dateMAJ="(\d+)"/g, (_, v) => `dateMAJ="${Number(v) + decalageMs}"`);
	return { nom: "test", recupererFlux: async () => ({ octets: new TextEncoder().encode(xml), origine: "test" }) };
}
const importerFichier = (base, url, options = {}) =>
	importer({ source: sourceFichier(url.pathname), base, journal: silencieux, ...options });

test("les 3 flux du kit sont lus (UTF-8, entités) : 25, 27 et 25 annonces", () => {
	assert.equal(lireFlux(lire(FLUX.octobre), { crpcen: "04025" }).annonces.length, 25);
	assert.equal(lireFlux(lire(FLUX.novembre)).annonces.length, 27);
	const { annonces } = lireFlux(lire(FLUX.fin));
	assert.equal(annonces.length, 25);
	const villes = new Set(annonces.map((a) => a.ville));
	assert.ok(villes.has("Gréoux-les-Bains"), "accents décodés en UTF-8");
	assert.ok(annonces.some((a) => a.texte.includes("&") && !a.texte.includes("&amp;")), "entité &amp; décodée");
});

test("annonce 025/1912 normalisée (prix, surfaces, DPE, photos en https)", () => {
	const a = lireFlux(lire(FLUX.fin)).annonces.find((x) => x.refClient === "025/1912");
	assert.ok(a);
	assert.equal(a.immonotId, "0000010172__w17567318563254440");
	assert.equal(a.typeBien, "MAIS");
	assert.equal(a.ville, "Valensole");
	assert.equal(a.codePostal, "04210");
	assert.equal(a.insee, "04230");
	assert.equal(a.prix, 280280);
	assert.equal(a.prixNetVendeur, 267000);
	assert.equal(a.fraisNego, 13280);
	assert.equal(a.surfaceHabitable, 125.69);
	assert.equal(a.surfaceTerrain, 1819);
	assert.equal(a.nbPieces, 4);
	assert.deepEqual(a.details.chauffage, ["fuel", "climReversible", "cheminee"]);
	assert.deepEqual(a.details.dpe, {
		energie: 245,
		lettreEnergie: "E",
		ges: 56,
		lettreGes: "E",
		date: "23/07/2025",
		coutMin: 3430,
		coutMax: 4720,
		anneeReference: "2024",
	});
	assert.equal(a.photos.length, 17);
	assert.ok(a.photos.every((p) => p.startsWith("https://photos.immonotpro.com/")));
	assert.equal(a.negoEmail, "negociation.04025@notaires.fr");
});

test("l'adresse et les coordonnées ne sont jamais lues", () => {
	for (const url of Object.values(FLUX)) {
		const brut = readFileSync(url, "utf8");
		// Le flux d'octobre du kit n'a pas d'élément <Adresse>, les deux autres oui.
		if (!url.pathname.includes("20261001")) assert.match(brut, /<Adresse>/, "le kit contient bien des adresses");
		for (const a of lireFlux(lire(url)).annonces) {
			const json = JSON.stringify(a);
			assert.ok(!json.includes("adresse retirée"));
			for (const champ of CHAMPS_INTERDITS) assert.ok(!new RegExp(champ, "i").test(Object.keys(a).join(" ")));
			assert.ok(!/latitude|longitude/i.test(json));
		}
	}
});

test("différence 20261001 → 20261110 (+5 / −3) → 20261124 (−2), slugs stables", async () => {
	const base = nouvelleBase();
	const t0 = Date.UTC(2026, 9, 1);

	// Premier import : tout est inséré.
	const r1 = await importerFichier(base, FLUX.octobre, { maintenant: t0 });
	assert.deepEqual(r1.diff.resume, { ajouts: 25, reactivations: 0, misesAJour: 0, initialisations: 0, retraits: 0, total: 25 });
	const slugs1 = new Map(base.db.prepare("SELECT immonot_id, slug FROM annonces").all().map((l) => [l.immonot_id, l.slug]));
	assert.equal(
		slugs1.get("0000010172__w17567318563254440"),
		"maison-valensole-025-1912",
		"slug « type-ville-référence »",
	);

	// Rejouer le même flux : aucune modification.
	const bis = await importerFichier(base, FLUX.octobre, { maintenant: t0 + 1 });
	assert.deepEqual(bis.diff.resume, { ajouts: 0, reactivations: 0, misesAJour: 0, initialisations: 0, retraits: 0, total: 25 });
	assert.equal(bis.requetes, "");

	const r2 = await importerFichier(base, FLUX.novembre, { maintenant: t0 + 2 });
	assert.equal(r2.diff.resume.ajouts, 5);
	assert.equal(r2.diff.resume.retraits, 3);
	// 22 annonces ont un dateMAJ différent, mais seules les 4 dont le CONTENU a
	// changé (prix de 025/1912, 025/1937 et 025/1940, DPE de 025/1941) comptent.
	assert.equal(r2.diff.resume.misesAJour, 4, "vraies modifications seulement");
	assert.equal(vraiesModifications(FLUX.octobre, FLUX.novembre), 4);

	const r3 = await importerFichier(base, FLUX.fin, { maintenant: t0 + 3 });
	assert.equal(r3.diff.resume.ajouts, 0);
	assert.equal(r3.diff.resume.retraits, 2);
	// Les 25 dateMAJ changent ; seules les photos de 025/1961 ont changé.
	assert.equal(r3.diff.resume.misesAJour, 1);
	assert.equal(vraiesModifications(FLUX.novembre, FLUX.fin), 1);

	const compte = (where) => base.db.prepare(`SELECT count(*) AS n FROM annonces WHERE ${where}`).get().n;
	assert.equal(compte("actif = 1"), 25);
	assert.equal(compte("actif = 0 AND retire_le IS NOT NULL"), 5);
	assert.equal(compte("actif = 1 AND retire_le IS NOT NULL"), 0);

	// Les slugs n'ont jamais changé, même après mises à jour.
	for (const l of base.db.prepare("SELECT immonot_id, slug FROM annonces").all()) {
		if (slugs1.has(l.immonot_id)) assert.equal(l.slug, slugs1.get(l.immonot_id));
	}
	// cree_le conservé ; modifie_le avancé à la vraie modification (prix,
	// flux du 10/11), pas au flux suivant qui ne change que dateMAJ.
	const valensole = base.db.prepare("SELECT * FROM annonces WHERE ref_client = '025/1912'").get();
	assert.equal(valensole.cree_le, t0);
	assert.equal(valensole.modifie_le, t0 + 2);
	assert.equal(valensole.maj_le, t0 + 2);
	assert.equal(base.db.prepare("SELECT modifie_le FROM annonces WHERE ref_client = '025/1961'").get().modifie_le, t0 + 3);
	assert.equal(JSON.parse(valensole.photos)[0], "https://photos.immonotpro.com/photos/d/w17567318563254440_1756733115483.jpg");

	// Réapparition d'une annonce retirée : réactivée avec le même slug.
	const retiree = base.db.prepare("SELECT immonot_id, slug FROM annonces WHERE actif = 0 LIMIT 1").get();
	const r4 = await importerFichier(base, FLUX.octobre, { maintenant: t0 + 4 });
	assert.ok(r4.diff.resume.reactivations >= 1);
	const apres = base.db.prepare("SELECT actif, slug, retire_le FROM annonces WHERE immonot_id = ?").get(retiree.immonot_id);
	assert.equal(apres.actif, 1);
	assert.equal(apres.slug, retiree.slug);
	assert.equal(apres.retire_le, null);
});

test("un changement de contenu sans dateMAJ est détecté", async () => {
	const base = nouvelleBase();
	await importerFichier(base, FLUX.fin, { maintenant: 1 });
	const modifie = readFileSync(FLUX.fin, "utf8").replace("<PVB>280280.0</PVB>", "<PVB>275000.0</PVB>");
	const source = { nom: "test", recupererFlux: async () => ({ octets: new TextEncoder().encode(modifie), origine: "test" }) };
	const r = await importer({ source, base, journal: silencieux, maintenant: 2 });
	assert.equal(r.diff.resume.misesAJour, 1);
	assert.equal(base.db.prepare("SELECT prix FROM annonces WHERE ref_client = '025/1912'").get().prix, 275000);
});

test("deux flux qui ne diffèrent que par dateMAJ : +0 ~0 −0, rien n'est écrit, modifie_le inchangé", async () => {
	const base = nouvelleBase();
	await importerFichier(base, FLUX.fin, { maintenant: 1000 });
	const deuxJours = 2 * 24 * 3600 * 1000;
	const source = fluxDateMajDecalee(FLUX.fin, deuxJours);
	const { annonces } = lireFlux((await source.recupererFlux()).octets);
	assert.ok(annonces.every((a, i) => a.dateMaj !== lireFlux(lire(FLUX.fin)).annonces[i].dateMaj), "tous les dateMAJ changent");

	// Simulation puis import : même résumé, aucune requête.
	for (const dryRun of [true, false]) {
		const r = await importer({ source, base, journal: silencieux, maintenant: 2000, dryRun });
		assert.equal(formaterResume(r.diff.resume), "+0 ~0 −0 (25 annonce(s) dans le flux)");
		assert.equal(r.requetes, "");
	}
	assert.equal(base.sql.length, 1, "seul le premier import a écrit");
	const dates = base.db.prepare("SELECT DISTINCT modifie_le, maj_le FROM annonces").all().map((l) => ({ ...l }));
	assert.deepEqual(dates, [{ modifie_le: 1000, maj_le: 1000 }]);
});

test("une vraie modification fait avancer modifie_le (lastmod du sitemap), pas les autres", async () => {
	const base = nouvelleBase();
	await importerFichier(base, FLUX.fin, { maintenant: 1000 });
	const xml = readFileSync(FLUX.fin, "utf8")
		.replace(/dateMAJ="(\d+)"/g, (_, v) => `dateMAJ="${Number(v) + 86_400_000}"`)
		.replace("<PVB>280280.0</PVB>", "<PVB>275000.0</PVB>");
	const source = { nom: "test", recupererFlux: async () => ({ octets: new TextEncoder().encode(xml), origine: "test" }) };
	const r = await importer({ source, base, journal: silencieux, maintenant: 2000 });
	assert.equal(formaterResume(r.diff.resume), "+0 ~1 −0 (25 annonce(s) dans le flux)");
	const modifiees = base.db.prepare("SELECT ref_client FROM annonces WHERE modifie_le = 2000").all().map((l) => ({ ...l }));
	assert.deepEqual(modifiees, [{ ref_client: "025/1912" }]);
	assert.equal(base.db.prepare("SELECT count(*) AS n FROM annonces WHERE modifie_le = 1000").get().n, 24);
});

test("lignes antérieures à la migration 0003 : empreinte initialisée sans compter de modification", async () => {
	const base = nouvelleBase();
	await importerFichier(base, FLUX.fin, { maintenant: 1000 });
	// État juste après la migration 0003 : empreinte_contenu NULL, modifie_le = maj_le.
	base.db.exec("UPDATE annonces SET empreinte_contenu = NULL, modifie_le = maj_le");
	const r = await importer({ source: fluxDateMajDecalee(FLUX.fin, 86_400_000), base, journal: silencieux, maintenant: 2000 });
	assert.equal(r.diff.resume.misesAJour, 0);
	assert.equal(r.diff.resume.initialisations, 25);
	assert.match(formaterResume(r.diff.resume), /^\+0 ~0 −0 \(25 annonce\(s\) dans le flux, 25 empreinte\(s\) initialisée\(s\)\)$/);
	assert.equal(base.db.prepare("SELECT count(*) AS n FROM annonces WHERE empreinte_contenu IS NULL").get().n, 0);
	assert.equal(base.db.prepare("SELECT count(*) AS n FROM annonces WHERE modifie_le = 1000").get().n, 25, "modifie_le conservé");
	// Import suivant : plus rien à faire.
	const r2 = await importer({ source: fluxDateMajDecalee(FLUX.fin, 2 * 86_400_000), base, journal: silencieux, maintenant: 3000 });
	assert.equal(r2.requetes, "");
});

test("migration 0003 sur une base existante : modifie_le repris de maj_le", () => {
	const db = new DatabaseSync(":memory:");
	db.exec(readFileSync(new URL("migrations/0002_annonces.sql", racine), "utf8"));
	db.exec(
		"INSERT INTO annonces (immonot_id, ref_client, slug, type_bien, type_vente, ville, empreinte, cree_le, maj_le) " +
			"VALUES ('x', 'r', 's', 'MAIS', 'VENT', 'Manosque', 'e', 10, 20)",
	);
	db.exec(readFileSync(new URL("migrations/0003_annonces_empreinte_contenu.sql", racine), "utf8"));
	assert.deepEqual({ ...db.prepare("SELECT empreinte_contenu, modifie_le FROM annonces").get() }, { empreinte_contenu: null, modifie_le: 20 });
});

test("garde-fou : moins de 50 % des annonces actives → échec, rien n'est modifié", async () => {
	const base = nouvelleBase();
	await importerFichier(base, FLUX.fin, { maintenant: 1 });
	const xml = readFileSync(FLUX.fin, "utf8");
	// Flux réduit à 12 annonces (sur 25 actives).
	const clefs = [...xml.matchAll(/<Clef [\s\S]*?<\/Clef>/g)].map((m) => m[0]);
	const reduit = xml.replace(/<Clef [\s\S]*<\/Clef>/, clefs.slice(0, 12).join("\n"));
	const source = { nom: "test", recupererFlux: async () => ({ octets: new TextEncoder().encode(reduit), origine: "test" }) };
	await assert.rejects(importer({ source, base, journal: silencieux }), ErreurGardeFou);
	assert.equal(base.sql.length, 1, "aucune écriture après le premier import");
	assert.equal(base.db.prepare("SELECT count(*) AS n FROM annonces WHERE actif = 1").get().n, 25);

	// 13 annonces sur 25 : accepté (≥ 50 %).
	const limite = xml.replace(/<Clef [\s\S]*<\/Clef>/, clefs.slice(0, 13).join("\n"));
	const ok = { nom: "test", recupererFlux: async () => ({ octets: new TextEncoder().encode(limite), origine: "test" }) };
	const r = await importer({ source: ok, base, journal: silencieux, dryRun: true });
	assert.equal(r.diff.resume.retraits, 12);
});

test("garde-fous : fichier absent, vide, tronqué, invalide ou d'une autre étude", async () => {
	const base = nouvelleBase();
	const avec = (texte) => ({ nom: "t", recupererFlux: async () => ({ octets: new TextEncoder().encode(texte), origine: "t" }) });
	await assert.rejects(importer({ source: sourceFichier("/nulle/part.xml"), base, journal: silencieux }), /fichier absent/);
	await assert.rejects(importer({ source: avec(""), base, journal: silencieux }), /fichier vide/);
	const xml = readFileSync(FLUX.fin, "utf8");
	await assert.rejects(importer({ source: avec(xml.slice(0, xml.length / 2)), base, journal: silencieux }), /tronqué|XML invalide/);
	await assert.rejects(importer({ source: avec("<html><body>Erreur 500</body></html>"), base, journal: silencieux }), /racine <html>/);
	await assert.rejects(
		importer({ source: avec('<?xml version="1.0"?><EchangeNotaire><CrpCen id="04025"></CrpCen></EchangeNotaire>'), base, journal: silencieux }),
		/aucune annonce/,
	);
	await assert.rejects(importer({ source: avec(xml.replace('CrpCen id="04025"', 'CrpCen id="13001"')), base, journal: silencieux }), /13001/);
	// Octets non UTF-8 : erreur claire plutôt que des « � ».
	const latin1 = new Uint8Array([...new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><a>'), 0xe9, ...new TextEncoder().encode("</a>")]);
	assert.throws(() => lireFlux(latin1), ErreurFlux);
	assert.equal(base.sql.length, 0);
});

test("--dry-run : résumé sans écriture", async () => {
	const base = nouvelleBase();
	const r = await importerFichier(base, FLUX.fin, { dryRun: true });
	assert.equal(r.diff.resume.ajouts, 25);
	assert.equal(base.sql.length, 0);
	assert.equal(base.db.prepare("SELECT count(*) AS n FROM annonces").get().n, 0);
});

test("aucune adresse ni coordonnée dans le SQL généré", async () => {
	const base = nouvelleBase();
	for (const url of [FLUX.octobre, FLUX.novembre, FLUX.fin]) await importerFichier(base, url, { maintenant: 1 });
	const tout = base.sql.join("\n");
	assert.ok(tout.length > 10_000);
	assert.ok(!tout.includes("adresse retirée"));
	assert.ok(!/\badresse\b|latitude|longitude/i.test(tout.replace(/'[^']*'/g, "''")), "aucune colonne d'adresse");
	const colonnes = base.db.prepare("SELECT name FROM pragma_table_info('annonces')").all().map((c) => c.name);
	assert.ok(!colonnes.some((c) => /adresse|lat|lon/i.test(c)), colonnes.join(", "));
});

test("échappement SQL", () => {
	assert.equal(sql("l'étude"), "'l''étude'");
	assert.equal(sql("a\u0000b"), "'ab'");
	assert.equal(sql(null), "NULL");
	assert.equal(sql(12.5), "12.5");
	assert.throws(() => sql(Number.NaN));
	// Une valeur piégée reste une chaîne.
	const db = new DatabaseSync(":memory:");
	db.exec("CREATE TABLE t (v TEXT)");
	const piege = "x'); DROP TABLE t; --";
	db.exec(`INSERT INTO t (v) VALUES (${sql(piege)});`);
	assert.equal(db.prepare("SELECT v FROM t").get().v, piege);
});

test("analyseur XML : document mal formé refusé", () => {
	assert.throws(() => analyserXml("<a><b></a></b>"), /inattendue/);
	assert.throws(() => analyserXml("<a>"), /tronqué/);
	assert.throws(() => analyserXml('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>'), /non prise en charge/);
	assert.equal(analyserXml("<a t='1 &amp; 2'><![CDATA[<b>]]> &#233;</a>").texte, "<b> é");
	assert.equal(decoder(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e])), "<a/>");
});

test("différence : slug en collision suffixé", () => {
	const a = lireFlux(lire(FLUX.fin)).annonces[0];
	const diff = calculerDifference([a], [{ immonot_id: "autre", slug: "maison-valensole-025-1912", actif: 0, empreinte_contenu: "", rang: 0 }]);
	assert.equal(diff.insertions[0].slug, "maison-valensole-025-1912-2");
	assert.match(genererSql(diff, 1), /^INSERT INTO annonces/);
});
