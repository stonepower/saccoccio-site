// Page Contact et politique de confidentialité dans le build (lancer d'abord
// `npm run build`), et garde-fous sur les messages stockés.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const racine = new URL("../", import.meta.url);
const lire = (chemin) => readFileSync(new URL(chemin, racine), "utf8");

test("/contact/ est prérendue avec le formulaire complet", () => {
	const html = lire("dist/client/contact/index.html");
	assert.match(html, /<form[^>]+method="post"[^>]+action="\/contact\/envoi\/#statut-envoi"/);
	for (const nom of ["nom", "email", "telephone", "destinataire", "message", "consentement", "site_web"])
		assert.match(html, new RegExp(`name="${nom}"`), `champ ${nom}`);
	assert.match(html, /aria-live="polite"/);
	assert.match(html, /class="cf-turnstile" data-sitekey="[^"]+" data-action="contact"/);
	assert.match(html, /href="\/politique-de-confidentialite\/"/);
	assert.match(html, /href="\/contact\/plans-acces-horaires\/"/);
	assert.match(html, /href="\/contact\/coordonnees\/"/);
	// Coordonnées des trois études.
	for (const tel of ["04 92 70 70 70", "04 92 70 14 40", "04 92 70 14 30"]) assert.ok(html.includes(tel), tel);
	// Aucun traceur (pas de Google Maps comme sur l'ancien site).
	assert.ok(!/google/i.test(html));
});

test("/politique-de-confidentialite/ est prérendue et marquée « à valider »", () => {
	const html = lire("dist/client/politique-de-confidentialite/index.html");
	assert.match(html, /Texte à valider par l'étude/);
	assert.match(html.replace(/<!--.*?-->/g, ""), /au plus tard 30(\s|&nbsp;)jours/);
});

test("aucune page ni route ne lit les messages stockés", () => {
	const fichiers = readdirSync(new URL("src/", racine), { recursive: true }).filter((f) => /\.(ts|astro|mjs)$/.test(f));
	for (const f of fichiers) {
		const source = lire(`src/${f}`);
		assert.ok(!/SELECT[^;]*contact_messages/i.test(source), `lecture de contact_messages dans src/${f}`);
	}
});

test("staging : messages en D1 ; production : e-mail, binding pas encore déclaré", () => {
	const config = lire("wrangler.jsonc");
	assert.ok(!/"send_email"/.test(config.replace(/\/\/.*$/gm, "")), "binding send_email déclaré trop tôt");
	assert.ok(existsSync(new URL("migrations/0001_contact_messages.sql", racine)));
});
