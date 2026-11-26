/**
 * SEO commun à toutes les pages : longueurs du <title> et de la meta
 * description, URL absolues (canonical, Open Graph), données structurées
 * schema.org (étude notariale, fil d'Ariane).
 *
 * Module PUR (sans accès à l'environnement Cloudflare) : utilisé par
 * src/layouts/Base.astro et testé directement par tests/seo.test.ts.
 */
import { ETUDE, type Site, SITES, URL_SITE } from "../data/site.ts";

/** Longueurs maximales (au-delà, les moteurs tronquent l'affichage). */
export const TITRE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/** URL absolue sur le domaine de production, sans paramètres ni fragment. */
export function urlAbsolue(chemin: string): string {
	const url = new URL(chemin, `${URL_SITE}/`);
	url.search = "";
	url.hash = "";
	return url.href;
}

/**
 * URL canonique : chemin et paramètres conservés (« /annonces/?page=2 »),
 * fragment retiré, TOUJOURS sur le domaine de production (même si l'entrée
 * est une URL absolue d'un autre hôte : workers.dev, localhost…).
 */
export function urlCanonique(chemin: string): string {
	const source = new URL(chemin, `${URL_SITE}/`);
	return new URL(source.pathname + source.search, `${URL_SITE}/`).href;
}

/** URL absolue d'une ressource (image) : conservée telle quelle si déjà absolue. */
export function ressourceAbsolue(src: string): string {
	return new URL(src, `${URL_SITE}/`).href;
}

/**
 * Coupe un texte à `max` caractères au plus, sur une fin de mot, avec « … ».
 * Un texte assez court est renvoyé tel quel (espaces normalisés).
 */
export function couper(texte: string, max: number): string {
	const t = texte.replace(/\s+/g, " ").trim();
	if (t.length <= max) return t;
	const coupe = t.slice(0, max - 1);
	const espace = coupe.lastIndexOf(" ");
	return `${(espace > max / 2 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:.–-]+$/, "")}…`;
}

/** Suffixes de marque, du plus complet au plus court. */
const SUFFIXES = [" – Saccoccio & Associés, notaires", " – Saccoccio & Associés", " – Notaires à Manosque"];

/**
 * <title> d'une page : le sujet, suivi du suffixe de marque le plus complet
 * qui tient en TITRE_MAX caractères (sinon le sujet seul, coupé au besoin).
 */
export function titrePage(sujet: string): string {
	const s = sujet.replace(/\s+/g, " ").trim();
	for (const suffixe of SUFFIXES) {
		if (s.length + suffixe.length <= TITRE_MAX) return s + suffixe;
	}
	return couper(s, TITRE_MAX);
}

/** Meta description : DESCRIPTION_MAX caractères au plus. */
export function descriptionPage(texte: string): string {
	return couper(texte, DESCRIPTION_MAX);
}

/** « 04 92 70 70 70 » → « +33 4 92 70 70 70 » (format international). */
export function telephoneInternational(tel: string): string {
	const chiffres = tel.replace(/\D/g, "");
	if (!/^0\d{9}$/.test(chiffres)) return tel;
	return `+33 ${chiffres.slice(1).replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5")}`;
}

type Noeud = Record<string, unknown>;

export const ID_ETUDE = `${URL_SITE}/#etude`;
export const ID_SITE_WEB = `${URL_SITE}/#site`;

/**
 * Adresse postale publique d'un site de l'étude, lue dans le pied de page
 * (src/data/site.ts) : « 29 Avenue Jean Giono - B.P. 103 » puis
 * « 04101 MANOSQUE CEDEX ».
 */
export function adressePostale(site: Site): Noeud {
	const bureau = site.bureaux[0];
	const lignes = (bureau?.lignes ?? []).filter((l) => l.icone === "adresse").map((l) => l.texte);
	const [rue = "", ville = ""] = lignes;
	const bp = /\s*-\s*B\.?P\.?\s*(\d+)\s*$/i.exec(rue);
	const cp = /^(\d{5})\b/.exec(ville);
	return {
		"@type": "PostalAddress",
		streetAddress: bp ? rue.slice(0, bp.index).trim() : rue,
		...(bp ? { postOfficeBoxNumber: bp[1] } : {}),
		...(cp ? { postalCode: cp[1] } : {}),
		addressLocality: site.ville,
		addressRegion: "Alpes-de-Haute-Provence",
		addressCountry: "FR",
	};
}

function noeudEtude(site: Site, id: string, nom: string): Noeud {
	const lignes = site.bureaux[0]?.lignes ?? [];
	const tel = lignes.find((l) => l.icone === "telephone")?.texte;
	const fax = lignes.find((l) => l.icone === "fax")?.texte.replace(/^Fax\s*:\s*/i, "");
	return {
		"@type": "Notary",
		"@id": id,
		name: nom,
		address: adressePostale(site),
		...(tel ? { telephone: telephoneInternational(tel) } : {}),
		...(fax ? { faxNumber: telephoneInternational(fax) } : {}),
	};
}

/**
 * L'étude (schema.org Notary) : l'office de Manosque et ses annexes de
 * Gréoux-les-Bains et de Valensole, avec leurs adresses et téléphones
 * publics (ceux du pied de page).
 */
export function donneesEtude(): Noeud[] {
	const [manosque, ...annexes] = SITES;
	if (!manosque) return [];
	const logo = ressourceAbsolue("/images/logo-saccoccio.webp");
	return [
		{
			"@type": "WebSite",
			"@id": ID_SITE_WEB,
			url: `${URL_SITE}/`,
			name: `${ETUDE.nom}, notaires`,
			inLanguage: "fr-FR",
			publisher: { "@id": ID_ETUDE },
		},
		{
			...noeudEtude(manosque, ID_ETUDE, ETUDE.nom),
			legalName: ETUDE.raisonSociale,
			url: `${URL_SITE}/`,
			logo,
			image: logo,
			areaServed: { "@type": "AdministrativeArea", name: "Alpes-de-Haute-Provence" },
			department: annexes.map((site) =>
				noeudEtude(site, `${URL_SITE}/#etude-${slug(site.ville)}`, `${ETUDE.nom} – annexe de ${site.ville}`),
			),
		},
	];
}

const slug = (s: string) =>
	s
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

/**
 * Fil d'Ariane schema.org (BreadcrumbList) : « Accueil », les maillons
 * qui ont une page, puis la page courante (son URL canonique).
 */
export function filArianeLd(elements: readonly { label: string; href?: string }[], canonique: string): Noeud | null {
	if (elements.length === 0) return null;
	const derniers = elements.length - 1;
	const maillons = [
		{ nom: "Accueil", url: `${URL_SITE}/` },
		...elements.flatMap((el, i) =>
			i === derniers ? [{ nom: el.label, url: canonique }] : el.href ? [{ nom: el.label, url: urlAbsolue(el.href) }] : [],
		),
	];
	return {
		"@type": "BreadcrumbList",
		itemListElement: maillons.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.nom, item: m.url })),
	};
}

/**
 * Graphe JSON-LD de la page : site, étude, fil d'Ariane et données propres à
 * la page (annonce…), sans leurs « @context » individuels.
 */
export function grapheLd(noeuds: readonly (Noeud | null | undefined)[]): Noeud {
	return {
		"@context": "https://schema.org",
		"@graph": noeuds.filter((n): n is Noeud => !!n).map(({ "@context": _contexte, ...reste }) => reste),
	};
}

/** JSON pour <script type="application/ld+json"> (sans « </ » qui fermerait la balise). */
export function jsonLd(donnees: unknown): string {
	return JSON.stringify(donnees).replace(/</g, "\\u003c");
}
