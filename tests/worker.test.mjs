// Vérifie le bundle du Worker (lancer d'abord `npm run build`).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const serveur = new URL("../dist/server/", import.meta.url);
const sources = readdirSync(serveur, { recursive: true })
	.filter((f) => String(f).endsWith(".mjs"))
	.map((f) => readFileSync(new URL(String(f), serveur), "utf8"));

test("le Worker déployé n'a pas de mode de migration EmDash forcé", () => {
	// astro.config.mjs force « auto » dans l'environnement de PRÉRENDU
	// seulement : ce réglage ne doit jamais atteindre le Worker (mode « check »).
	const lecture = sources.join("\n").match(/processOverride \?\? ([^\n,]+)/);
	assert.ok(lecture, "lecture de EMDASH_MIGRATIONS_MODE introuvable dans le bundle");
	assert.equal(lecture[1].trim(), "void 0");
});

test("le contenu des pages n'est pas dans le Worker", () => {
	const tout = sources.join("\n");
	// Phrase du lexique (page prérendue) : ne doit pas être livrée au Worker.
	assert.ok(!tout.includes("ACHAT EN ETAT FUTUR D'ACHEVEMENT"));
});
