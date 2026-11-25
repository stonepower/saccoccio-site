// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
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
	devToolbar: { enabled: false },
});
