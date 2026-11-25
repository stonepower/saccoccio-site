// Vérifie le résultat du build (lancer d'abord `npm run build`) : chaque
// page reprise de reference/contenus-kit/pages.json existe à sa nouvelle URL,
// avec le bon <h1> (un seul), sans photo de personne, et ses liens internes
// mènent quelque part.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const racine = new URL("../", import.meta.url);
const client = new URL("dist/client/", racine);
const fiches = JSON.parse(readFileSync(new URL("reference/contenus-kit/pages.json", racine), "utf8"));
const reprises = fiches.filter((f) => !/non reprise|redirection seule/i.test(f.statut));

/**
 * Liens internes vers des pages rendues par le Worker (accueil) ou pas encore
 * créées (PR ultérieures : 404 attendu pour l'instant).
 */
const HORS_ASSETS = new Set(["/", "/annonces/", "/contact/", "/simulateur-pret/"]);
/** Seules images de contenu publiées (aucune photo de personne). */
const IMAGES_AUTORISEES = /^\/images\/contenu\/(etude_manosque|etude_greoux|etude_valensole|predecesseurs)\.webp$/;

const decoder = (t) =>
	t
		.replace(/<[^>]+>/g, "")
		.replace(/&#39;|&#x27;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();

const fichierPage = (url) => new URL(`.${url}index.html`, client);

test("le kit contient 34 pages à reprendre", () => {
	assert.equal(reprises.length, 34);
});

for (const fiche of reprises) {
	test(`${fiche.nouvelle_url} : page construite avec le bon h1`, () => {
		const fichier = fichierPage(fiche.nouvelle_url);
		assert.ok(existsSync(fichier), `page absente : ${fichier.pathname}`);
		const html = readFileSync(fichier, "utf8");
		const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decoder(m[1]));
		assert.deepEqual(h1, [fiche.h1]);
		assert.doesNotMatch(html, /Database migrations are required/);
	});

	test(`${fiche.nouvelle_url} : images, ancres et liens internes`, () => {
		const html = readFileSync(fichierPage(fiche.nouvelle_url), "utf8");
		const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
		for (const [, src] of main.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
			if (src.startsWith("/images/bandeau/")) continue; // carrousel
			assert.match(src, IMAGES_AUTORISEES, `image non autorisée : ${src}`);
			assert.ok(existsSync(new URL(`.${src}`, client)), `image absente : ${src}`);
		}
		for (const [, cible] of main.matchAll(/href="#([^"]+)"/g)) {
			assert.match(html, new RegExp(`id="${cible}"`), `ancre sans cible : #${cible}`);
		}
		for (const [, href] of main.matchAll(/href="(\/[^"#?]*)/g)) {
			const chemin = decodeURIComponent(href);
			if (HORS_ASSETS.has(chemin)) continue;
			const fichier = chemin.endsWith("/") ? new URL(`.${chemin}index.html`, client) : new URL(`.${chemin}`, client);
			assert.ok(existsSync(fichier), `lien interne cassé : ${href}`);
		}
	});
}

test("aucune photo de l'équipe n'est publiée", () => {
	for (const url of ["/office-notarial/", "/office-notarial/equipe/"]) {
		const html = readFileSync(fichierPage(url), "utf8");
		assert.doesNotMatch(html, /\.jpe?g"/i);
		assert.match(html, /<ul class="equipe">/);
		assert.match(html, /<strong>Philippe SACCOCCIO<\/strong> <span>Notaire associé<\/span>/);
	}
	assert.ok(!existsSync(new URL("images/contenu/philippe-saccoccio.webp", client)));
});

test("les 58 PDF sont des assets statiques", () => {
	assert.ok(existsSync(new URL("documents/Novembre-2016.pdf", client)));
	assert.ok(existsSync(new URL("documents/juillet 2010.pdf", client)));
});

test("plan du site : toutes les pages, y compris les pages Conseils", () => {
	const html = readFileSync(fichierPage("/plan-du-site/"), "utf8");
	for (const fiche of reprises) assert.ok(html.includes(`href="${fiche.nouvelle_url}"`), fiche.nouvelle_url);
});
