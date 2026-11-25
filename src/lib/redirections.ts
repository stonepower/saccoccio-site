/**
 * Redirections 301 des anciennes URL (osCommerce) vers les nouvelles, d'après
 * la carte reference/contenus-kit/urls.csv (source unique, aucune
 * destination inventée).
 *
 * Formes reconnues :
 * - /product_info.php?products_id=N et /<slug>-p-N.html (pages ; un id
 *   inconnu est une annonce : règle générique « annonce » → /annonces/) ;
 * - /index.php?cPath=N et /<slug>-c-N.html (rubriques ; cPath imbriqué
 *   « 16_18 » : on prend la dernière rubrique) ; /index.php seul → / ;
 * - chemins simples : /allprods.php, /CalcAmortEuR2.htm, /contact_us.php
 *   (quel que soit le query string).
 *
 * Module pur (sans dépendance) : testé par tests/redirections.test.ts.
 * Le coût par requête est une recherche dans une Map.
 */

export interface TableRedirections {
	produits: Map<string, string>;
	rubriques: Map<string, string>;
	chemins: Map<string, string>;
	/** Règle générique des annonces (products_id=*). */
	produitParDefaut?: string;
}

/** Découpe une ligne CSV (guillemets doubles gérés). */
function lireLigneCsv(ligne: string): string[] {
	const champs: string[] = [];
	let courant = "";
	let entreGuillemets = false;
	for (let i = 0; i < ligne.length; i++) {
		const c = ligne[i];
		if (entreGuillemets) {
			if (c === '"' && ligne[i + 1] === '"') {
				courant += '"';
				i++;
			} else if (c === '"') entreGuillemets = false;
			else courant += c;
		} else if (c === '"') entreGuillemets = true;
		else if (c === ",") {
			champs.push(courant);
			courant = "";
		} else courant += c;
	}
	champs.push(courant);
	return champs;
}

function ajouter(table: Map<string, string>, cle: string, destination: string): void {
	const existante = table.get(cle);
	if (existante !== undefined && existante !== destination) {
		throw new Error(`urls.csv : destinations contradictoires pour ${cle} (${existante} / ${destination})`);
	}
	table.set(cle, destination);
}

export function construireTable(csv: string): TableRedirections {
	const table: TableRedirections = { produits: new Map(), rubriques: new Map(), chemins: new Map() };
	const lignes = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
	const entete = lireLigneCsv(lignes.shift() ?? "");
	const col = (nom: string) => {
		const i = entete.indexOf(nom);
		if (i < 0) throw new Error(`urls.csv : colonne ${nom} absente`);
		return i;
	};
	const anciennes = [col("ancienne_url_1"), col("ancienne_url_2")];
	const nouvelle = col("nouvelle_url_proposee");

	for (const ligne of lignes) {
		const champs = lireLigneCsv(ligne);
		const destination = champs[nouvelle]?.trim();
		if (!destination?.startsWith("/")) continue;
		for (const i of anciennes) {
			const ancienne = champs[i]?.trim().split(" ")[0] ?? "";
			let m: RegExpExecArray | null;
			if ((m = /^\/product_info\.php\?products_id=(\d+|\*)$/.exec(ancienne))) {
				if (m[1] === "*") table.produitParDefaut = destination;
				else ajouter(table.produits, m[1] ?? "", destination);
			} else if ((m = /^\/\*-p-(\d+)\.html$/.exec(ancienne))) {
				ajouter(table.produits, m[1] ?? "", destination);
			} else if ((m = /^\/index\.php\?cPath=(\d+)$/.exec(ancienne))) {
				ajouter(table.rubriques, m[1] ?? "", destination);
			} else if ((m = /^\/\*-c-(\d+)\.html$/.exec(ancienne))) {
				ajouter(table.rubriques, m[1] ?? "", destination);
			} else if ((m = /^(\/[^?*\s]+?)(?:\?.*)?$/.exec(ancienne))) {
				// Chemin simple ; un query string éventuel (contact_us.php?service=…)
				// est ignoré : toute variante va à la même destination.
				ajouter(table.chemins, m[1] ?? "", destination);
			}
		}
	}
	// L'accueil osCommerce sans rubrique (cPath=0 → / dans la carte).
	const accueil = table.rubriques.get("0");
	if (accueil) table.chemins.set("/index.php", accueil);
	return table;
}

/** Dernière rubrique d'un cPath osCommerce (« 16_18 » → « 18 »). */
function derniereRubrique(cPath: string): string {
	return cPath.split("_").pop() ?? "";
}

/**
 * Destination de la redirection pour une ancienne URL, ou null.
 * Le query string d'origine n'est jamais recopié.
 */
export function trouverRedirection(table: TableRedirections, pathname: string, search: string): string | null {
	const params = new URLSearchParams(search);
	if (pathname === "/product_info.php") {
		const id = params.get("products_id");
		if (!id) return null;
		return table.produits.get(id) ?? table.produitParDefaut ?? null;
	}
	if (pathname === "/index.php") {
		const cPath = params.get("cPath");
		if (cPath === null) return table.chemins.get("/index.php") ?? null;
		return table.rubriques.get(derniereRubrique(cPath)) ?? null;
	}
	const chemin = table.chemins.get(pathname);
	if (chemin) return chemin;
	let m: RegExpExecArray | null;
	if ((m = /^\/[^/]*-p-(\d+)\.html$/.exec(pathname))) {
		return table.produits.get(m[1] ?? "") ?? table.produitParDefaut ?? null;
	}
	if ((m = /^\/[^/]*-c-([\d_]+)\.html$/.exec(pathname))) {
		return table.rubriques.get(derniereRubrique(m[1] ?? "")) ?? null;
	}
	return null;
}
