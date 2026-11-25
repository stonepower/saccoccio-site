// Page /simulateur-pret/ (lancer d'abord `npm run build`) et nettoyage du
// spam de l'ancienne page du simulateur dans reference/.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const racine = new URL("../", import.meta.url);
const client = new URL("dist/client/", racine);

test("le spam caché de l'ancien simulateur n'est plus dans reference/", () => {
	const dossier = new URL("reference/", racine);
	const fichiers = readdirSync(dossier, { recursive: true }).filter((f) => /\.html?$/i.test(String(f)));
	assert.ok(fichiers.length > 0);
	for (const f of fichiers) {
		const html = readFileSync(new URL(String(f), dossier), "latin1");
		// Liste rendue invisible (hauteur de 1 px, débordement caché).
		assert.doesNotMatch(html, /height:\s*[01]px;\s*overflow:\s*hidden/i, f);
	}
	// L'ancienne page ne contient plus qu'un seul lien externe : celui du calculateur tiers.
	const simulateur = readFileSync(new URL("design-kit/pages/simulateur.html", dossier), "latin1");
	const hotes = new Set([...simulateur.matchAll(/href="https?:\/\/([^/"]+)/gi)].map((m) => m[1].toLowerCase()));
	assert.deepEqual([...hotes], ["www.calcul-de-pret.com"]);
});

test("/simulateur-pret/ est prérendue, avec formulaire, mentions et noscript", () => {
	const fichier = new URL("simulateur-pret/index.html", client);
	assert.ok(existsSync(fichier), "page absente");
	const html = readFileSync(fichier, "utf8");
	assert.match(html, /<h1\b[^>]*>Simulateur de prêt<\/h1>/);
	assert.match(html, /<title>Simulateur de prêt immobilier/);
	assert.match(html, /<noscript>/);
	assert.match(html, /Simulation indicative, non contractuelle ; elle ne constitue pas une offre de prêt\./);
	assert.match(html, /Un crédit vous engage et doit être remboursé\. Vérifiez vos capacités de remboursement avant de vous engager\./);
	assert.match(html, /aria-live="polite"/);
	for (const id of ["sim-montant", "sim-echeance", "sim-taux", "sim-duree", "sim-periodicite", "sim-assurance"]) {
		assert.match(html, new RegExp(`<label for="${id}"`), `label manquant : ${id}`);
	}
	// Aucun lien vers l'ancien calculateur tiers, aucun script externe.
	assert.doesNotMatch(html, /calcul-de-pret\.com|Peladeau/i);
	assert.doesNotMatch(html, /<script[^>]+src="https?:/);
});

test("le simulateur est au plan du site et au sitemap, pas dans le Worker", () => {
	const plan = readFileSync(new URL("plan-du-site/index.html", client), "utf8");
	assert.match(plan, /href="\/simulateur-pret\/"/);
	const serveur = new URL("../dist/server/", import.meta.url);
	const sources = readdirSync(serveur, { recursive: true })
		.filter((f) => String(f).endsWith(".mjs"))
		.map((f) => readFileSync(new URL(String(f), serveur), "utf8"))
		.join("\n");
	assert.match(sources, /"\/simulateur-pret\/"/, "sitemap.xml");
	assert.ok(!sources.includes("Vérifiez vos capacités de remboursement"), "page du simulateur dans le Worker");
	assert.ok(!sources.includes("capitalEmpruntable"), "calcul du simulateur dans le Worker");
});
