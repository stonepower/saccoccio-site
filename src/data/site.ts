/**
 * Informations publiques de l'étude, reprises de l'ancien site, et
 * navigation commune (en-tête, menu et pied de page).
 *
 * Les URL pointent vers les futures pages (import des contenus dans une PR
 * ultérieure) : elles répondent 404 pour l'instant, c'est normal.
 */

export const ETUDE = {
	nom: "Saccoccio & Associés",
	raisonSociale: "SAS NOTAIRES EXPERTS SUD04",
	notaires: [
		"Philippe SACCOCCIO",
		"Sophie CASANOVA-TIRAND",
		"Vincent BONDIL",
		"Claire CHOUQUET",
		"François ALBESSARD",
	],
	notairesSalaries: [
		"Kathy LAURENT",
		"Lucie MICHAUD",
		"Valérie MARC-VIVIEN",
		"Caroline SAUJEON",
		"Marlène SALEH",
	],
	agrement: "04025/2010.02.18.-03",
	debutCopyright: 2009,
} as const;

export interface NavItem {
	label: string;
	href: string;
	children?: readonly NavItem[];
}

/** Menu principal (le drapeau anglais de l'ancien site est supprimé). */
export const NAVIGATION: readonly NavItem[] = [
	{
		label: "L'office notarial",
		href: "/office-notarial/",
		children: [
			{ label: "Historique", href: "/office-notarial/#historique" },
			{ label: "Fonctions de l'Étude", href: "/office-notarial/#fonctions" },
			{ label: "Profession Notaire", href: "/office-notarial/#profession" },
			{ label: "L'équipe", href: "/office-notarial/#equipe" },
			{ label: "Lexique", href: "/office-notarial/#lexique" },
			{ label: "Tarifs", href: "/office-notarial/#tarifs" },
			{ label: "Prédécesseurs", href: "/office-notarial/#predecesseurs" },
		],
	},
	{ label: "Annonces immobilières", href: "/annonces/" },
	{
		label: "Contact",
		href: "/contact/",
		children: [{ label: "Coordonnées", href: "/contact/" }],
	},
];

export interface Ligne {
	icone: "adresse" | "telephone" | "fax";
	texte: string;
}

export interface Bureau {
	titre: string;
	lignes: readonly Ligne[];
}

export interface Site {
	ville: string;
	blason: string;
	blasonAlt: string;
	bureaux: readonly Bureau[];
}

/** Les trois sites de l'étude (pied de page). */
export const SITES: readonly Site[] = [
	{
		ville: "Manosque",
		blason: "/images/blason-manosque.webp",
		blasonAlt: "Blason de Manosque",
		bureaux: [
			{
				titre: "Office notarial",
				lignes: [
					{ icone: "adresse", texte: "29 Avenue Jean Giono - B.P. 103" },
					{ icone: "adresse", texte: "04101 MANOSQUE CEDEX" },
					{ icone: "telephone", texte: "04 92 70 70 70" },
					{ icone: "fax", texte: "Fax : 04 92 70 70 79" },
				],
			},
			{
				titre: "Office notarial",
				lignes: [
					{ icone: "adresse", texte: "Chemin des champs de Pruniers" },
					{ icone: "adresse", texte: "L’Agora Bât E, 04100 Manosque" },
					{ icone: "telephone", texte: "04 92 74 96 03" },
				],
			},
		],
	},
	{
		ville: "Gréoux-les-Bains",
		blason: "/images/blason-greoux.webp",
		blasonAlt: "Blason de Gréoux-les-Bains",
		bureaux: [
			{
				titre: "-- Annexe --",
				lignes: [
					{ icone: "adresse", texte: "237 chemin Sainte Annette" },
					{ icone: "adresse", texte: "04800 GRÉOUX-LES-BAINS" },
					{ icone: "telephone", texte: "04 92 70 14 40" },
					{ icone: "fax", texte: "Fax : 04 92 70 14 49" },
				],
			},
		],
	},
	{
		ville: "Valensole",
		blason: "/images/blason-valensole.webp",
		blasonAlt: "Blason de Valensole",
		bureaux: [
			{
				titre: "-- Annexe --",
				lignes: [
					{ icone: "adresse", texte: "Avenue Segond" },
					{ icone: "adresse", texte: "04210 VALENSOLE" },
					{ icone: "telephone", texte: "04 92 70 14 30" },
					{ icone: "fax", texte: "Fax : 04 92 70 14 32" },
				],
			},
		],
	},
];

export interface LienPied {
	label: string;
	href: string;
	externe?: boolean;
}

/** Liens du pied de page, dans l'ordre d'affichage (grille de 3 colonnes). */
export const LIENS_PIED: readonly (LienPied | readonly LienPied[])[] = [
	{ label: "Les divers Droits", href: "/office-notarial/les-divers-droits/" },
	{ label: "Conseil Supérieur des notaires", href: "https://www.notaires.fr", externe: true },
	{ label: "Conseil régional des notaires", href: "http://www.cr-aixenprovence.notaires.fr/", externe: true },
	{ label: "La lettre de mon notaire", href: "/lettre-du-notaire/" },
	{ label: "Liens utiles", href: "/liens-utiles/" },
	[
		{ label: "Mentions légales", href: "/mentions-legales/" },
		{ label: "Contact", href: "/contact/" },
	],
];

export const TEXTE_SEO =
	"Votre notaire vous propose un service de négociation et d'expertise, que vous soyez vendeur ou acquéreur vous trouverez des annonces immobilières dans le département des Alpes de Haute Provence et plus largement dans la région PACA. De plus, il pourra vous offrir des conseils juridiques sur plusieurs secteurs d'activités comme la famille, le patrimoine, l'entreprise, l'urbanisme et l'immobilier pour la vente ou l'achat d'un bien immobilier garantissant la bonne fin de vos opérations.";

/** Photos du carrousel (bandeau sous le menu), 950 × 269 px. */
export const BANDEAU = [
	{ src: "/images/bandeau/manosque.webp", alt: "Les toits de Manosque", width: 922, height: 269 },
	{ src: "/images/bandeau/photo-1.webp", alt: "La façade de l'office notarial à Manosque", width: 950, height: 269 },
	{ src: "/images/bandeau/photo-8.webp", alt: "Un village provençal au-dessus des champs", width: 950, height: 269 },
	{ src: "/images/bandeau/photo-14.webp", alt: "Vue d'ensemble d'un village provençal", width: 950, height: 269 },
	{ src: "/images/bandeau/b-08.webp", alt: "Les rives d'un lac des Alpes-de-Haute-Provence", width: 950, height: 269 },
] as const;
