#!/usr/bin/env node
// Convertit les images de design du kit de référence en WebP dans
// public/images/ (assets statiques du Worker, jamais dans R2).
//
// Usage : node scripts/optimize-images.mjs
//
// Règles (voir CLAUDE.md, « Images ») :
// - chaque image est redimensionnée à 2 × sa taille d'affichage au maximum,
//   sans jamais l'agrandir ;
// - les originaux restent dans reference/design-kit/images/ (et
//   reference/contenus-kit/images/ pour les pages de contenu) et ne sont pas
//   copiés ailleurs ;
// - les SVG vectoriels restent en SVG (copiés tels quels).
//
// Le script est idempotent : relancez-le après avoir modifié la table IMAGES
// et versionnez les fichiers produits.
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "reference/design-kit/images");
// Images des pages de contenu (kit de contenus) : servies sous /images/contenu/.
const SRC_CONTENU = join(root, "reference/contenus-kit/images");
const OUT = join(root, "public/images");

/**
 * source : fichier du kit ; out : chemin sous public/images/ ;
 * width / height : taille maximale (2 × la taille d'affichage) ;
 * quality : qualité WebP (82 par défaut) ; lossless : pour les logos à aplats.
 */
const IMAGES = [
	// Bandeau haut (affiché à 169 × 87 px)
	{ source: "templates_notaires_images_logo.png", out: "logo-saccoccio.webp", width: 338, lossless: true },
	// Logos latéraux du bandeau (60 px de haut)
	{ source: "templates_notaires_images_logo-notairesdefrance.png", out: "logo-notaires-de-france.webp", height: 120, lossless: true },
	{ source: "templates_notaires_images_logo-notairesdusud.png", out: "logo-notaires-du-sud.webp", height: 120, lossless: true },
	// Blasons du pied de page (100 px de large au maximum)
	{ source: "templates_notaires_images_logo-manosque.png", out: "blason-manosque.webp", width: 200 },
	{ source: "templates_notaires_images_logo-greoux.png", out: "blason-greoux.webp", width: 200 },
	{ source: "templates_notaires_images_logo-valensole.png", out: "blason-valensole.webp", width: 200 },
	// Carrousel (pleine largeur ; les originaux font 950 px : pas d'agrandissement)
	{ source: "UserFiles_Image_manosque_bandeau.jpg", out: "bandeau/manosque.webp", width: 1900 },
	{ source: "UserFiles_File_photo_1.jpg", out: "bandeau/photo-1.webp", width: 1900 },
	{ source: "UserFiles_File_photo_8.jpg", out: "bandeau/photo-8.webp", width: 1900 },
	{ source: "UserFiles_File_photo_14.jpg", out: "bandeau/photo-14.webp", width: 1900 },
	{ source: "UserFiles_File_b-08.jpg", out: "bandeau/b-08.webp", width: 1900 },
	// Vignettes de l'accueil (360 × 220, affichées jusqu'à 360 px)
	{ source: "UserFiles_Image_etude-home.jpg", out: "accueil-office.webp", width: 720 },
	{ source: "UserFiles_Image_manosque_bandeau-home.jpg", out: "accueil-annonces.webp", width: 720 },
	// Pictogrammes DPE et GES (fiche annonce, PR ultérieure)
	{ source: "ihm_img_diag_dpe_2021_ok4.jpg", out: "dpe/dpe-2021.webp", width: 544 },
	{ source: "ihm_img_diag_ges_2021_ok4.jpg", out: "dpe/ges-2021.webp", width: 544 },
	{ source: "ihm_img_diage-dpe.png", out: "dpe/dpe.webp", width: 358, lossless: true },
	{ source: "ihm_img_diage-ges.png", out: "dpe/ges.webp", width: 358, lossless: true },
	{ source: "ihm_img_diage-fleche.gif", out: "dpe/fleche.webp", width: 80, lossless: true },
];

/**
 * Images des pages de contenu, affichées à leur taille d'origine (190 ou
 * 280 px de large) : le plafond 2 × n'agrandit rien. Leurs dimensions sont
 * reportées dans src/lib/contenu.ts (table IMAGES_CONTENU).
 * Aucune photo de personne : celles de l'équipe ne sont pas dans le kit et
 * ne doivent pas être publiées.
 */
const IMAGES_CONTENU = [
	{ source: "etude_manosque.jpg", out: "contenu/etude_manosque.webp", width: 380 },
	{ source: "etude_greoux.jpg", out: "contenu/etude_greoux.webp", width: 380 },
	{ source: "etude_valensole.jpg", out: "contenu/etude_valensole.webp", width: 380 },
	{ source: "predecesseurs.jpg", out: "contenu/predecesseurs.webp", width: 560 },
];

/**
 * Le logo « Notaire conseil en stratégie patrimoniale & familiale » est un
 * SVG qui n'embarque qu'une image PNG de 1856 × 833 px (104 Ko) : on en
 * extrait le PNG pour produire un WebP à 2 × sa taille d'affichage (150 px).
 */
const EMBEDDED_PNG_IN_SVG = [
	{ source: "templates_notaires_images_logo-conseilenstrategie.svg", out: "logo-conseil-strategie.webp", width: 300 },
];

/** Fichiers copiés tels quels. */
const COPIES = [{ source: "favicon.ico", out: "../favicon.ico" }];

async function convert({ input, out, width, height, quality = 82, lossless = false }) {
	const target = join(OUT, out);
	await mkdir(dirname(target), { recursive: true });
	const info = await sharp(input)
		.resize({ width, height, fit: "inside", withoutEnlargement: true })
		.webp(lossless ? { lossless: true, effort: 6 } : { quality, effort: 6, smartSubsample: true })
		.toFile(target);
	console.log(`${out.padEnd(32)} ${info.width}×${info.height}  ${(info.size / 1024).toFixed(1)} Ko`);
}

for (const image of IMAGES) {
	await convert({ ...image, input: join(SRC, image.source) });
}

for (const image of IMAGES_CONTENU) {
	await convert({ ...image, input: join(SRC_CONTENU, image.source) });
}

for (const image of EMBEDDED_PNG_IN_SVG) {
	const svg = await readFile(join(SRC, image.source), "utf8");
	const match = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
	if (!match) throw new Error(`Pas de PNG embarqué dans ${image.source}`);
	await convert({ ...image, input: Buffer.from(match[1], "base64"), lossless: false, quality: 90 });
}

for (const file of COPIES) {
	const target = join(OUT, file.out);
	await copyFile(join(SRC, file.source), target);
	console.log(`${file.out.padEnd(32)} copié  ${((await stat(target)).size / 1024).toFixed(1)} Ko`);
}
