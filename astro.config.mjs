// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { appendFile, readFile } from "node:fs/promises";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

/**
 * Page de démonstration du gabarit sur /_design/ : Astro ignore les fichiers
 * de src/pages/ dont le nom commence par « _ », d'où cette route injectée.
 * La page est en noindex (meta et en-tête X-Robots-Tag) dans tous les
 * environnements.
 * @type {import("astro").AstroIntegration}
 */
const pageDemoDesign = {
	name: "saccoccio:page-demo-design",
	hooks: {
		"astro:config:setup": ({ injectRoute }) => {
			injectRoute({ pattern: "/_design", entrypoint: "./src/demo/design.astro" });
		},
	},
};

/**
 * Hors production, X-Robots-Tag: noindex sur les ASSETS statiques aussi
 * (pages prérendues, PDF, images) : ils sont servis sans passer par le
 * Worker, donc sans le middleware src/middleware/gate.ts. L'environnement
 * est connu au build (CLOUDFLARE_ENV) ; sans lui, on désindexe par défaut.
 * @type {import("astro").AstroIntegration}
 */
const noindexAssetsHorsProduction = {
	name: "saccoccio:noindex-assets",
	hooks: {
		"astro:build:done": async ({ dir, logger }) => {
			if (process.env.CLOUDFLARE_ENV === "production") return;
			const fichier = new URL("_headers", dir);
			const existant = await readFile(fichier, "utf8").catch(() => "");
			if (existant.includes("X-Robots-Tag")) return;
			await appendFile(fichier, `${existant && !existant.endsWith("\n") ? "\n" : ""}/*\n  X-Robots-Tag: noindex, nofollow\n`);
			logger.info("X-Robots-Tag: noindex ajouté à _headers (hors production).");
		},
	},
};

export default defineConfig({
	output: "server",
	adapter: cloudflare({
		// Les sessions Astro utilisent le KV existant (binding CACHE) au lieu
		// du binding SESSION par défaut, que Wrangler créerait automatiquement.
		sessionKVBindingName: "CACHE",
		// Pas de binding Cloudflare Images pour l'instant (plan gratuit, photos
		// des annonces hébergées chez Immonot). À revoir si besoin.
		imageService: "passthrough",
	}),
	integrations: [
		pageDemoDesign,
		noindexAssetsHorsProduction,
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			// Migrations du schéma EmDash : appliquées par les workflows de
			// déploiement (`emdash migrate`, voir scripts/emdash-migrate.mjs),
			// jamais par le Worker. En mode « check », le Worker vérifie
			// seulement l'état (une requête) et répond 503 s'il manque des
			// migrations : il ne crée plus ~90 tables pendant une requête, ce
			// que la limite de CPU du plan gratuit coupait en plein milieu.
			// En développement local (`npm run dev`), « auto » est conservé.
			migrations: { runtime: "check", dev: "auto" },
			// Pas de back-office pour l'instant : serveur MCP coupé.
			mcp: false,
			// Pas de polices Google Fonts injectées (admin inutilisé, et RGPD).
			fonts: false,
			// Admin livré en français uniquement (l'anglais est toujours inclus) :
			// réduit nettement la taille du Worker.
			admin: { locales: ["fr"] },
			// S'exécute AVANT EmDash : bloque /_emdash/* et ajoute
			// X-Robots-Tag: noindex sur staging. Voir src/middleware/gate.ts.
			middleware: { outer: "./src/middleware/gate.ts" },
		}),
	],
	vite: {
		environments: {
			// Prérendu des pages statiques (pages éditoriales) : il s'exécute au
			// build dans un worker local (workerd) dont la D1 est locale, vide et
			// éphémère. Le middleware d'EmDash y vérifie aussi les migrations : en
			// mode « check », il écrirait la page 503 « Database migrations are
			// required » à la place du contenu. Dans CET environnement seulement,
			// le mode « auto » migre la D1 locale du build. Le Worker déployé
			// (environnement « ssr ») reste en « check » : vérifié par
			// scripts/check-migrations-mode.sh dans la CI.
			prerender: {
				define: { "import.meta.env.EMDASH_MIGRATIONS_MODE": JSON.stringify("auto") },
			},
		},
	},
	devToolbar: { enabled: false },
});
