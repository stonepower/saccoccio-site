/**
 * Présentation d'une fiche d'annonce : caractéristiques non vides, mentions
 * de prix, DPE, contact, données structurées schema.org.
 *
 * Module pur (sans accès à D1) : testé par tests/annonces-pages.test.ts.
 */
import {
	classeDpe,
	formaterNombre,
	formaterPrix,
	formaterSurface,
	formaterTelephone,
	type LettreDpe,
	lettreDpe,
	libelleChauffage,
	libelleTypeBien,
	libelleTypeVente,
	lienTelephone,
	prixAffiche,
	SEUILS_ENERGIE,
	SEUILS_GES,
} from "./annonces.ts";
import type { Annonce } from "./annonces-d1.ts";
import { couper, DESCRIPTION_MAX, ID_ETUDE, jsonLd, TITRE_MAX } from "./seo.ts";

export { jsonLd };

export interface Ligne {
	libelle: string;
	valeur: string;
}

/** Service négociation de l'étude, si le flux n'indique pas de négociateur. */
export const NEGOCIATION_ETUDE = {
	nom: "Service négociation",
	tel: "04 92 70 70 70",
	email: "negociation.04025@notaires.fr",
} as const;

/** « Maison - Valensole » (titre de la fiche, comme l'ancien site). */
export function titreAnnonce(a: Pick<Annonce, "typeBien" | "ville" | "afficheCommune">): string {
	const type = libelleTypeBien(a.typeBien);
	return a.afficheCommune ? `${type} - ${a.ville}` : type;
}

/** Lieu affichable : la commune, ou le département si l'étude la masque. */
export function lieu(a: Pick<Annonce, "ville" | "afficheCommune" | "departement">): string {
	return a.afficheCommune ? a.ville : `Département ${a.departement ?? ""}`.trim();
}

const oui = (v: boolean | undefined) => (v ? "Oui" : "");
const surface = (v: number | null | undefined) => (v ? formaterSurface(v) : "");
const nb = (v: number | null | undefined) => (v ? formaterNombre(v) : "");
const parAn = (v: number | undefined) => (v ? `${formaterPrix(v)} par an` : "");

function etage(n: number | undefined, total: number | undefined): string {
	if (n === undefined) return "";
	const libelle = n === 0 ? "Rez-de-chaussée" : n === 1 ? "1er étage" : `${n}e étage`;
	return total ? `${libelle} (sur ${total})` : libelle;
}

/**
 * Caractéristiques, dans l'ordre de l'ancienne fiche (chauffage, surfaces,
 * pièces), puis les autres champs utiles. Seules les valeurs renseignées
 * sont gardées.
 */
export function caracteristiques(a: Annonce): Ligne[] {
	const d = a.details;
	const copro = d.copropriete;
	const lignes: Ligne[] = [
		{ libelle: "Type de chauffage", valeur: d.chauffage?.length ? libelleChauffage(d.chauffage) : "" },
		{ libelle: "Surface terrain", valeur: surface(a.surfaceTerrain) },
		{ libelle: "Surface habitable", valeur: surface(a.surfaceHabitable) },
		{ libelle: "Nombre de pièces", valeur: nb(a.nbPieces) },
		{ libelle: "Chambres", valeur: nb(a.nbChambres) },
		{ libelle: "Surface du séjour", valeur: surface(d.surfaceSejour) },
		{ libelle: "Surface du fonds", valeur: surface(d.surfaceFonds) },
		{ libelle: "Salles de bains", valeur: nb(d.sallesBains) },
		{ libelle: "Salles d'eau", valeur: nb(d.sallesEau) },
		{ libelle: "WC", valeur: nb(d.wc) },
		{ libelle: "Étage", valeur: etage(d.etage, d.nbEtages) },
		{ libelle: "Ascenseur", valeur: oui(d.ascenseur) },
		{ libelle: "Garage", valeur: d.garages ? (d.garages > 1 ? `${d.garages} garages` : "Oui") : "" },
		{ libelle: "Parking", valeur: d.parkings ? (d.parkings > 1 ? `${d.parkings} places` : "Oui") : "" },
		{ libelle: "Piscine", valeur: oui(d.piscine) },
		{ libelle: "Terrasse", valeur: oui(d.terrasse) },
		{ libelle: "Balcon", valeur: oui(d.balcon) },
		{ libelle: "Jardin", valeur: oui(d.jardin) },
		{ libelle: "Cave", valeur: oui(d.cave) },
		{ libelle: "Accès handicapés", valeur: oui(d.accesHandicapes) },
		{ libelle: "Meublé", valeur: oui(d.meuble) },
		{ libelle: "État", valeur: d.etat ?? "" },
		{
			libelle: "Copropriété",
			valeur: copro ? (copro.lots ? `Oui, ${formaterNombre(copro.lots)} lots` : "Oui") : "",
		},
		{ libelle: "Charges de copropriété", valeur: parAn(copro?.charges) },
		{ libelle: "Procédure en cours sur la copropriété", valeur: oui(copro?.procedure) },
		{ libelle: "Taxe foncière", valeur: parAn(d.taxeFonciere) },
	];
	return lignes.filter((l) => l.valeur !== "");
}

/** « 4,97 % » */
const pourcentage = (part: number, total: number) => `${formaterNombre((part / total) * 100, 2)} %`;

/**
 * Mentions de prix lisibles (Informations complémentaires), selon modeNego :
 * prix net vendeur, honoraires de négociation (montant, pourcentage et
 * charge), frais d'acte estimés.
 */
export function mentionsPrix(a: Annonce): Ligne[] {
	if (!a.affichePrix || !a.prix) return [];
	const lignes: Ligne[] = [];
	const enSus = a.modeNego === "HN";
	if (a.prixNetVendeur && a.prixNetVendeur !== a.prix) {
		lignes.push({ libelle: "Prix net vendeur", valeur: formaterPrix(a.prixNetVendeur) });
	}
	if (a.fraisNego) {
		const charge = a.chargeNego === "V" ? "à la charge du vendeur" : a.chargeNego === "A" ? "à la charge de l'acquéreur" : "";
		const base = a.prixNetVendeur ?? (enSus ? a.prix : null);
		const part = base ? `soit ${pourcentage(a.fraisNego, base)} du prix net vendeur` : "";
		lignes.push({
			libelle: enSus ? "Honoraires de négociation (en sus)" : "Honoraires de négociation (inclus)",
			valeur: [formaterPrix(a.fraisNego), part, charge].filter(Boolean).join(", "),
		});
	}
	if (a.fraisActe) {
		lignes.push({
			libelle: "Frais d'acte (estimation)",
			valeur: `${formaterPrix(a.fraisActe)}${a.modeNego === "TFC" ? ", inclus dans le prix" : ", en sus du prix"}`,
		});
	}
	return lignes;
}

/** Informations complémentaires (comme l'ancienne fiche ; vrai code postal). */
export function informations(a: Annonce): Ligne[] {
	return [
		{ libelle: "Prix", valeur: prixAffiche(a) },
		...mentionsPrix(a),
		{ libelle: "Réf.", valeur: a.refClient },
		{ libelle: "Code postal", valeur: a.afficheCommune ? (a.codePostal ?? "") : "" },
		{ libelle: "Ville", valeur: lieu(a) },
		{ libelle: "Type de vente", valeur: libelleTypeVente(a.typeVente) },
		{ libelle: "Type de bien", valeur: a.sousNature ? `${libelleTypeBien(a.typeBien)} (${a.sousNature})` : libelleTypeBien(a.typeBien) },
	].filter((l) => l.valeur !== "");
}

export interface EtiquetteDpe {
	valeur: number;
	lettre: LettreDpe;
}

export type VueDpe =
	| { etat: "exempte" }
	| { etat: "vierge" }
	| { etat: "non-communique" }
	| {
			etat: "complet";
			energie: EtiquetteDpe | null;
			ges: EtiquetteDpe | null;
			date: string | null;
			/** « entre 3 430 € et 4 720 € par an » */
			couts: string | null;
			anneeReference: string | null;
	  };

export function vueDpe(a: Annonce): VueDpe {
	const d = a.details.dpe ?? {};
	if (d.exempte) return { etat: "exempte" };
	if (d.vierge) return { etat: "vierge" };
	const etiquette = (valeur: number | undefined, lettre: string | undefined, seuils: readonly number[]) =>
		valeur ? { valeur, lettre: lettreDpe(lettre) ?? classeDpe(valeur, seuils) } : null;
	const energie = etiquette(d.energie, d.lettreEnergie, SEUILS_ENERGIE);
	const ges = etiquette(d.ges, d.lettreGes, SEUILS_GES);
	if (!energie && !ges) return { etat: "non-communique" };
	const { coutMin, coutMax } = d;
	const couts =
		coutMin && coutMax && coutMax >= coutMin
			? `entre ${formaterPrix(coutMin)} et ${formaterPrix(coutMax)} par an`
			: null;
	return { etat: "complet", energie, ges, date: d.date ?? null, couts, anneeReference: d.anneeReference ?? null };
}

export interface Contact {
	nom: string;
	tel: string | null;
	telLien: string | null;
	email: string;
}

/** Négociateur du flux (nom, téléphone, e-mail), ou le service négociation. */
export function contact(a: Annonce): Contact {
	const tel = a.negoTel ? formaterTelephone(a.negoTel) : null;
	const telLien = lienTelephone(a.negoTel);
	return {
		nom: a.negoNom ?? NEGOCIATION_ETUDE.nom,
		tel: telLien ? tel : NEGOCIATION_ETUDE.tel,
		telLien: telLien ?? lienTelephone(NEGOCIATION_ETUDE.tel),
		email: a.negoEmail ?? NEGOCIATION_ETUDE.email,
	};
}

/** mailto: avec objet et corps (lien de l'annonce). */
export function lienMail(destinataire: string, objet: string, corps: string): string {
	return `mailto:${destinataire}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}

/** « à Valensole », ou le département si l'étude masque la commune. */
function lieuSeo(a: Pick<Annonce, "ville" | "afficheCommune" | "departement">): string {
	return a.afficheCommune ? `à ${a.ville}` : `(département ${a.departement ?? "04"})`;
}

/** Surface principale arrondie (« 126 m² ») : habitable, sinon terrain. */
function surfaceSeo(a: Pick<Annonce, "surfaceHabitable" | "surfaceTerrain">): string {
	const s = a.surfaceHabitable || a.surfaceTerrain;
	return s ? `${formaterNombre(Math.round(s))}\u00a0m²` : "";
}

/** Prix sans mention (« 280 280 € »), ou « prix sur demande ». */
function prixSeo(a: Pick<Annonce, "prix" | "affichePrix">): string {
	return a.affichePrix && a.prix && a.prix > 0 ? formaterPrix(a.prix) : "prix sur demande";
}

/** Premier candidat qui tient en `max` caractères, sinon le dernier coupé. */
function premierQuiTient(candidats: string[], max: number): string {
	const propres = candidats.map((c) => c.replace(/\s+/g, " ").replace(/ ,/g, ",").trim());
	return propres.find((c) => c.length <= max) ?? couper(propres[propres.length - 1] ?? "", max);
}

/**
 * <title> d'une fiche (≤ TITRE_MAX caractères) : type de bien, commune,
 * surface et prix, plus la référence (qui le rend unique).
 * « Maison à Valensole, 126 m², 280 280 € – réf. 025/1912 »
 */
export function titreSeo(a: Annonce): string {
	const debut = `${libelleTypeBien(a.typeBien)} ${lieuSeo(a)}`;
	const surf = surfaceSeo(a);
	const prix = prixSeo(a);
	const avecSurface = surf ? `${debut}, ${surf}, ${prix}` : `${debut}, ${prix}`;
	return premierQuiTient(
		[
			`${avecSurface} – réf. ${a.refClient}`,
			`${debut}, ${prix} – réf. ${a.refClient}`,
			`Réf. ${a.refClient} – ${debut}, ${prix}`,
		],
		TITRE_MAX,
	);
}

/**
 * Meta description d'une fiche (≤ DESCRIPTION_MAX caractères), unique grâce à
 * la référence : type, commune, surfaces, pièces, prix.
 */
export function descriptionSeo(a: Annonce): string {
	const debut = `${libelleTypeBien(a.typeBien)} à vendre ${lieuSeo(a)}`;
	const habitable = a.surfaceHabitable ? formaterSurface(a.surfaceHabitable) : "";
	const pieces = a.nbPieces ? `${a.nbPieces} pièce${a.nbPieces > 1 ? "s" : ""}` : "";
	const terrain = a.surfaceTerrain ? `terrain de ${formaterSurface(a.surfaceTerrain)}` : "";
	const prix = prixAffiche(a);
	const phrase = (morceaux: string[], fin: string) => `${[debut, ...morceaux].filter(Boolean).join(", ")}. ${fin}`;
	const complet = `Réf. ${a.refClient}, office notarial Saccoccio & Associés.`;
	const court = `Réf. ${a.refClient}.`;
	return premierQuiTient(
		[
			phrase([habitable, pieces, terrain, prix], complet),
			phrase([habitable, pieces, prix], complet),
			phrase([habitable, pieces, terrain, prix], court),
			phrase([habitable, prix], court),
			`${court} ${debut}, ${prix}.`,
		],
		DESCRIPTION_MAX,
	);
}

/**
 * Données structurées schema.org (RealEstateListing + Offer) : prix, commune
 * et code postal. JAMAIS d'adresse exacte ni de coordonnées (le flux en
 * contient : elles ne sont pas importées). Le vendeur est l'étude.
 */
export function donneesStructurees(a: Annonce, url: string): Record<string, unknown> {
	const offre: Record<string, unknown> = {
		"@type": "Offer",
		businessFunction: "http://purl.org/goodrelations/v1#Sell",
		availability: "https://schema.org/InStock",
		url,
		seller: { "@id": ID_ETUDE },
	};
	if (a.affichePrix && a.prix) {
		offre.price = a.prix;
		offre.priceCurrency = "EUR";
	}
	const adresse: Record<string, unknown> = { "@type": "PostalAddress", addressCountry: "FR" };
	if (a.afficheCommune) {
		adresse.addressLocality = a.ville;
		if (a.codePostal) adresse.postalCode = a.codePostal;
	}
	return {
		"@context": "https://schema.org",
		"@type": "RealEstateListing",
		"@id": `${url}#annonce`,
		name: titreAnnonce(a),
		description: descriptionSeo(a),
		url,
		identifier: a.refClient,
		...(a.photos.length ? { image: a.photos.slice(0, 5) } : {}),
		...(a.dateCreation ? { datePosted: new Date(a.dateCreation).toISOString().slice(0, 10) } : {}),
		offers: offre,
		about: {
			"@type": a.typeBien === "APPT" ? "Apartment" : a.typeBien === "MAIS" ? "SingleFamilyResidence" : "Place",
			address: adresse,
			...(a.surfaceHabitable
				? { floorSize: { "@type": "QuantitativeValue", value: a.surfaceHabitable, unitCode: "MTK" } }
				: {}),
			...(a.nbPieces ? { numberOfRooms: a.nbPieces } : {}),
		},
	};
}

/** Centre de la commune (OpenStreetMap) : lien et cadre de l'iframe. */
export function liensCarte(centre: { lat: number; lon: number } | null, a: Annonce) {
	if (!a.afficheCommune) return null;
	const recherche = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${a.codePostal ?? ""} ${a.ville}`.trim())}`;
	if (!centre) return { agrandir: recherche, iframe: null };
	const { lat, lon } = centre;
	const d = 0.06;
	const bbox = [lon - d * 1.4, lat - d, lon + d * 1.4, lat + d].map((v) => v.toFixed(4)).join(",");
	return {
		agrandir: `https://www.openstreetmap.org/#map=13/${lat.toFixed(4)}/${lon.toFixed(4)}`,
		iframe: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`,
	};
}
