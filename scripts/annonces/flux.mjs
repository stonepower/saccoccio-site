/**
 * Lecture et normalisation du flux XML Immonot (format décrit dans
 * reference/annonces-kit/README.md).
 *
 * Données VOLONTAIREMENT ignorées (jamais lues, donc jamais stockées) :
 * - <Adresse> : adresse exacte du bien, souvent le domicile du vendeur ;
 * - <Latitude>, <Longitude> : coordonnées plus précises que la commune ;
 * - <AnnonceAnglais> : le site est en français uniquement.
 */
import { createHash } from "node:crypto";
import { codesChauffage, lettreDpe } from "../../src/lib/annonces.ts";
import { analyserXml, decoder, enfant, enfants, ErreurXml } from "./xml.mjs";

export class ErreurFlux extends Error {
	constructor(message) {
		super(message);
		this.name = "ErreurFlux";
	}
}

/** Champs qui ne doivent jamais sortir de ce module (contrôlé par les tests). */
export const CHAMPS_INTERDITS = ["Adresse", "Latitude", "Longitude"];

const texte = (clef, nom) => {
	const e = enfant(clef, nom);
	const v = e?.texte.trim() ?? "";
	return v === "" || v === "null" ? null : v;
};

const nombre = (valeur) => {
	if (valeur === null || valeur === undefined) return null;
	const n = Number(String(valeur).replace(",", ".").replace(/\s|m2$/g, ""));
	return Number.isFinite(n) ? n : null;
};

/** Nombre strictement positif, sinon null (0 = non renseigné dans le flux). */
const positif = (valeur) => {
	const n = nombre(valeur);
	return n !== null && n > 0 ? n : null;
};

const entier = (valeur) => {
	const n = positif(valeur);
	return n === null ? null : Math.round(n);
};

const booleen = (valeur) => valeur === "true" || valeur === "Oui" || valeur === "oui" || valeur === "1";

/** URL de photo en https (les photos restent chez Immonot), ou null. */
export function urlPhoto(brute) {
	const v = (brute ?? "").trim();
	if (!/^https?:\/\/[^\s"'<>]+$/i.test(v)) return null;
	try {
		const url = new URL(v);
		url.protocol = "https:";
		return url.href;
	} catch {
		return null;
	}
}

/** Retire les caractères de contrôle (sauf retours à la ligne et tabulations). */
const propre = (v) => (v === null ? null : v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));

/** Objet sans les clés vides (null, false, "", tableau vide). */
function sansVides(objet) {
	return Object.fromEntries(
		Object.entries(objet).filter(([, v]) => v !== null && v !== false && v !== "" && !(Array.isArray(v) && !v.length)),
	);
}

function normaliserDpe(clef) {
	const exempte = booleen(texte(clef, "ExempteDpe"));
	const vierge = booleen(texte(clef, "DpeVierge"));
	const energie = positif(texte(clef, "dpeNrj"));
	const ges = positif(texte(clef, "dpeGes"));
	return sansVides({
		exempte,
		vierge,
		energie,
		lettreEnergie: energie === null ? null : (lettreDpe(texte(clef, "nrjLettre")) ?? lettreDpe(texte(clef, "dpeLettre"))),
		ges,
		lettreGes: ges === null ? null : lettreDpe(texte(clef, "gesLettre")),
		date: /^\d{2}\/\d{2}\/\d{4}$/.test(texte(clef, "dpeDate") ?? "") ? texte(clef, "dpeDate") : null,
		coutMin: positif(texte(clef, "coutAnnMin")),
		coutMax: positif(texte(clef, "coutAnnMax")),
		anneeReference: /^(19|20)\d{2}$/.test(texte(clef, "dateRefCout") ?? "") ? texte(clef, "dateRefCout") : null,
	});
}

function normaliserDetails(clef, a) {
	const copropriete = booleen(texte(clef, "Copropriete"));
	const garages = entier(texte(clef, "nb_garages")) ?? (a.garage === "true" ? 1 : null);
	return sansVides({
		chauffage: codesChauffage(texte(clef, "TypeChauffage")),
		surfaceSejour: positif(texte(clef, "SurfaceSejour")),
		surfaceFonds: positif(texte(clef, "surfaceFonds")),
		sallesEau: entier(texte(clef, "nb_salle_d_eau")),
		sallesBains: entier(texte(clef, "SalleDeBains")),
		wc: entier(texte(clef, "WC")),
		garages,
		parkings: entier(texte(clef, "nb_parkings")) ?? (booleen(texte(clef, "parking")) ? 1 : null),
		piscine: booleen(texte(clef, "piscine")),
		terrasse: booleen(texte(clef, "Terrasse")),
		balcon: booleen(texte(clef, "Balcon")),
		jardin: booleen(texte(clef, "jardin")),
		cave: booleen(texte(clef, "cave")),
		ascenseur: booleen(texte(clef, "has_ascenseur")),
		accesHandicapes: booleen(texte(clef, "is_acces_handicapes")),
		etage: a.typeBien === "APPT" ? (nombre(texte(clef, "etage")) ?? null) : null,
		nbEtages: entier(texte(clef, "nb_etages")),
		etat: texte(clef, "Etat"),
		meuble: texte(clef, "Meuble") === "Oui",
		assainissement: texte(clef, "Assainissement"),
		copropriete: copropriete
			? sansVides({
					lots: entier(texte(clef, "CoproprieteNombreLots")),
					charges: positif(texte(clef, "CoproprieteCharges")),
					procedure: booleen(texte(clef, "CoproprieteProcedure")),
				})
			: null,
		taxeFonciere: positif(texte(clef, "TaxeFonciere")),
		dpe: normaliserDpe(clef),
	});
}

/**
 * Une annonce du flux (élément <Clef>) → enregistrement normalisé.
 * @param {import("./xml.mjs").Noeud} clef
 * @param {number} rang position dans le flux
 */
export function normaliserClef(clef, rang) {
	const a = clef.attributs;
	const id = (a.id ?? "").trim();
	if (!id) throw new ErreurFlux(`annonce n° ${rang + 1} : attribut Clef/@id absent`);
	const ville = (a.ville ?? "").trim();
	if (!ville) throw new ErreurFlux(`annonce ${id} : ville absente`);
	const typeBien = (a.typeBien ?? "").trim().toUpperCase();
	if (!typeBien) throw new ErreurFlux(`annonce ${id} : typeBien absent`);

	const annonce = {
		immonotId: id,
		refClient: (a.refClient ?? "").trim() || id.split("__").pop(),
		typeBien,
		sousNature: a.libelleSousNature?.trim() || null,
		typeVente: (a.typeVente ?? "VENT").trim() || "VENT",
		ville,
		codePostal: /^\d{5}$/.test(a.codePostal ?? "") ? a.codePostal : null,
		insee: /^\d[\dAB]\d{3}$/.test(a.insee ?? "") ? a.insee : null,
		departement: (a.departement ?? "").trim() || null,
		afficheCommune: a.afficheCommune !== "false",
		affichePrix: a.affichePrix !== "false",
		prix: positif(texte(clef, "PVB")),
		prixNetVendeur: positif(texte(clef, "PNV")),
		fraisNego: positif(texte(clef, "fraisNego")),
		fraisActe: positif(texte(clef, "fraisActe")),
		modeNego: a.modeNego?.trim() || null,
		chargeNego: a.chargeNego?.trim() || null,
		surfaceHabitable: positif(texte(clef, "SurfaceHabitable")),
		surfaceTerrain: positif(texte(clef, "SurfaceTerrainDouble")) ?? positif(texte(clef, "SurfaceTerrain")),
		nbPieces: entier(texte(clef, "NbrePiece")),
		nbChambres: entier(texte(clef, "NbreChambres")),
		texte: propre(texte(clef, "Annonce")) ?? "",
		photos: [
			...new Set(
				enfants(clef, "Photo")
					.map((p, i) => ({ ordre: nombre(p.attributs.id) ?? i, url: urlPhoto(p.texte) }))
					.filter((p) => p.url)
					.sort((x, y) => x.ordre - y.ordre)
					.map((p) => p.url),
			),
		],
		details: normaliserDetails(clef, { ...a, typeBien }),
		negoNom: propre(a.nomNego?.trim() || null),
		negoTel: a.tel?.trim() || null,
		negoEmail: /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(a.mailNego?.trim() ?? "") ? a.mailNego.trim() : null,
		dateCreation: entier(a.dateCreation),
		dateMaj: entier(a.dateMAJ),
		rang,
	};
	return { ...annonce, empreinte: empreinte(annonce) };
}

/** SHA-256 du contenu normalisé (hors rang) : détecte un changement sans dateMAJ. */
export function empreinte(annonce) {
	const { rang: _rang, empreinte: _e, ...contenu } = annonce;
	return createHash("sha256").update(JSON.stringify(contenu)).digest("hex");
}

/**
 * Lit un flux complet.
 * @param {Uint8Array} octets contenu brut du fichier
 * @param {{ crpcen?: string }} [options] code CRPCEN attendu (« 04025 ») : un
 *   flux d'une autre étude est refusé.
 * @returns {{ crpcen: string, annonces: ReturnType<typeof normaliserClef>[] }}
 */
export function lireFlux(octets, { crpcen } = {}) {
	if (!octets || octets.length === 0) throw new ErreurFlux("fichier vide");
	let racine;
	try {
		racine = analyserXml(decoder(octets));
	} catch (e) {
		if (e instanceof ErreurXml) throw new ErreurFlux(`XML invalide : ${e.message}`);
		throw e;
	}
	if (racine.nom !== "EchangeNotaire") throw new ErreurFlux(`racine <${racine.nom}> inattendue (attendu <EchangeNotaire>)`);
	const etudes = enfants(racine, "CrpCen");
	if (etudes.length !== 1) throw new ErreurFlux(`${etudes.length} éléments <CrpCen> (attendu 1)`);
	const etude = etudes[0];
	const code = etude.attributs.id ?? "";
	if (crpcen && code !== crpcen) throw new ErreurFlux(`flux de l'étude ${code || "inconnue"}, attendu ${crpcen}`);

	const annonces = enfants(etude, "Clef").map(normaliserClef);
	if (annonces.length === 0) throw new ErreurFlux("aucune annonce dans le flux");
	const vus = new Set();
	for (const a of annonces) {
		if (vus.has(a.immonotId)) throw new ErreurFlux(`annonce ${a.immonotId} présente deux fois`);
		vus.add(a.immonotId);
	}
	return { crpcen: code, annonces };
}
