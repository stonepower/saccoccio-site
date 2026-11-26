/**
 * Sources HTML des pages éditoriales (reference/contenus-kit/pages/) et leurs
 * meta descriptions. Utilisé au BUILD uniquement, par la route prérendue
 * src/pages/[...chemin].astro (rien de ce module n'est livré au Worker).
 */
import type { PageEditoriale } from "../data/pages";
import { PAGES } from "../data/pages";
import { description, preparerHtml } from "./contenu";
import { descriptionPage } from "./seo";

const sources = import.meta.glob<string>("../../reference/contenus-kit/pages/*.html", {
	query: "?raw",
	import: "default",
	eager: true,
});

/** HTML du kit pour une page (undefined si le fichier manque). */
export function sourcePage(page: PageEditoriale): string | undefined {
	return sources[`../../reference/contenus-kit/pages/${page.fichier}`];
}

/** « Droit de la famille : Le mariage » → « Le mariage ». */
const sujet = (h1: string) => h1.split(" : ").at(-1) ?? h1;

/**
 * Meta description de chaque page (≤ 155 caractères, unique : voir
 * tests/seo.test.mjs) : le premier paragraphe significatif. Quand plusieurs
 * pages commencent par le même paragraphe (« Ma Famille » et « Le mariage »…),
 * le sujet de la page le précède.
 */
export function descriptionsPages(): Map<string, string> {
	const premieres = PAGES.map((p) => ({
		page: p,
		texte: description(
			preparerHtml(sourcePage(p) ?? ""),
			`${p.h1} : informations de l'office notarial Saccoccio & Associés, à Manosque.`,
		),
	}));
	const compte = new Map<string, number>();
	for (const { texte } of premieres) compte.set(texte, (compte.get(texte) ?? 0) + 1);
	return new Map(
		premieres.map(({ page, texte }) => [
			page.url,
			descriptionPage((compte.get(texte) ?? 0) > 1 ? `${sujet(page.h1)} : ${texte}` : texte),
		]),
	);
}
