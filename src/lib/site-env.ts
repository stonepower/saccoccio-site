import { env } from "cloudflare:workers";

/** Environnement de déploiement (variable SITE_ENV de wrangler.jsonc). */
export function getSiteEnv(): Env["SITE_ENV"] {
	return env.SITE_ENV;
}

/** Seule la production est indexable par les moteurs de recherche. */
export function isIndexable(): boolean {
	return env.SITE_ENV === "production";
}

/**
 * L'interface d'administration EmDash (/_emdash/*) reste fermée tant que
 * EMDASH_ADMIN_ENABLED ne vaut pas exactement "true".
 */
export function isAdminEnabled(): boolean {
	return env.EMDASH_ADMIN_ENABLED === "true";
}
