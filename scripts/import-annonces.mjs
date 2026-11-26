#!/usr/bin/env node
/**
 * Import des annonces Immonot dans la D1 (table `annonces`), par différence.
 * Voir docs/annonces.md.
 *
 * Usage :
 *   node scripts/import-annonces.mjs --env staging --fichier reference/annonces-kit/xml/04025_20261124011818.xml [--dry-run]
 *   node scripts/import-annonces.mjs --local --fichier … [--persist-to dossier] (D1 locale de `npm run dev`)
 *
 * Étapes : récupération du flux (source interchangeable), analyse et
 * normalisation, lecture de l'état de la base (une requête), garde-fous,
 * différence, puis application en UN fichier SQL par
 * `wrangler d1 execute --remote --file`. En --dry-run, seul le résumé
 * (+N ~N −N) est affiché : rien n'est écrit.
 *
 * Code de sortie : 0 succès ; 1 flux absent, vide, invalide, garde-fou
 * déclenché ou erreur de la base (rien n'est modifié dans ces cas, sauf
 * échec de wrangler pendant l'écriture : relancer, la différence est
 * recalculée).
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { lireFlux } from "./annonces/flux.mjs";
import { creerSource } from "./annonces/sources.mjs";
import { calculerDifference, formaterResume, genererSql, REQUETE_ETAT } from "./annonces/synchro.mjs";

/** Bases D1 par environnement (identiques à wrangler.jsonc). */
export const BASES = {
	staging: "saccoccio-db-staging",
	production: "saccoccio-db-prod",
};

/** Code CRPCEN de l'étude : un flux d'une autre étude est refusé. */
export const CRPCEN = "04025";

function executer(commande, args) {
	return new Promise((resolve, reject) => {
		execFile(commande, args, { maxBuffer: 64 * 1024 * 1024 }, (erreur, stdout, stderr) => {
			if (erreur) reject(new Error(`${commande} ${args.slice(0, 4).join(" ")} … a échoué :\n${stderr || stdout || erreur.message}`));
			else resolve(stdout);
		});
	});
}

/**
 * Accès à la D1 par Wrangler. `--local` vise la D1 locale (développement).
 * @param {{ env?: string, local?: boolean, persistTo?: string }} cible
 */
export function baseWrangler({ env, local, persistTo }) {
	const nom = local ? BASES.staging : BASES[env ?? ""];
	if (!nom) throw new Error(`environnement inconnu : ${env} (staging ou production)`);
	const communs = ["wrangler", "d1", "execute", nom, local ? "--local" : "--remote"];
	if (env) communs.push("--env", env);
	if (local && persistTo) communs.push("--persist-to", persistTo);
	return {
		description: `${nom} (${local ? "locale" : `distante, --env ${env}`})`,
		async lireEtat() {
			const sortie = await executer("npx", [...communs, "--json", "--command", REQUETE_ETAT]);
			const json = JSON.parse(sortie.slice(sortie.indexOf("[")));
			const resultat = json[0];
			if (!resultat?.success && resultat?.success !== undefined) throw new Error("lecture de la table annonces refusée");
			return resultat?.results ?? [];
		},
		async appliquer(requetes) {
			const dossier = await mkdtemp(join(tmpdir(), "import-annonces-"));
			const fichier = join(dossier, "import.sql");
			try {
				await writeFile(fichier, requetes, { mode: 0o600 });
				await executer("npx", [...communs, "--file", fichier, "--yes"]);
			} finally {
				await rm(dossier, { recursive: true, force: true });
			}
		},
	};
}

/**
 * Import complet. Séparé de la ligne de commande pour les tests (base et
 * source injectées).
 * @param {{ source: import("./annonces/sources.mjs").SourceFlux, base: { lireEtat(): Promise<any[]>, appliquer(sql: string): Promise<void> }, dryRun?: boolean, maintenant?: number, journal?: (m: string) => void }} p
 */
export async function importer({ source, base, dryRun = false, maintenant = Date.now(), journal = console.log }) {
	const { octets, origine } = await source.recupererFlux();
	const { annonces } = lireFlux(octets, { crpcen: CRPCEN });
	journal(`Flux ${origine} : ${annonces.length} annonce(s).`);
	const existantes = await base.lireEtat();
	const diff = calculerDifference(annonces, existantes);
	const requetes = genererSql(diff, maintenant);
	journal(`Différence : ${formaterResume(diff.resume)}`);
	for (const a of diff.insertions) journal(`  + ${a.refClient} /annonces/${a.slug}/`);
	for (const a of diff.reactivations) journal(`  + ${a.refClient} /annonces/${a.slug}/ (réactivée)`);
	for (const a of diff.misesAJour) journal(`  ~ ${a.refClient} /annonces/${a.slug}/`);
	for (const a of diff.initialisations) journal(`  = ${a.refClient} /annonces/${a.slug}/ (empreinte initialisée)`);
	for (const r of diff.retraits) journal(`  − /annonces/${r.slug}/`);
	if (dryRun) {
		journal("--dry-run : aucune modification.");
	} else if (requetes) {
		await base.appliquer(requetes);
		journal("Modifications appliquées.");
	} else {
		journal("Aucune modification nécessaire.");
	}
	return { diff, requetes };
}

async function principal() {
	const { values } = parseArgs({
		options: {
			env: { type: "string" },
			local: { type: "boolean", default: false },
			"persist-to": { type: "string" },
			source: { type: "string", default: "fichier" },
			fichier: { type: "string" },
			"dry-run": { type: "boolean", default: false },
		},
	});
	if (!values.local && !values.env) throw new Error("préciser --env staging|production (ou --local)");
	if (values.local && values.env) throw new Error("--local et --env sont exclusifs");
	const base = baseWrangler({ env: values.env, local: values.local, persistTo: values["persist-to"] });
	console.log(`Base : ${base.description}`);
	const { diff } = await importer({
		source: creerSource(values.source ?? "fichier", { fichier: values.fichier }),
		base,
		dryRun: values["dry-run"],
	});
	if (process.env.GITHUB_STEP_SUMMARY) {
		const { appendFile } = await import("node:fs/promises");
		await appendFile(
			process.env.GITHUB_STEP_SUMMARY,
			`### Import des annonces (${base.description})\n\n${values["dry-run"] ? "**Simulation (--dry-run)** : " : ""}${formaterResume(diff.resume)}\n`,
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	principal().catch((e) => {
		const titre = e?.name === "ErreurFlux" || e?.name === "ErreurGardeFou" ? "Import refusé" : "Import en échec";
		console.error(`::error::${titre} : ${e?.message ?? e}`);
		process.exit(1);
	});
}
