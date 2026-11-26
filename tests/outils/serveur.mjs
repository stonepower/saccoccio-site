// Worker construit servi par `wrangler dev` sur une D1 LOCALE alimentée par
// le kit (lancer d'abord `npm run build`) : copie de .wrangler/state (D1
// locale migrée par le prérendu du build) dans un dossier temporaire,
// migrations du projet, import des flux 20261110 puis 20261124 (25 annonces
// actives, 2 retirées), puis `wrangler dev`. La D1 locale de développement
// n'est pas modifiée. Partagé par plusieurs fichiers de test (chacun son
// serveur, sur un port aléatoire).
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const racine = new URL("../../", import.meta.url);
const etat = new URL(".wrangler/state/", racine);
const KIT = "reference/annonces-kit/xml/";

export const disponible = existsSync(new URL("dist/server/wrangler.json", racine)) && existsSync(etat);
// En CI, le build précède toujours `npm test` : ne jamais sauter ces tests.
if (process.env.CI && !disponible) throw new Error("build ou D1 locale (.wrangler/state) absents : lancer `npm run build` avant `npm test`");

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

/** Démarre le serveur ; renvoie son URL de base et de quoi l'arrêter. */
export async function demarrerServeur() {
	const dossier = mkdtempSync(join(tmpdir(), "worker-local-"));
	const persist = join(dossier, "state");
	cpSync(etat, persist, { recursive: true });
	const options = { cwd: racine, stdio: "pipe" };
	execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "saccoccio-db-staging", "--local", "--persist-to", persist], options);
	for (const f of ["04025_20261110011816.xml", "04025_20261124011818.xml"]) {
		execFileSync("node", ["scripts/import-annonces.mjs", "--local", "--persist-to", persist, "--fichier", `${KIT}${f}`], options);
	}
	const port = 18_000 + Math.floor(Math.random() * 2000);
	const base = `http://127.0.0.1:${port}`;
	const serveur = spawn(
		"npx",
		["wrangler", "dev", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(port + 1), "--persist-to", persist],
		{ cwd: racine, stdio: "ignore", detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
	);
	const arreter = () => {
		if (serveur.pid) {
			try {
				process.kill(-serveur.pid);
			} catch {}
		}
		rmSync(dossier, { recursive: true, force: true });
	};
	try {
		await attendre(`${base}/robots.txt`);
	} catch (erreur) {
		arreter();
		throw erreur;
	}
	return { base, arreter };
}
