/**
 * Recherche dans les annonces (formulaire « Rechercher un logement », en GET,
 * comme l'ancien site) : lecture des paramètres, filtres, listes de choix
 * (villes et types présents) et pagination.
 *
 * Module pur (sans accès à D1) : testé par tests/annonces-pages.test.ts.
 */
import { libelleTypeBien, PALIERS_PRIX, PRIX_MAX_PLUS, slugifier } from "./annonces.ts";

/** Annonces par page de la liste. */
export const PAR_PAGE = 10;

/** Ce dont la recherche a besoin d'une annonce. */
export interface AnnonceCherchable {
	typeBien: string;
	ville: string;
	departement: string | null;
	afficheCommune: boolean;
	affichePrix: boolean;
	prix: number | null;
}

export interface Criteres {
	departement: string;
	ville: string;
	/** Slug du libellé du type (« maison », « fonds-de-commerce »). */
	type: string;
	prixMin: number | null;
	/** null : pas de limite ; PRIX_MAX_PLUS : plus de 1 000 000 €. */
	prixMax: number | typeof PRIX_MAX_PLUS | null;
	page: number;
}

export interface Option {
	valeur: string;
	libelle: string;
}

export interface Options {
	departements: Option[];
	villes: Option[];
	types: Option[];
}

const court = (v: string | null, max = 80) => (v ?? "").trim().slice(0, max);

/** Paramètres de l'URL → critères (valeurs inconnues ignorées). */
export function lireCriteres(params: URLSearchParams): Criteres {
	const min = Number(court(params.get("prix_min"), 10));
	const maxBrut = court(params.get("prix_max"), 12);
	const max = Number(maxBrut);
	const page = Number(court(params.get("page"), 6));
	return {
		departement: court(params.get("departement"), 3),
		ville: court(params.get("ville")),
		type: slugifier(court(params.get("type"))),
		prixMin: params.get("prix_min") !== null && PALIERS_PRIX.includes(min) ? min : null,
		prixMax: maxBrut === PRIX_MAX_PLUS ? PRIX_MAX_PLUS : max > 0 && PALIERS_PRIX.includes(max) ? max : null,
		page: Number.isInteger(page) && page > 1 ? page : 1,
	};
}

/** Une recherche est-elle en cours (au moins un filtre) ? */
export function aDesFiltres(c: Criteres): boolean {
	return Boolean(c.departement || c.ville || c.type || c.prixMin !== null || c.prixMax !== null);
}

/** L'annonce correspond-elle aux critères ? */
export function correspond(a: AnnonceCherchable, c: Criteres): boolean {
	if (c.departement && a.departement !== c.departement) return false;
	if (c.ville && (!a.afficheCommune || a.ville !== c.ville)) return false;
	if (c.type && slugifier(libelleTypeBien(a.typeBien)) !== c.type) return false;
	if (c.prixMin !== null || c.prixMax !== null) {
		if (!a.affichePrix || a.prix === null) return false;
		if (c.prixMin !== null && a.prix < c.prixMin) return false;
		if (c.prixMax === PRIX_MAX_PLUS) {
			// « > 1 000 000 € » : pas de borne haute.
		} else if (c.prixMax !== null && a.prix > c.prixMax) return false;
	}
	return true;
}

const trier = (options: Option[]) => options.sort((x, y) => x.libelle.localeCompare(y.libelle, "fr"));

/** Départements, villes et types présents dans les annonces actives. */
export function options(annonces: readonly AnnonceCherchable[]): Options {
	const departements = new Map<string, Option>();
	const villes = new Map<string, Option>();
	const types = new Map<string, Option>();
	for (const a of annonces) {
		if (a.departement) departements.set(a.departement, { valeur: a.departement, libelle: a.departement });
		if (a.afficheCommune) villes.set(a.ville, { valeur: a.ville, libelle: a.ville });
		const libelle = libelleTypeBien(a.typeBien);
		types.set(slugifier(libelle), { valeur: slugifier(libelle), libelle });
	}
	return {
		departements: trier([...departements.values()]),
		villes: trier([...villes.values()]),
		types: trier([...types.values()]),
	};
}

/** Page demandée, ramenée dans les bornes. */
export function paginer<T>(liste: readonly T[], page: number, parPage = PAR_PAGE) {
	const pages = Math.max(1, Math.ceil(liste.length / parPage));
	const courante = Math.min(Math.max(1, page), pages);
	return {
		elements: liste.slice((courante - 1) * parPage, courante * parPage),
		page: courante,
		pages,
		total: liste.length,
	};
}

/** URL de la liste pour ces critères (page comprise), paramètres vides omis. */
export function urlRecherche(c: Criteres, page = c.page): string {
	const p = new URLSearchParams();
	if (c.departement) p.set("departement", c.departement);
	if (c.ville) p.set("ville", c.ville);
	if (c.type) p.set("type", c.type);
	if (c.prixMin !== null) p.set("prix_min", String(c.prixMin));
	if (c.prixMax !== null) p.set("prix_max", String(c.prixMax));
	if (page > 1) p.set("page", String(page));
	const q = p.toString();
	return `/annonces/${q ? `?${q}` : ""}`;
}
