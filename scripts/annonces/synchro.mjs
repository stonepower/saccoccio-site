/**
 * Synchronisation par différence entre le flux du jour et la table
 * `annonces` (migrations/0002_annonces.sql), sur Clef/@id (`immonot_id`).
 *
 * - insertion : annonce absente de la base ;
 * - réactivation : annonce retirée qui réapparaît (comptée avec les ajouts) ;
 * - mise à jour : `dateMAJ` ou contenu (empreinte) différent ;
 * - retrait : annonce active absente du flux (`actif = 0`, `retire_le`) ;
 * - rang : seul l'ordre a changé (non compté comme une mise à jour).
 *
 * Garde-fous (rien n'est écrit) : flux vide, ou moins de 50 % des annonces
 * actives en base. Le SQL produit est échappé ici (D1 n'accepte pas de
 * paramètres liés dans un fichier) : chaînes entre apostrophes doublées,
 * nombres vérifiés, NULL explicite.
 */
import { construireSlug } from "../../src/lib/annonces.ts";

export class ErreurGardeFou extends Error {
	constructor(message) {
		super(message);
		this.name = "ErreurGardeFou";
	}
}

/** Part minimale des annonces actives que le flux doit contenir. */
export const SEUIL_MINIMUM = 0.5;

/** Colonnes écrites à partir d'une annonce normalisée (hors slug et suivi). */
const COLONNES = {
	ref_client: (a) => a.refClient,
	rang: (a) => a.rang,
	type_bien: (a) => a.typeBien,
	sous_nature: (a) => a.sousNature,
	type_vente: (a) => a.typeVente,
	ville: (a) => a.ville,
	code_postal: (a) => a.codePostal,
	insee: (a) => a.insee,
	departement: (a) => a.departement,
	affiche_commune: (a) => (a.afficheCommune ? 1 : 0),
	affiche_prix: (a) => (a.affichePrix ? 1 : 0),
	prix: (a) => a.prix,
	prix_net_vendeur: (a) => a.prixNetVendeur,
	frais_nego: (a) => a.fraisNego,
	frais_acte: (a) => a.fraisActe,
	mode_nego: (a) => a.modeNego,
	charge_nego: (a) => a.chargeNego,
	surface_habitable: (a) => a.surfaceHabitable,
	surface_terrain: (a) => a.surfaceTerrain,
	nb_pieces: (a) => a.nbPieces,
	nb_chambres: (a) => a.nbChambres,
	texte: (a) => a.texte,
	photos: (a) => JSON.stringify(a.photos),
	details: (a) => JSON.stringify(a.details),
	nego_nom: (a) => a.negoNom,
	nego_tel: (a) => a.negoTel,
	nego_email: (a) => a.negoEmail,
	date_creation: (a) => a.dateCreation,
	date_maj: (a) => a.dateMaj,
	empreinte: (a) => a.empreinte,
};

/** Littéral SQL sûr pour SQLite / D1. */
export function sql(valeur) {
	if (valeur === null || valeur === undefined) return "NULL";
	if (typeof valeur === "boolean") return valeur ? "1" : "0";
	if (typeof valeur === "number") {
		if (!Number.isFinite(valeur)) throw new Error(`nombre invalide : ${valeur}`);
		return String(valeur);
	}
	if (typeof valeur !== "string") throw new Error(`type non pris en charge : ${typeof valeur}`);
	// Apostrophes doublées ; NUL retiré (il tronquerait la chaîne).
	return `'${valeur.replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

/** Identifiant de colonne (liste blanche ci-dessus) : jamais issu du flux. */
const colonne = (nom) => {
	if (!/^[a-z_]+$/.test(nom)) throw new Error(`colonne invalide : ${nom}`);
	return nom;
};

/**
 * @typedef {{ immonot_id: string, slug: string, actif: number, date_maj: number | null, empreinte: string, rang: number }} LigneExistante
 */

/**
 * Vérifie les garde-fous. Lève ErreurGardeFou si le flux est suspect.
 * @param {unknown[]} annonces annonces du flux
 * @param {LigneExistante[]} existantes lignes de la base
 */
export function verifierGardeFous(annonces, existantes, seuil = SEUIL_MINIMUM) {
	if (!annonces.length) throw new ErreurGardeFou("le flux ne contient aucune annonce : rien n'a été modifié.");
	const actives = existantes.filter((l) => Number(l.actif) === 1).length;
	if (actives > 0 && annonces.length < actives * seuil) {
		throw new ErreurGardeFou(
			`le flux ne contient que ${annonces.length} annonce(s) pour ${actives} active(s) en base ` +
				`(minimum ${Math.ceil(actives * seuil)}, soit ${Math.round(seuil * 100)} %). ` +
				"Flux probablement tronqué : rien n'a été modifié.",
		);
	}
}

/**
 * Différence entre le flux et la base.
 * @param {ReturnType<typeof import("./flux.mjs").normaliserClef>[]} annonces
 * @param {LigneExistante[]} existantes
 */
export function calculerDifference(annonces, existantes, { seuil = SEUIL_MINIMUM } = {}) {
	verifierGardeFous(annonces, existantes, seuil);
	const parId = new Map(existantes.map((l) => [l.immonot_id, l]));
	const slugsPris = new Set(existantes.map((l) => l.slug));
	const dansLeFlux = new Set(annonces.map((a) => a.immonotId));

	const insertions = [];
	const reactivations = [];
	const misesAJour = [];
	const rangs = [];
	for (const a of annonces) {
		const ligne = parId.get(a.immonotId);
		if (!ligne) {
			let slug = construireSlug(a);
			for (let n = 2; slugsPris.has(slug); n++) slug = `${construireSlug(a)}-${n}`;
			slugsPris.add(slug);
			insertions.push({ ...a, slug });
		} else if (Number(ligne.actif) !== 1) {
			reactivations.push({ ...a, slug: ligne.slug });
		} else if (Number(ligne.date_maj ?? 0) !== Number(a.dateMaj ?? 0) || ligne.empreinte !== a.empreinte) {
			misesAJour.push({ ...a, slug: ligne.slug });
		} else if (Number(ligne.rang) !== a.rang) {
			rangs.push({ immonotId: a.immonotId, rang: a.rang });
		}
	}
	const retraits = existantes.filter((l) => Number(l.actif) === 1 && !dansLeFlux.has(l.immonot_id));

	return {
		insertions,
		reactivations,
		misesAJour,
		retraits: retraits.map((l) => ({ immonotId: l.immonot_id, slug: l.slug })),
		rangs,
		resume: {
			ajouts: insertions.length + reactivations.length,
			reactivations: reactivations.length,
			misesAJour: misesAJour.length,
			retraits: retraits.length,
			total: annonces.length,
		},
	};
}

/** « +5 ~22 −3 (27 annonces dans le flux) ». */
export function formaterResume(r) {
	const dont = r.reactivations ? ` dont ${r.reactivations} réactivée(s)` : "";
	return `+${r.ajouts}${dont} ~${r.misesAJour} −${r.retraits} (${r.total} annonce(s) dans le flux)`;
}

/**
 * Requêtes SQL de la différence (une par ligne). Rejouer un import après un
 * échec partiel est sans risque : la différence est recalculée.
 * @param {ReturnType<typeof calculerDifference>} diff
 * @param {number} maintenant millisecondes depuis l'epoch
 */
export function genererSql(diff, maintenant) {
	const t = sql(maintenant);
	const lignes = [];
	const noms = Object.keys(COLONNES).map(colonne);
	const valeurs = (a) => noms.map((n) => sql(COLONNES[n](a)));

	for (const a of diff.insertions) {
		lignes.push(
			`INSERT INTO annonces (immonot_id, slug, ${noms.join(", ")}, actif, cree_le, maj_le, retire_le) ` +
				`VALUES (${sql(a.immonotId)}, ${sql(a.slug)}, ${valeurs(a).join(", ")}, 1, ${t}, ${t}, NULL);`,
		);
	}
	for (const a of [...diff.reactivations, ...diff.misesAJour]) {
		const v = valeurs(a);
		const affectations = noms.map((n, i) => `${n} = ${v[i]}`).join(", ");
		lignes.push(
			`UPDATE annonces SET ${affectations}, actif = 1, retire_le = NULL, maj_le = ${t} ` +
				`WHERE immonot_id = ${sql(a.immonotId)};`,
		);
	}
	for (const r of diff.rangs) {
		lignes.push(`UPDATE annonces SET rang = ${sql(r.rang)} WHERE immonot_id = ${sql(r.immonotId)};`);
	}
	for (const r of diff.retraits) {
		lignes.push(
			`UPDATE annonces SET actif = 0, retire_le = ${t}, maj_le = ${t} ` +
				`WHERE immonot_id = ${sql(r.immonotId)} AND actif = 1;`,
		);
	}
	return lignes.length ? `${lignes.join("\n")}\n` : "";
}

/** Requête de lecture de l'état de la base (une seule). */
export const REQUETE_ETAT = "SELECT immonot_id, slug, actif, date_maj, empreinte, rang FROM annonces";
