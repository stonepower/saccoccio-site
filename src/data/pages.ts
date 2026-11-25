/**
 * Pages éditoriales reprises de l'ancien site, d'après la fiche
 * reference/contenus-kit/pages.json (source unique : nouvelle URL, h1,
 * rubrique, statut).
 *
 * Ce module ne contient que des métadonnées (pas de HTML) : il sert au
 * prérendu des pages, au plan du site et au sitemap.xml.
 */
import fiches from "../../reference/contenus-kit/pages.json";

export interface Fiche {
	ancien_id: number;
	titre_origine: string;
	h1: string;
	rubrique: string;
	nouvelle_url: string;
	fichier: string;
	statut: string;
}

export interface MaillonAriane {
	label: string;
	href?: string;
}

export interface PageEditoriale {
	url: string;
	h1: string;
	rubrique: string;
	/** Nom du fichier HTML dans reference/contenus-kit/pages/. */
	fichier: string;
	/** Fil d'Ariane, page courante comprise (dernier élément). */
	ariane: MaillonAriane[];
	/** Hors menu pour l'instant (pages « Conseils » : à valider avec l'étude). */
	horsMenu: boolean;
}

/**
 * Une fiche du kit donne-t-elle une page ? Les fiches « non reprise » et
 * « redirection seule » ne deviennent que des redirections 301.
 */
export function estReprise(fiche: Pick<Fiche, "statut">): boolean {
	return !/non reprise|redirection seule/i.test(fiche.statut);
}

const INFOS: MaillonAriane = { label: "Informations juridiques", href: "/informations-juridiques/" };

/** Rubrique du kit → maillons du fil d'Ariane (avant la page elle-même). */
const RUBRIQUES: Readonly<Record<string, readonly MaillonAriane[]>> = {
	"Office notarial": [{ label: "L'office notarial", href: "/office-notarial/" }],
	"Informations juridiques": [INFOS],
	"Droit de la famille": [INFOS, { label: "Droit de la famille" }],
	"Droit immobilier": [INFOS, { label: "Droit immobilier" }],
	"Droit commercial": [INFOS, { label: "Droit commercial" }],
	"Droit rural": [INFOS, { label: "Droit rural" }],
	Conseils: [{ label: "Conseils" }],
	Contact: [{ label: "Contact", href: "/contact/" }],
	"Pied de page": [],
};

/** Ordre des groupes du plan du site. */
export const ORDRE_RUBRIQUES = Object.keys(RUBRIQUES);

function versPage(fiche: Fiche): PageEditoriale {
	const rubrique = RUBRIQUES[fiche.rubrique];
	if (!rubrique) throw new Error(`Rubrique inconnue dans pages.json : ${fiche.rubrique}`);
	return {
		url: fiche.nouvelle_url,
		h1: fiche.h1,
		rubrique: fiche.rubrique,
		fichier: fiche.fichier.replace(/^pages\//, ""),
		// La page d'entrée d'une rubrique ne se cite pas elle-même.
		ariane: [...rubrique.filter((m) => m.href !== fiche.nouvelle_url), { label: fiche.h1 }],
		horsMenu: fiche.rubrique === "Conseils",
	};
}

export const PAGES: readonly PageEditoriale[] = (fiches as Fiche[]).filter(estReprise).map(versPage);
