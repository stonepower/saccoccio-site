/**
 * Lecture des annonces dans D1 par le Worker (table `annonces`,
 * migrations/0002_annonces.sql), avec un cache court en mémoire.
 *
 * Coût par page : UNE seule requête D1 (un `batch` : annonces actives et
 * slugs des annonces retirées récemment), et aucune tant que le cache de
 * l'isolat est valide (60 s). Le catalogue est petit (une trentaine
 * d'annonces) : liste, recherche, fiche, précédent/suivant et sitemap le
 * partagent.
 */
import { env } from "cloudflare:workers";

/** Durée du cache en mémoire de l'isolat. */
const DUREE_CACHE_MS = 60_000;
/** Une annonce retirée depuis moins d'un an répond 410 ; au-delà, 404. */
const DUREE_410_MS = 365 * 24 * 3600 * 1000;

export interface Dpe {
	exempte?: boolean;
	vierge?: boolean;
	energie?: number;
	lettreEnergie?: string;
	ges?: number;
	lettreGes?: string;
	date?: string;
	coutMin?: number;
	coutMax?: number;
	anneeReference?: string;
}

export interface Details {
	chauffage?: string[];
	surfaceSejour?: number;
	surfaceFonds?: number;
	sallesEau?: number;
	sallesBains?: number;
	wc?: number;
	garages?: number;
	parkings?: number;
	piscine?: boolean;
	terrasse?: boolean;
	balcon?: boolean;
	jardin?: boolean;
	cave?: boolean;
	ascenseur?: boolean;
	accesHandicapes?: boolean;
	etage?: number;
	nbEtages?: number;
	etat?: string;
	meuble?: boolean;
	assainissement?: string;
	copropriete?: { lots?: number; charges?: number; procedure?: boolean };
	taxeFonciere?: number;
	dpe?: Dpe;
}

export interface Annonce {
	slug: string;
	refClient: string;
	typeBien: string;
	sousNature: string | null;
	typeVente: string;
	ville: string;
	codePostal: string | null;
	insee: string | null;
	departement: string | null;
	afficheCommune: boolean;
	affichePrix: boolean;
	prix: number | null;
	prixNetVendeur: number | null;
	fraisNego: number | null;
	fraisActe: number | null;
	modeNego: string | null;
	chargeNego: string | null;
	surfaceHabitable: number | null;
	surfaceTerrain: number | null;
	nbPieces: number | null;
	nbChambres: number | null;
	texte: string;
	photos: string[];
	details: Details;
	negoNom: string | null;
	negoTel: string | null;
	negoEmail: string | null;
	dateCreation: number | null;
	/**
	 * Dernière modification réelle du contenu (colonne `modifie_le`, posée par
	 * l'import ; jamais le `dateMAJ` d'Immonot, qui change chaque nuit) :
	 * `lastmod` du sitemap. null si inconnue.
	 */
	modifieLe: number | null;
}

export interface Catalogue {
	/** Annonces actives, dans l'ordre du flux. */
	actives: Annonce[];
	/** Slugs des annonces retirées depuis moins d'un an (réponse 410). */
	retirees: Set<string>;
}

type Ligne = Record<string, unknown>;

const texte = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function json<T>(v: unknown, defaut: T): T {
	try {
		return typeof v === "string" ? (JSON.parse(v) as T) : defaut;
	} catch {
		return defaut;
	}
}

function versAnnonce(l: Ligne): Annonce {
	return {
		slug: String(l.slug),
		refClient: String(l.ref_client),
		typeBien: String(l.type_bien),
		sousNature: texte(l.sous_nature),
		typeVente: String(l.type_vente),
		ville: String(l.ville),
		codePostal: texte(l.code_postal),
		insee: texte(l.insee),
		departement: texte(l.departement),
		afficheCommune: l.affiche_commune !== 0,
		affichePrix: l.affiche_prix !== 0,
		prix: nombre(l.prix),
		prixNetVendeur: nombre(l.prix_net_vendeur),
		fraisNego: nombre(l.frais_nego),
		fraisActe: nombre(l.frais_acte),
		modeNego: texte(l.mode_nego),
		chargeNego: texte(l.charge_nego),
		surfaceHabitable: nombre(l.surface_habitable),
		surfaceTerrain: nombre(l.surface_terrain),
		nbPieces: nombre(l.nb_pieces),
		nbChambres: nombre(l.nb_chambres),
		texte: String(l.texte ?? ""),
		photos: json<string[]>(l.photos, []).filter((p) => typeof p === "string" && p.startsWith("https://")),
		details: json<Details>(l.details, {}),
		negoNom: texte(l.nego_nom),
		negoTel: texte(l.nego_tel),
		negoEmail: texte(l.nego_email),
		dateCreation: nombre(l.date_creation),
		modifieLe: nombre(l.modifie_le),
	};
}

const COLONNES =
	"slug, ref_client, type_bien, sous_nature, type_vente, ville, code_postal, insee, departement, " +
	"affiche_commune, affiche_prix, prix, prix_net_vendeur, frais_nego, frais_acte, mode_nego, charge_nego, " +
	"surface_habitable, surface_terrain, nb_pieces, nb_chambres, texte, photos, details, " +
	"nego_nom, nego_tel, nego_email, date_creation, modifie_le";

async function lireCatalogue(): Promise<Catalogue> {
	const [actives, retirees] = await env.DB.batch<Ligne>([
		env.DB.prepare(`SELECT ${COLONNES} FROM annonces WHERE actif = 1 ORDER BY rang, id`),
		env.DB.prepare("SELECT slug FROM annonces WHERE actif = 0 AND retire_le > ?").bind(Date.now() - DUREE_410_MS),
	]);
	return {
		actives: (actives?.results ?? []).map(versAnnonce),
		retirees: new Set((retirees?.results ?? []).map((l) => String(l.slug))),
	};
}

let cache: { expire: number; catalogue: Promise<Catalogue> } | undefined;

/** Catalogue des annonces (cache de 60 s dans l'isolat). */
export function chargerCatalogue(): Promise<Catalogue> {
	const maintenant = Date.now();
	if (!cache || cache.expire <= maintenant) {
		const catalogue = lireCatalogue();
		cache = { expire: maintenant + DUREE_CACHE_MS, catalogue };
		// Une erreur (table absente, D1 indisponible) n'est pas mise en cache.
		catalogue.catch(() => {
			if (cache?.catalogue === catalogue) cache = undefined;
		});
	}
	return cache.catalogue;
}

/** En-tête de cache HTTP des pages d'annonces (navigateur et CDN). */
export const CACHE_HTTP = "public, max-age=300, stale-while-revalidate=600";
