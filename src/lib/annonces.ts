/**
 * Annonces immobilières : libellés, formats et slugs.
 *
 * Module PUR, sans import : il est utilisé à la fois par les pages (Worker)
 * et par le script d'import (`scripts/import-annonces.mjs`, exécuté par Node,
 * qui lit ce fichier TypeScript directement). N'y utiliser que de la syntaxe
 * TypeScript « effaçable » (pas d'enum, pas de namespace).
 *
 * Libellés repris de l'ancien site (sincronizacionXML.php, voir
 * reference/annonces-kit/README.md).
 */

/** Libellés des types de bien (Clef/@typeBien). */
export const TYPES_BIEN: Readonly<Record<string, string>> = {
	APPT: "Appartement",
	MAIS: "Maison",
	TEBA: "Terrain",
	FMCO: "Fonds de commerce",
	IMMR: "Immeuble de rapport",
	GAPA: "Garage/Parking",
	PROP: "Propriété",
	DIVE: "Divers",
};

/** Libellés des types de vente (Clef/@typeVente). */
export const TYPES_VENTE: Readonly<Record<string, string>> = {
	VENT: "Vente",
};

/** Libellés des modes de négociation (Clef/@modeNego). */
export const MODES_NEGO: Readonly<Record<string, string>> = {
	TFC: "Tous frais compris",
	HN: "Honoraires de négociation en sus",
	HNI: "Honoraires de négociation inclus",
	NV: "Frais d'agence inclus",
};

/**
 * Mention accolée au prix affiché. Le prix du flux (PVB) inclut les
 * honoraires de négociation (PVB = PNV + fraisNego) en NV et HNI : l'ancien
 * site affichait « FAI » (frais d'agence inclus).
 */
export const SUFFIXES_PRIX: Readonly<Record<string, string>> = {
	NV: "FAI",
	HNI: "FAI",
	TFC: "tous frais compris",
	HN: "hors honoraires",
};

/** Paliers de prix du formulaire de recherche (comme l'ancien site). */
export const PALIERS_PRIX: readonly number[] = [
	0, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 300_000, 500_000, 750_000, 1_000_000,
];
/** Valeur « plus de 1 000 000 € » du prix maximum. */
export const PRIX_MAX_PLUS = "1000000plus";

export function libelleTypeBien(code: string): string {
	return TYPES_BIEN[code] ?? "Bien immobilier";
}

export function libelleTypeVente(code: string): string {
	return TYPES_VENTE[code] ?? "Vente";
}

/** Espace insécable entre les milliers et avant les unités. */
const INSECABLE = " ";

/**
 * « 280280 » → « 280 280 » ; « 125.69 » → « 125,69 » (au plus `decimales`
 * chiffres après la virgule, zéros finaux retirés). Espaces insécables.
 */
export function formaterNombre(valeur: number, decimales = 0): string {
	const facteur = 10 ** decimales;
	const arrondi = Math.round(Math.abs(valeur) * facteur) / facteur;
	const [entier = "0", fraction = ""] = arrondi.toFixed(decimales).split(".");
	const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, INSECABLE);
	const fin = fraction.replace(/0+$/, "");
	return `${valeur < 0 && arrondi !== 0 ? "-" : ""}${groupes}${fin ? `,${fin}` : ""}`;
}

/** « 280 280 € » (euros entiers). */
export function formaterPrix(valeur: number): string {
	return `${formaterNombre(valeur)}${INSECABLE}€`;
}

/** Prix affiché d'une annonce : « 280 280 € FAI », ou « Prix sur demande ». */
export function prixAffiche(a: { prix: number | null; affichePrix: boolean; modeNego: string | null }): string {
	if (!a.affichePrix || a.prix === null || !(a.prix > 0)) return "Prix sur demande";
	const suffixe = SUFFIXES_PRIX[a.modeNego ?? ""] ?? "FAI";
	return `${formaterPrix(a.prix)} ${suffixe}`;
}

/** « 125,69 m² ». */
export function formaterSurface(valeur: number): string {
	return `${formaterNombre(valeur, 2)}${INSECABLE}m²`;
}

/** Libellés des modes de chauffage du flux (TypeChauffage, séparés par des virgules). */
export const CHAUFFAGES: Readonly<Record<string, string>> = {
	fuel: "fuel",
	fioul: "fioul",
	gaz: "gaz",
	electricite: "électricité",
	electrique: "électrique",
	climReversible: "climatisation réversible",
	climatisation: "climatisation",
	cheminee: "cheminée",
	central: "chauffage central",
	collectif: "chauffage collectif",
	individuel: "chauffage individuel",
	bois: "bois",
	poele: "poêle",
	poeleBois: "poêle à bois",
	poeleGranules: "poêle à granulés",
	granules: "granulés",
	pompeAChaleur: "pompe à chaleur",
	pac: "pompe à chaleur",
	solaire: "solaire",
	geothermie: "géothermie",
	sol: "chauffage au sol",
	radiateur: "radiateurs",
	convecteur: "convecteurs",
	urbain: "chauffage urbain",
	aucun: "aucun chauffage",
};

/** « climReversible » → « clim reversible » pour un code inconnu. */
function codeLisible(code: string): string {
	return code
		.replace(/([A-Z])/g, " $1")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

/** Codes de chauffage du flux, nettoyés et dédoublonnés. */
export function codesChauffage(valeur: string | null | undefined): string[] {
	const codes = (valeur ?? "")
		.split(",")
		.map((c) => c.trim())
		.filter((c) => c !== "" && c !== "null");
	return [...new Set(codes)];
}

/** « fuel,climReversible,cheminee » → « Fuel, climatisation réversible, cheminée ». */
export function libelleChauffage(codes: string | readonly string[] | null | undefined): string {
	const liste = typeof codes === "string" || codes == null ? codesChauffage(codes) : codes;
	const texte = liste.map((c) => CHAUFFAGES[c] ?? codeLisible(c)).join(", ");
	return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** « 06.81.04.34.53 » → « 06 81 04 34 53 » (numéro français à 10 chiffres). */
export function formaterTelephone(valeur: string | null | undefined): string {
	const chiffres = (valeur ?? "").replace(/\D/g, "");
	const national = /^33\d{9}$/.test(chiffres) ? `0${chiffres.slice(2)}` : chiffres;
	if (/^0\d{9}$/.test(national)) return national.replace(/(\d{2})(?=\d)/g, "$1 ");
	return (valeur ?? "").trim();
}

/** Lien tel: (« +33681043453 »), ou null si le numéro n'est pas exploitable. */
export function lienTelephone(valeur: string | null | undefined): string | null {
	const chiffres = (valeur ?? "").replace(/\D/g, "");
	if (/^0[1-9]\d{8}$/.test(chiffres)) return `tel:+33${chiffres.slice(1)}`;
	if (/^33[1-9]\d{8}$/.test(chiffres)) return `tel:+${chiffres}`;
	return null;
}

/** « Gréoux-les-Bains » → « greoux-les-bains ». */
export function slugifier(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[œŒ]/g, "oe")
		.replace(/[æÆ]/g, "ae")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Slug de la fiche : « maison-valensole-025-1912 ». Calculé UNE fois, à la
 * première importation, puis conservé en base (URL stable même si le type
 * ou la ville changent ensuite). Sans commune affichable, le département
 * remplace la ville.
 */
export function construireSlug(a: {
	typeBien: string;
	ville: string;
	afficheCommune: boolean;
	departement: string | null;
	refClient: string;
	immonotId: string;
}): string {
	const lieu = a.afficheCommune ? a.ville : `departement-${a.departement ?? ""}`;
	const reference = slugifier(a.refClient) || slugifier(a.immonotId.split("__").pop() ?? a.immonotId);
	return [slugifier(libelleTypeBien(a.typeBien)), slugifier(lieu), reference].filter(Boolean).join("-");
}

/** Lettres du DPE et couleurs officielles des étiquettes. */
export const LETTRES_DPE = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type LettreDpe = (typeof LETTRES_DPE)[number];

/** Bornes hautes des classes (DPE 2021) : énergie en kWhEP/m².an, GES en kgeqCO2/m².an. */
export const SEUILS_ENERGIE = [70, 110, 180, 250, 330, 420] as const;
export const SEUILS_GES = [6, 11, 30, 50, 70, 100] as const;

/** Libellés des échelles (« ≤ 70 », « 71 à 110 »… « > 420 »). */
export function bornesEchelle(seuils: readonly number[]): string[] {
	return LETTRES_DPE.map((_, i) => {
		if (i === 0) return `≤ ${seuils[0]}`;
		if (i === seuils.length) return `> ${seuils[i - 1]}`;
		return `${(seuils[i - 1] ?? 0) + 1} à ${seuils[i]}`;
	});
}

/** Classe d'après la valeur, quand le flux ne donne pas la lettre. */
export function classeDpe(valeur: number, seuils: readonly number[]): LettreDpe {
	const i = seuils.findIndex((s) => valeur <= s);
	return LETTRES_DPE[i < 0 ? 6 : i] ?? "G";
}

/** Lettre valide du flux (« E »), ou null. */
export function lettreDpe(valeur: string | null | undefined): LettreDpe | null {
	const l = (valeur ?? "").trim().toUpperCase();
	return (LETTRES_DPE as readonly string[]).includes(l) ? (l as LettreDpe) : null;
}

/**
 * Paragraphes du texte de l'annonce : le flux sépare les paragraphes par
 * plusieurs espaces ou des retours à la ligne.
 */
export function paragraphes(texte: string): string[] {
	return texte
		.split(/\r?\n\s*\r?\n|\r?\n| {3,}/)
		.map((p) => p.replace(/\s+/g, " ").trim())
		.filter(Boolean);
}

/** Résumé de la carte de la liste : 300 caractères environ, coupé à un mot, suivi de « [...] ». */
export function resume(texte: string, longueur = 300): string {
	const plat = texte.replace(/\s+/g, " ").trim();
	if (plat.length <= longueur) return plat;
	const coupe = plat.slice(0, longueur);
	const espace = coupe.lastIndexOf(" ");
	return `${(espace > longueur * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:.-]+$/, "")} [...]`;
}
