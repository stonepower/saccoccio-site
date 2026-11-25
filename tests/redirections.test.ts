// Redirections 301 des anciennes URL (reference/contenus-kit/urls.csv).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { construireTable, trouverRedirection } from "../src/lib/redirections.ts";

const csv = readFileSync(new URL("../reference/contenus-kit/urls.csv", import.meta.url), "utf8");
const table = construireTable(csv);
const r = (chemin: string) => {
	const url = new URL(chemin, "https://exemple.test");
	return trouverRedirection(table, url.pathname, url.search);
};

test("pages : product_info.php?products_id=N et <slug>-p-N.html", () => {
	assert.equal(r("/product_info.php?products_id=2"), "/office-notarial/");
	assert.equal(r("/product_info.php?products_id=313&osCsid=abc"), "/droit-de-la-famille/mariage/");
	assert.equal(r("/le-mariage-p-313.html"), "/droit-de-la-famille/mariage/");
	assert.equal(r("/lettre-notaire-p-312.html"), "/lettre-du-notaire/");
	assert.equal(r("/product_info.php?products_id=1"), "/");
	assert.equal(r("/product_info.php?products_id=62"), "/informations-juridiques/");
	assert.equal(r("/product_info.php?products_id=311"), "/annonces/");
});

test("chaque page de la carte a sa redirection", () => {
	for (const ligne of csv.trim().split("\n").slice(1)) {
		const [type, id, , , , , nouvelle] = ligne.split(",");
		if (type !== "page") continue;
		assert.equal(r(`/product_info.php?products_id=${id}`), nouvelle, `products_id=${id}`);
		assert.equal(r(`/une-page-p-${id}.html`), nouvelle, `-p-${id}.html`);
	}
});

test("annonces : id inconnu (changeant chaque nuit) et allprods.php", () => {
	assert.equal(r("/product_info.php?products_id=98765"), "/annonces/");
	assert.equal(r("/maison-manosque-p-98765.html"), "/annonces/");
	assert.equal(r("/allprods.php"), "/annonces/");
});

test("rubriques cPath", () => {
	assert.equal(r("/index.php?cPath=2"), "/office-notarial/");
	assert.equal(r("/index.php?cPath=16_18"), "/informations-juridiques/");
	assert.equal(r("/notre-etude-c-2.html"), "/office-notarial/");
	assert.equal(r("/index.php?cPath=17"), "/contact/");
	assert.equal(r("/index.php?cPath=14"), "/simulateur-pret/");
	assert.equal(r("/index.php"), "/");
	assert.equal(r("/index.php?cPath=999"), null);
});

test("simulateur et contact", () => {
	assert.equal(r("/CalcAmortEuR2.htm"), "/simulateur-pret/");
	assert.equal(r("/simulateur-c-14.html"), "/simulateur-pret/");
	assert.equal(r("/contact_us.php"), "/contact/");
	assert.equal(r("/contact_us.php?service=negociation&objet=Je%20veux%20vendre"), "/contact/");
});

test("les nouvelles URL ne sont pas redirigées", () => {
	assert.equal(r("/office-notarial/"), null);
	assert.equal(r("/documents/mai.pdf"), null);
	assert.equal(r("/product_info.php"), null);
});
