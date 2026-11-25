// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

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
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
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
