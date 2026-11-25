// Rendu des pages d'annonces par le Worker construit (lancer d'abord
// `npm run build`), sur une D1 LOCALE alimentée par le kit :
// copie de .wrangler/state (D1 locale migrée par le prérendu du build) dans
// un dossier temporaire, migrations du projet, import des flux 20261110 puis
// 20261124 (25 annonces actives, 2 retirées), puis `wrangler dev`.
// La D1 locale de développement n'est pas modifiée.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const racine = new URL("../", import.meta.url);
const etat = new URL(".wrangler/state/", racine);
const KIT = "reference/annonces-kit/xml/";
const disponible = existsSync(new URL("dist/server/wrangler.json", racine)) && existsSync(etat);
// En CI, le build précède toujours `npm test` : ne jamais sauter ces tests.
if (process.env.CI && !disponible) throw new Error("build ou D1 locale (.wrangler/state) absents : lancer `npm run build` avant `npm test`");

let dossier;
let serveur;
let base;

async function attendre(url, essais = 120) {
	for (let i = 0; i < essais; i++) {
		try {
			const r = await fetch(url);
			if (r.status < 500) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`le serveur ne répond pas : ${url}`);
}

before(
	async () => {
		if (!disponible) return;
		dossier = mkdtempSync(join(tmpdir(), "annonces-rendu-"));
		const persist = join(dossier, "state");
		cpSync(etat, persist, { recursive: true });
		const options = { cwd: racine, stdio: "pipe" };
		execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "saccoccio-db-staging", "--local", "--persist-to", persist], options);
		for (const f of ["04025_20261110011816.xml", "04025_20261124011818.xml"]) {
			execFileSync("node", ["scripts/import-annonces.mjs", "--local", "--persist-to", persist, "--fichier", `${KIT}${f}`], options);
		}
		const port = 18_000 + Math.floor(Math.random() * 2000);
		base = `http://127.0.0.1:${port}`;
		serveur = spawn(
			"npx",
			["wrangler", "dev", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(port + 1), "--persist-to", persist],
			{ cwd: racine, stdio: "ignore", detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
		);
		await attendre(`${base}/robots.txt`);
	},
	{ timeout: 180_000 },
);

after(() => {
	if (serveur?.pid) {
		try {
			process.kill(-serveur.pid);
		} catch {}
	}
	if (dossier) rmSync(dossier, { recursive: true, force: true });
});

const page = async (chemin) => {
	const r = await fetch(`${base}${chemin}`, { redirect: "manual" });
	return { statut: r.status, entetes: r.headers, html: (await r.text()).replace(/\u00a0/g, " ") };
};
const texte = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ").replace(/ /g, " ");

test("/annonces/ : 25 annonces, cartes, formulaire de recherche", { skip: !disponible && "build ou D1 locale absents" }, async () => {
	const { statut, entetes, html } = await page("/annonces/");
	assert.equal(statut, 200, html.slice(0, 300));
	assert.match(entetes.get("cache-control") ?? "", /max-age=300/);
	assert.match(texte(html), /25 annonces en ligne/);
	assert.equal(html.match(/<article class="annonce"/g)?.length, 10, "10 annonces par page");
	assert.match(html, /href="\/annonces\/maison-valensole-025-1912\/"/);
	assert.match(texte(html), /280 280 € FAI/);
	assert.match(html, /<img src="https:\/\/photos\.immonotpro\.com\/[^"]+" alt="Maison à Valensole" width="585" height="430" loading="lazy"/);
	for (const nom of ["departement", "ville", "type", "prix_min", "prix_max"]) assert.match(html, new RegExp(`name="${nom}"`));
	assert.match(html, /<option value="Gréoux-les-Bains"/);
	assert.match(html, /<option value="1000000plus"/);
	assert.match(html, /href="\/annonces\/\?page=3"/);
	assert.ok(!/Ma sélection|Alerte mail/.test(html));
	assert.ok(!/google/i.test(html));
});

test("/annonces/ : recherche et état vide", { skip: !disponible }, async () => {
	const r = await page("/annonces/?ville=Valensole&type=maison&prix_max=300000");
	assert.equal(r.statut, 200);
	assert.match(texte(r.html), /\d+ annonces? correspond/);
	assert.match(r.html, /<option value="Valensole" selected/);
	const vide = await page("/annonces/?ville=Paris");
	assert.match(texte(vide.html), /Aucune annonce ne correspond à votre recherche/);
});

test("fiche 025/1912 : informations de l'ancienne fiche", { skip: !disponible }, async () => {
	const { statut, html } = await page("/annonces/maison-valensole-025-1912/");
	assert.equal(statut, 200);
	const t = texte(html);
	assert.match(html, /<title>Maison - Valensole – 280 280 € FAI – réf\. 025\/1912/);
	assert.match(html, /<meta name="description" content="Maison à vendre à Valensole/);
	assert.match(html, /<link rel="canonical" href="[^"]+\/annonces\/maison-valensole-025-1912\/"/);
	for (const attendu of [
		"Toutes nos offres",
		"Rechercher un logement",
		"Type : Maison",
		"Ville : Valensole",
		"Objet : Vente",
		"Prix : 280 280 € FAI",
		"Maison - Valensole",
		"Type de chauffage : Fuel, climatisation réversible, cheminée",
		"Surface terrain : 1 819 m²",
		"Surface habitable : 125,69 m²",
		"Nombre de pièces : 4",
		"245 kWhEP/m².an (classe E)",
		"56 kgeqCO2/m².an (classe E)",
		"entre 3 430 € et 4 720 € par an",
		"Réf. : 025/1912",
		"Code postal : 04210",
		"Type de vente : Vente",
		"Imprimer cette fiche",
		"Envoyer à un ami",
		"Contactez-nous à propos de cette annonce",
		"Agrandir le plan",
		"Simuler vos mensualités",
		"Vous souhaitez acheter",
		"Vous souhaitez un avis de valeur",
	]) {
		assert.ok(t.includes(attendu), `absent : ${attendu}`);
	}
	assert.ok(!t.includes("Code postal : 04230"), "le code INSEE n'est pas affiché comme code postal");
	// Texte complet de l'annonce.
	assert.ok(t.includes("Contactez notre office notarial pour obtenir de plus amples renseignements sur cette maison à vendre à Valensole."));
	// Galerie : 17 photos, la première seule sans lazy.
	assert.equal(html.match(/<li id="photo-\d+"/g)?.length, 17);
	assert.equal(html.match(/<img[^>]+alt="Maison - Valensole : photo[^"]*"[^>]+loading="eager"/g)?.length, 1);
	// Données structurées.
	const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
	assert.equal(ld["@type"], "RealEstateListing");
	assert.equal(ld.offers.price, 280280);
	// Liens : mailto, contact prérempli, OpenStreetMap ; ni adresse ni Google.
	assert.match(html, /href="mailto:\?subject=/);
	assert.match(html, /href="mailto:negociation\.04025@notaires\.fr\?subject=/);
	assert.match(html, /href="\/contact\/\?service=negociation&amp;objet=Annonce%20r%C3%A9f\.%20025%2F1912/);
	assert.match(html, /href="https:\/\/www\.openstreetmap\.org\/#map=13\/43\.8370\/5\.9830"/);
	assert.ok(!/<iframe/.test(html), "la carte n'est chargée qu'à la demande");
	assert.ok(!/google|adresse retirée|43\.83<|5\.97</i.test(html));
	assert.ok(!/Ma sélection|Alerte mail/.test(html));
});

test("annonce retirée : 410 ; inconnue : 404", { skip: !disponible }, async () => {
	const retiree = await page("/annonces/maison-valensole-025-1958/");
	assert.equal(retiree.statut, 410);
	assert.match(texte(retiree.html), /n'est plus en ligne/);
	assert.match(retiree.html, /href="\/annonces\/"/);
	assert.match(retiree.html, /<meta name="robots" content="noindex/);
	assert.equal((await page("/annonces/n-existe-pas/")).statut, 404);
});

test("sitemap : annonces actives", { skip: !disponible }, async () => {
	const { statut, html } = await page("/sitemap.xml");
	assert.equal(statut, 200);
	assert.match(html, /\/annonces\/<\/loc>/);
	assert.equal(html.match(/\/annonces\/[a-z0-9-]+\/<\/loc>/g)?.length, 25);
	assert.ok(!html.includes("maison-valensole-025-1958"), "annonce retirée absente");
});
