/**
 * Analyseur XML minimal, sans dépendance, suffisant pour le flux Immonot :
 * éléments, attributs, texte, CDATA, commentaires et entités. Il refuse un
 * document mal formé (balise non fermée, croisée, texte hors racine…) :
 * un flux tronqué doit échouer, pas produire un import partiel.
 *
 * Pas de DTD ni d'entités externes (rien n'est jamais téléchargé).
 */

export class ErreurXml extends Error {
	constructor(message, position) {
		super(position === undefined ? message : `${message} (caractère ${position})`);
		this.name = "ErreurXml";
	}
}

/**
 * Décode les octets du fichier. UTF-8 strict par défaut (un octet invalide
 * est une erreur, pas un « � » silencieux comme sur l'ancien site) ; un
 * fichier déclaré ISO-8859-1 / windows-1252 est aussi accepté.
 * @param {Uint8Array} octets
 */
export function decoder(octets) {
	let debut = 0;
	if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) debut = 3; // BOM UTF-8
	const entete = new TextDecoder("latin1").decode(octets.subarray(debut, debut + 200));
	const declare = /^<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(entete)?.[1]?.toLowerCase();
	const encodage = declare && /^(iso-8859-1|iso-8859-15|latin1|windows-1252|cp1252)$/.test(declare) ? "windows-1252" : "utf-8";
	if (declare && encodage === "utf-8" && declare !== "utf-8" && declare !== "utf8") {
		throw new ErreurXml(`encodage déclaré non pris en charge : ${declare}`);
	}
	try {
		return new TextDecoder(encodage, { fatal: true }).decode(octets.subarray(debut));
	} catch {
		throw new ErreurXml(`le fichier n'est pas un texte ${encodage.toUpperCase()} valide`);
	}
}

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decoderEntites(texte, position) {
	return texte.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);?/g, (brut, nom) => {
		if (!brut.endsWith(";")) throw new ErreurXml(`entité non terminée « ${brut} »`, position);
		if (nom[0] === "#") {
			const code = nom[1] === "x" ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10);
			if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) throw new ErreurXml(`entité invalide ${brut}`, position);
			return String.fromCodePoint(code);
		}
		const valeur = ENTITES[nom];
		if (valeur === undefined) throw new ErreurXml(`entité inconnue ${brut}`, position);
		return valeur;
	});
}

/**
 * @typedef {{ nom: string, attributs: Record<string, string>, enfants: Noeud[], texte: string }} Noeud
 * `texte` : concaténation du texte direct de l'élément (entités décodées).
 */

const NOM = /^[A-Za-z_][\w.\-:]*/;

/**
 * @param {string} source
 * @returns {Noeud} l'élément racine
 */
export function analyserXml(source) {
	let i = 0;
	/** @type {Noeud[]} */
	const pile = [];
	/** @type {Noeud | null} */
	let racine = null;

	const attendre = (motif, message) => {
		const j = source.indexOf(motif, i);
		if (j < 0) throw new ErreurXml(message, i);
		return j;
	};

	while (i < source.length) {
		const lt = source.indexOf("<", i);
		const texte = source.slice(i, lt < 0 ? source.length : lt);
		if (texte) {
			const courant = pile.at(-1);
			if (courant) courant.texte += decoderEntites(texte, i);
			else if (texte.trim()) throw new ErreurXml("texte en dehors de l'élément racine", i);
		}
		if (lt < 0) break;
		i = lt;

		if (source.startsWith("<?", i)) {
			i = attendre("?>", "instruction de traitement non fermée") + 2;
		} else if (source.startsWith("<!--", i)) {
			i = attendre("-->", "commentaire non fermé") + 3;
		} else if (source.startsWith("<![CDATA[", i)) {
			const fin = attendre("]]>", "section CDATA non fermée");
			const courant = pile.at(-1);
			if (!courant) throw new ErreurXml("CDATA en dehors de l'élément racine", i);
			courant.texte += source.slice(i + 9, fin);
			i = fin + 3;
		} else if (source.startsWith("<!", i)) {
			// DOCTYPE : refusé (aucune entité externe).
			throw new ErreurXml("déclaration <!…> non prise en charge", i);
		} else if (source.startsWith("</", i)) {
			const fin = attendre(">", "balise fermante non terminée");
			const nom = source.slice(i + 2, fin).trim();
			const ouvert = pile.pop();
			if (!ouvert || ouvert.nom !== nom) {
				throw new ErreurXml(`balise </${nom}> inattendue${ouvert ? ` (attendu </${ouvert.nom}>)` : ""}`, i);
			}
			i = fin + 1;
		} else {
			i++;
			const nom = NOM.exec(source.slice(i, i + 200))?.[0];
			if (!nom) throw new ErreurXml("nom de balise invalide", i);
			i += nom.length;
			/** @type {Noeud} */
			const noeud = { nom, attributs: {}, enfants: [], texte: "" };
			for (;;) {
				const blanc = /^\s*/.exec(source.slice(i, i + 1000))?.[0] ?? "";
				i += blanc.length;
				if (source.startsWith("/>", i) || source[i] === ">") break;
				if (!blanc) throw new ErreurXml(`attribut mal séparé dans <${nom}>`, i);
				const m = /^([A-Za-z_][\w.\-:]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(source.slice(i, i + 100_000));
				if (!m) throw new ErreurXml(`attribut invalide dans <${nom}>`, i);
				if (m[1] in noeud.attributs) throw new ErreurXml(`attribut ${m[1]} en double dans <${nom}>`, i);
				noeud.attributs[m[1]] = decoderEntites(m[3] ?? m[4] ?? "", i);
				i += m[0].length;
			}
			const parent = pile.at(-1);
			if (parent) parent.enfants.push(noeud);
			else if (racine) throw new ErreurXml("plusieurs éléments racine", i);
			else racine = noeud;
			if (source[i] === ">") {
				pile.push(noeud);
				i += 1;
			} else {
				i += 2; // élément vide <x />
			}
		}
	}
	if (pile.length) throw new ErreurXml(`document tronqué : <${pile.at(-1)?.nom}> n'est pas fermé`);
	if (!racine) throw new ErreurXml("aucun élément racine");
	return racine;
}

/** Premier enfant nommé `nom`, ou undefined. */
export function enfant(noeud, nom) {
	return noeud.enfants.find((e) => e.nom === nom);
}

/** Enfants nommés `nom`. */
export function enfants(noeud, nom) {
	return noeud.enfants.filter((e) => e.nom === nom);
}
