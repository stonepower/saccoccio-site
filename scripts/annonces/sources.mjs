/**
 * Récupération du flux : source interchangeable.
 *
 * Une source est un objet `{ nom, recupererFlux() }` dont `recupererFlux()`
 * renvoie `{ octets: Uint8Array, origine: string }`. L'import ne connaît que
 * cette interface : passer à un dépôt FTP, SFTP ou à une URL ne demande
 * qu'une nouvelle implémentation ici (voir docs/annonces.md).
 *
 * Implémentée aujourd'hui : « fichier » (chemin local, par exemple un
 * fichier de reference/annonces-kit/xml/).
 */
import { readFile, stat } from "node:fs/promises";
import { ErreurFlux } from "./flux.mjs";

/** Taille maximale acceptée (le flux réel fait environ 150 Ko). */
export const TAILLE_MAX = 20 * 1024 * 1024;

/**
 * @typedef {{ nom: string, recupererFlux(): Promise<{ octets: Uint8Array, origine: string }> }} SourceFlux
 */

/**
 * Fichier local.
 * @param {string} chemin
 * @returns {SourceFlux}
 */
export function sourceFichier(chemin) {
	return {
		nom: "fichier",
		async recupererFlux() {
			if (!chemin) throw new ErreurFlux("aucun fichier indiqué (--fichier)");
			let infos;
			try {
				infos = await stat(chemin);
			} catch {
				throw new ErreurFlux(`fichier absent : ${chemin}`);
			}
			if (!infos.isFile()) throw new ErreurFlux(`${chemin} n'est pas un fichier`);
			if (infos.size === 0) throw new ErreurFlux(`fichier vide : ${chemin}`);
			if (infos.size > TAILLE_MAX) throw new ErreurFlux(`fichier trop gros (${infos.size} octets) : ${chemin}`);
			return { octets: new Uint8Array(await readFile(chemin)), origine: chemin };
		},
	};
}

/**
 * Source choisie en ligne de commande. Les sources futures (« url »,
 * « sftp »…) s'ajoutent ici, avec leurs secrets lus dans l'environnement.
 * @param {string} type
 * @param {Record<string, string | undefined>} options
 * @returns {SourceFlux}
 */
export function creerSource(type, options) {
	switch (type) {
		case "fichier":
			return sourceFichier(options.fichier ?? "");
		default:
			throw new ErreurFlux(`source « ${type} » inconnue (disponible : fichier)`);
	}
}
