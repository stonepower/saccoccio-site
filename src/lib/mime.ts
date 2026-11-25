/**
 * Construction d'un e-mail MIME minimal (texte brut UTF-8), sans dépendance :
 * quelques lignes suffisent, là où `mimetext` ajouterait du poids au Worker.
 *
 * Protection contre l'injection d'en-têtes :
 * - aucun en-tête ne contient de texte du visiteur tel quel : l'objet et le
 *   nom affiché sont encodés en « encoded-words » base64 (RFC 2047), après
 *   suppression de tous les caractères de contrôle (dont CR et LF) ;
 * - les adresses (From, To, Reply-To) sont vérifiées par `adresseSure` et
 *   refusées si elles contiennent autre chose qu'une adresse simple ;
 * - le corps est encodé en base64 : une ligne « . » ou un en-tête glissé
 *   dans le message ne peut rien produire.
 */

export interface EmailTexte {
	/** Adresse de l'expéditeur (domaine du site). */
	from: string;
	/** Nom affiché de l'expéditeur. */
	fromNom: string;
	to: string;
	replyTo?: string;
	objet: string;
	texte: string;
	date: Date;
	/** Identifiant unique (sans chevrons), par ex. un UUID. */
	id: string;
}

/** Adresse e-mail simple : pas d'espace, de chevron, de guillemet ni de virgule. */
const ADRESSE =
	/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function adresseSure(adresse: string): boolean {
	return adresse.length <= 254 && ADRESSE.test(adresse);
}

/** Retire les caractères de contrôle (CR, LF, tabulations, DEL, C1…) et les espaces multiples. */
export function texteEnTete(valeur: string): string {
	return valeur
		.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const encodeur = new TextEncoder();

function base64(octets: Uint8Array): string {
	let binaire = "";
	for (const o of octets) binaire += String.fromCharCode(o);
	return btoa(binaire);
}

/**
 * Encoded-words RFC 2047 (`=?UTF-8?B?…?=`), découpés sans couper un
 * caractère : 45 octets au plus par mot (60 caractères base64), mots séparés
 * par un repli de ligne CRLF + espace.
 */
export function encoderMot(valeur: string): string {
	const propre = texteEnTete(valeur);
	if (/^[\x20-\x7e]*$/.test(propre) && !propre.includes("=?")) return propre;
	const mots: string[] = [];
	let morceau: number[] = [];
	for (const caractere of propre) {
		const octets = encodeur.encode(caractere);
		if (morceau.length + octets.length > 45) {
			mots.push(`=?UTF-8?B?${base64(Uint8Array.from(morceau))}?=`);
			morceau = [];
		}
		morceau.push(...octets);
	}
	if (morceau.length > 0) mots.push(`=?UTF-8?B?${base64(Uint8Array.from(morceau))}?=`);
	return mots.join("\r\n ");
}

/** Date au format RFC 5322 (« Wed, 25 Nov 2026 10:00:00 +0000 »). */
function dateRfc5322(date: Date): string {
	return date.toUTCString().replace(/GMT$/, "+0000");
}

/** Corps encodé en base64, lignes de 76 caractères. */
function corpsBase64(texte: string): string {
	const normalise = texte.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
	return (base64(encodeur.encode(normalise)).match(/.{1,76}/g) ?? []).join("\r\n");
}

/** Message MIME complet (en-têtes + corps), lignes terminées par CRLF. */
export function construireMime(email: EmailTexte): string {
	for (const [nom, adresse] of [
		["From", email.from],
		["To", email.to],
		["Reply-To", email.replyTo],
	] as const) {
		if (adresse !== undefined && !adresseSure(adresse)) throw new Error(`Adresse ${nom} invalide`);
	}
	const domaine = email.from.split("@")[1];
	const id = email.id.replace(/[^A-Za-z0-9.-]/g, "");
	if (!id) throw new Error("Identifiant de message vide");

	const enTetes = [
		`From: ${encoderMot(email.fromNom)} <${email.from}>`,
		`To: <${email.to}>`,
		...(email.replyTo ? [`Reply-To: <${email.replyTo}>`] : []),
		`Subject: ${encoderMot(email.objet)}`,
		`Date: ${dateRfc5322(email.date)}`,
		`Message-ID: <${id}@${domaine}>`,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"Content-Transfer-Encoding: base64",
	];
	return `${enTetes.join("\r\n")}\r\n\r\n${corpsBase64(email.texte)}\r\n`;
}
