#!/usr/bin/env node
// Applique les migrations du schéma EmDash sur la D1 d'un environnement
// déployé, depuis GitHub Actions (rien n'est lancé à la main).
//
// Usage : node scripts/emdash-migrate.mjs <staging|production> [--take-over-lock <id>]
//
// Variables d'environnement :
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  lues par `emdash migrate`
//   EXPECTED_D1_NAME, EXPECTED_D1_ID             D1 attendue, écrite en dur
//                                                dans le workflow
//   STALE_LOCK_MINUTES                           staging : âge à partir
//                                                duquel un verrou est repris
//                                                automatiquement (défaut 15)
//
// Pourquoi ce script : en non interactif, `emdash migrate` exige
// `--expected-target-fingerprint`. Ce fingerprint ne peut pas être fixé
// d'avance (personne ne lance `--status` à la main), donc on le lit dans
// `--status --json`, mais seulement après avoir vérifié que la cible est
// exactement la D1 attendue :
//   1. la D1 du binding DB dans wrangler.jsonc (pour cet --env) a le nom et
//      l'UUID attendus (EXPECTED_D1_*) ;
//   2. la cible rapportée par EmDash (résolue via l'API Cloudflare) a ce
//      même compte, ce nom, cet UUID et cet environnement Wrangler ;
//   3. son fingerprint est égal à celui qu'on recalcule nous-mêmes
//      (SHA-256 de {"kind":"d1","identity":[compte, uuid]}, comme dans
//      @emdash-cms/cloudflare 1.6.0).
// Toute divergence arrête le job AVANT la moindre écriture.
//
// Verrou de migration (`_emdash_migrations_lock`) :
//   - production : jamais repris ni libéré ici ; le job échoue avec l'id ;
//   - staging : repris si son id est passé en `--take-over-lock` (entrée
//     `take_over_lock_id` du workflow), ou automatiquement s'il a plus de
//     STALE_LOCK_MINUTES minutes (aucune requête Worker ne dure aussi
//     longtemps, et les déploiements sont sérialisés par le groupe de
//     concurrence).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const WRANGLER_CONFIG = "wrangler.jsonc";
const EMDASH_BIN = resolve(ROOT, "node_modules/.bin/emdash");
const LOCK_ID_PATTERN = /^[1-9]\d{0,15}$/;

function fail(message) {
	console.log(`::error::${message}`);
	process.exit(1);
}

function notice(message) {
	console.log(`::notice::${message}`);
}

// --- Arguments -------------------------------------------------------------

const args = process.argv.slice(2);
const environment = args[0];
if (environment !== "staging" && environment !== "production") {
	fail("Usage : node scripts/emdash-migrate.mjs <staging|production> [--take-over-lock <id>]");
}
let takeOverLockId = "";
for (let i = 1; i < args.length; i++) {
	if (args[i] === "--take-over-lock") {
		takeOverLockId = (args[++i] ?? "").trim();
	} else {
		fail(`Argument inconnu : ${args[i]}`);
	}
}
if (takeOverLockId !== "") {
	if (environment !== "staging") {
		fail(
			"La reprise du verrou de migration est réservée à staging. En production, rien n'est repris : " +
				"vérifier qu'aucune migration ne tourne, puis traiter le verrou à la main (voir CLAUDE.md).",
		);
	}
	if (!LOCK_ID_PATTERN.test(takeOverLockId)) {
		fail(`take_over_lock_id invalide (« ${takeOverLockId} ») : attendu l'id numérique affiché par --status.`);
	}
}

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim().toLowerCase();
const expectedName = process.env.EXPECTED_D1_NAME ?? "";
const expectedId = (process.env.EXPECTED_D1_ID ?? "").toLowerCase();
if (!/^[0-9a-f]{32}$/.test(accountId)) fail("CLOUDFLARE_ACCOUNT_ID absent ou invalide.");
if (!process.env.CLOUDFLARE_API_TOKEN) fail("CLOUDFLARE_API_TOKEN absent.");
if (!expectedName || !expectedId) fail("EXPECTED_D1_NAME et EXPECTED_D1_ID sont obligatoires.");

const staleLockMinutes = Number(process.env.STALE_LOCK_MINUTES ?? "15");
if (!Number.isFinite(staleLockMinutes) || staleLockMinutes < 5) {
	fail("STALE_LOCK_MINUTES doit être un nombre ≥ 5.");
}

// --- 1. wrangler.jsonc désigne bien la D1 attendue ------------------------

const require = createRequire(resolve(ROOT, "package.json"));
const wrangler = await import(pathToFileURL(require.resolve("wrangler")).href);
const config = wrangler.unstable_readConfig(
	{ config: resolve(ROOT, WRANGLER_CONFIG), env: environment },
	{ hideWarnings: true },
);
const bindings = (config.d1_databases ?? []).filter((d) => d.binding === "DB");
if (bindings.length !== 1) fail(`${WRANGLER_CONFIG} (--env ${environment}) doit avoir exactement un binding D1 « DB ».`);
const [db] = bindings;
if (db.database_name !== expectedName || String(db.database_id).toLowerCase() !== expectedId) {
	fail(
		`${WRANGLER_CONFIG} (--env ${environment}) pointe vers ${db.database_name} (${db.database_id}) ` +
			`au lieu de ${expectedName} (${expectedId}). Rien n'a été modifié.`,
	);
}

const expectedFingerprint = createHash("sha256")
	.update(JSON.stringify({ kind: "d1", identity: [accountId, expectedId] }))
	.digest("hex");

// --- 2. État des migrations ------------------------------------------------

const targetArgs = ["--wrangler-config", WRANGLER_CONFIG, "--wrangler-env", environment];

function emdashMigrate(extra) {
	console.log(`$ emdash migrate ${[...extra, ...targetArgs].join(" ")}`);
	// stderr (cible, messages d'erreur) est affiché tel quel : EmDash y masque
	// déjà les jetons et URLs. stdout est capturé pour le JSON.
	return spawnSync(EMDASH_BIN, ["migrate", ...extra, ...targetArgs], {
		cwd: ROOT,
		env: process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	});
}

const statusRun = emdashMigrate(["--status", "--json"]);
if (statusRun.status !== 0) {
	fail(`emdash migrate --status a échoué (code ${statusRun.status ?? statusRun.signal}). Rien n'a été modifié.`);
}
let report;
try {
	report = JSON.parse(statusRun.stdout.trim().split("\n").at(-1));
} catch {
	fail("Sortie JSON de emdash migrate --status illisible. Rien n'a été modifié.");
}

// --- 3. La cible rapportée par EmDash est bien la D1 attendue --------------

const t = report.target ?? {};
const checks = [
	["kind", t.kind, "d1"],
	["accountId", t.accountId, accountId],
	["resourceId", t.resourceId, expectedId],
	["label", t.label, `${accountId}/${expectedName}/${expectedId}`],
	["environment", t.environment, environment],
	["fingerprint", t.fingerprint, expectedFingerprint],
];
for (const [field, actual, expected] of checks) {
	if (actual !== expected) {
		fail(
			`Cible de migration inattendue (${field} : « ${actual} » au lieu de « ${expected} »). ` +
				"Rien n'a été modifié. Si seul le fingerprint diffère, EmDash a peut-être changé sa façon " +
				"de le calculer : vérifier la cible à la main avant d'adapter ce script.",
		);
	}
}
console.log(`✓ Cible vérifiée : D1 ${expectedName} (${expectedId}), environnement ${environment}`);

const list = (names) => (names.length === 0 ? "aucune" : names.join(", "));
console.log(`Migrations appliquées : ${report.knownApplied.length}`);
console.log(`Migrations en attente : ${list(report.pending)}`);
console.log(`Migrations inconnues : ${list(report.unknownApplied)}`);

if (report.unknownApplied.length > 0) {
	fail(
		`La base contient des migrations EmDash inconnues de ce code (${list(report.unknownApplied)}) : ` +
			"elle a été migrée par une version plus récente d'EmDash. Déployer cette version plus ancienne " +
			"est refusé.",
	);
}

// --- 4. Verrou ---------------------------------------------------------------

const fingerprintArgs = ["--expected-target-fingerprint", expectedFingerprint];
let action = null;

if (report.lock) {
	const { id, heldSince } = report.lock;
	const ageMinutes = (Date.now() - Date.parse(heldSince)) / 60_000;
	const age = `${Math.floor(ageMinutes)} min`;
	console.log(`Verrou de migration : tenu depuis ${heldSince} (${age}), id ${id}`);

	if (environment === "production") {
		fail(
			`Verrou de migration tenu sur la D1 de production depuis ${heldSince} (id ${id}). ` +
				"Le workflow ne reprend jamais un verrou en production : rien n'a été migré ni déployé. " +
				"Vérifier qu'aucune migration ne tourne et que la base est cohérente (sauvegarde de ce run), " +
				"puis traiter le verrou à la main (voir CLAUDE.md, « Verrou de migration »).",
		);
	}

	if (takeOverLockId !== "") {
		if (takeOverLockId !== id) {
			fail(
				`take_over_lock_id (${takeOverLockId}) ne correspond pas au verrou actuel (id ${id}). ` +
					"Le verrou a changé : relancer avec le nouvel id si besoin.",
			);
		}
		notice(`Reprise du verrou ${id} demandée (workflow_dispatch).`);
	} else if (ageMinutes >= staleLockMinutes) {
		notice(`Verrou ${id} abandonné depuis ${age} (≥ ${staleLockMinutes} min) : reprise automatique sur staging.`);
	} else {
		fail(
			`Verrou de migration récent sur staging (${age}, id ${id}) : une migration tourne peut-être encore. ` +
				`Réessayer dans ${staleLockMinutes} min (reprise automatique), ou relancer deploy-staging ` +
				`(Run workflow) avec take_over_lock_id = ${id}.`,
		);
	}
	action = ["--take-over-lock", id];
} else if (takeOverLockId !== "") {
	notice(`Aucun verrou tenu : take_over_lock_id (${takeOverLockId}) est ignoré.`);
}

if (!action && report.pending.length === 0) {
	console.log("✓ Schéma EmDash à jour, rien à appliquer.");
	process.exit(0);
}

// --- 5. Application ---------------------------------------------------------

const applyRun = emdashMigrate([...(action ?? []), ...fingerprintArgs]);
if (applyRun.stdout) process.stdout.write(applyRun.stdout);
if (applyRun.status !== 0) {
	fail(`emdash migrate a échoué (code ${applyRun.status ?? applyRun.signal}).`);
}
console.log("✓ Migrations EmDash appliquées.");
