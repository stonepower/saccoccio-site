/**
 * Préparation du HTML des pages éditoriales (reference/contenus-kit/pages/),
 * exécutée au BUILD uniquement : les pages sont prérendues, ce code n'est
 * pas livré dans le Worker.
 *
 * Le texte n'est pas modifié (contenus repris à l'identique). Seuls changent :
 * - les images : liste blanche IMAGES_CONTENU (WebP, dimensions, lazy) ;
 *   toute autre image est retirée, en particulier les photos de l'équipe
 *   (aucune photo de personne n'est publiée) ;
 * - l'équipe : « nom + fonction » devient une liste, sans photo ;
 * - les liens neutralisés de l'ancien panier (`<a>Ma sélection</a>`…) ;
 * - les espaces dans les liens vers /documents/ (encodés en %20) ;
 * - les ancres du lexique (#A, #B…) reçoivent une cible.
 */

export interface ImageContenu {
	src: string;
	width: number;
	height: number;
	/** Remplace un alt vide ou absent dans le kit. */
	alt?: string;
}

/** Images autorisées, produites par scripts/optimize-images.mjs. */
export const IMAGES_CONTENU: Readonly<Record<string, ImageContenu>> = {
	"etude_manosque.jpg": { src: "/images/contenu/etude_manosque.webp", width: 190, height: 220 },
	"etude_greoux.jpg": { src: "/images/contenu/etude_greoux.webp", width: 190, height: 143 },
	"etude_valensole.jpg": { src: "/images/contenu/etude_valensole.webp", width: 190, height: 143 },
	"predecesseurs.jpg": {
		src: "/images/contenu/predecesseurs.webp",
		width: 280,
		height: 374,
		alt: "La façade de l'office notarial et son panonceau",
	},
};

const RE_IMG = /<img\b[^>]*>/g;
const RE_SRC = /\bsrc="\/images\/contenu\/([^"]+)"/;
const RE_ALT = /\balt="([^"]*)"/;
/** Membre de l'équipe : photo, puis `<h4>Nom</h4> Fonction<br>`. */
const RE_MEMBRE = /<img\b[^>]*>\s*<h4>([^<]*)<\/h4>\s*([^<]*?)\s*<br>/g;
const RE_LISTE_EQUIPE = /(?:<li class="equipe-membre">[\s\S]*?<\/li>\s*)+/g;
const RE_LIEN_NEUTRALISE = /\s*<a>[^<]*<\/a>/g;
const RE_HREF_DOCUMENT = /href="(\/documents\/[^"]*)"/g;

function remplacerImage(balise: string): string {
	const nom = RE_SRC.exec(balise)?.[1];
	const image = nom ? IMAGES_CONTENU[nom] : undefined;
	// Image hors liste blanche (photo de personne…) : jamais publiée.
	if (!image) return "";
	const altKit = (RE_ALT.exec(balise)?.[1] ?? "").trim();
	const alt = altKit || image.alt || "";
	return `<img src="${image.src}" alt="${alt}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">`;
}

/** Donne un `id` (A, B…) au premier terme de chaque lettre du lexique. */
function ancresLexique(html: string): string {
	const debut = html.search(/<p>\s*<a href="#A">/);
	if (debut < 0) return html;
	const finRelative = html.slice(debut).search(/<h1\b/);
	const fin = finRelative < 0 ? html.length : debut + finRelative;
	const cibles = new Set([...html.slice(debut, fin).matchAll(/href="#([A-Z])"/g)].map((m) => m[1]));
	const vues = new Set<string>();
	const zone = html.slice(debut, fin).replace(/<li>(\s*<strong>\s*)(\p{L})/gu, (tout, avant: string, lettre: string) => {
		const cle = lettre.normalize("NFD").charAt(0).toUpperCase();
		if (!cibles.has(cle) || vues.has(cle)) return tout;
		vues.add(cle);
		return `<li id="${cle}">${avant}${lettre}`;
	});
	return html.slice(0, debut) + zone + html.slice(fin);
}

export function preparerHtml(html: string): string {
	let resultat = html
		.replace(
			RE_MEMBRE,
			(_, nom: string, fonction: string) =>
				`<li class="equipe-membre"><strong>${nom.trim()}</strong> <span>${fonction.trim()}</span></li>\n`,
		)
		.replace(RE_LISTE_EQUIPE, (liste) => `<ul class="equipe">\n${liste.trim()}\n</ul>\n`)
		.replace(RE_IMG, remplacerImage)
		.replace(RE_LIEN_NEUTRALISE, "")
		.replace(RE_HREF_DOCUMENT, (_, chemin: string) => `href="${chemin.replace(/ /g, "%20")}"`);
	resultat = ancresLexique(resultat);
	return resultat.trim();
}

/** Texte brut (sans balises), espaces normalisés. */
export function texteBrut(html: string): string {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

/** Meta description : premier paragraphe significatif, coupé vers 155 caractères. */
export function description(html: string, repli: string): string {
	for (const [, contenu] of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
		const texte = texteBrut(contenu ?? "");
		if (texte.length < 60) continue;
		if (texte.length <= 155) return texte;
		const coupe = texte.slice(0, 155);
		return `${coupe.slice(0, coupe.lastIndexOf(" ")).replace(/[\s,;:.–-]+$/, "")}…`;
	}
	return repli;
}

export interface Section {
	id: string;
	titre: string;
	html: string;
}

export interface PageDecoupee {
	/** Liens de la barre de sections (`<a href="#…">` en tête de page). */
	liens: { href: string; label: string }[];
	sections: Section[];
}

/**
 * Page longue à ancres (/office-notarial/) : le kit contient plusieurs `<h1>`
 * (un par section). On les découpe en sections ; la page garde un seul `<h1>`
 * et les titres sont décalés d'un niveau (h1 → h2, h2 → h3…).
 * Renvoie null pour une page ordinaire (sans `<h1>`).
 */
export function decouperSections(html: string): PageDecoupee | null {
	const premier = html.search(/<h1\b/);
	if (premier < 0) return null;
	const entete = html.slice(0, premier);
	const liens = [...entete.matchAll(/<a href="(#[^"]+)">([^<]*)<\/a>/g)].map((m) => ({
		href: m[1] ?? "",
		label: (m[2] ?? "").trim(),
	}));
	const morceaux = html.slice(premier).split(/(?=<h1\b)/);
	const sections = morceaux.map((morceau) => {
		const m = /^<h1(?:\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/h1>/.exec(morceau);
		const corps = morceau.slice(m?.[0].length ?? 0);
		return {
			id: m?.[1] ?? "",
			titre: texteBrut(m?.[2] ?? ""),
			html: corps.replace(/<(\/?)h([2-5])\b/g, (_, slash: string, n: string) => `<${slash}h${Number(n) + 1}`).trim(),
		};
	});
	return { liens, sections };
}
