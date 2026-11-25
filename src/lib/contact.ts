/**
 * Formulaire de contact : validation, anti-spam (Turnstile, champ piège,
 * limites de taille) et remise du message (e-mail ou stockage D1).
 *
 * Ce module ne dépend d'aucun module `cloudflare:*` : la base, le binding
 * d'envoi et `fetch` lui sont passés (voir src/lib/contact-worker.ts). Il est
 * ainsi testé tel quel par `npm test` (tests/contact.test.ts).
 *
 * Coût CPU : quelques expressions régulières, un encodage base64 et une
 * requête `fetch` (siteverify, qui est de l'attente réseau et non du CPU).
 * Bien en dessous de la limite de 10 ms du plan gratuit.
 */
import { CONTACTS } from "../data/contact.ts";
import { adresseSure, construireMime } from "./mime.ts";

// --- Limites ---------------------------------------------------------------

export const LIMITES = {
	nom: 100,
	email: 254,
	telephone: 30,
	message: 5000,
	/** Jeton Turnstile (2048 caractères au plus d'après Cloudflare). */
	jeton: 2048,
	/** Corps de la requête entière, en octets. */
	requete: 32 * 1024,
} as const;

/** Durée de conservation des messages en mode « store ». */
export const CONSERVATION_JOURS = 30;

/** Champ piège : invisible pour les personnes, rempli par les robots. */
export const CHAMP_PIEGE = "site_web";

/** Clés de test officielles de Cloudflare (« always passes »). */
export const TURNSTILE_TEST = {
	siteKey: "1x00000000000000000000AA",
	secretKey: "1x0000000000000000000000000000000AA",
} as const;

export const ACTION_TURNSTILE = "contact";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// --- Types -----------------------------------------------------------------

export type Champ = "nom" | "email" | "telephone" | "destinataire" | "message" | "consentement";

export interface Valeurs {
	nom: string;
	email: string;
	telephone: string;
	destinataire: string;
	message: string;
	consentement: boolean;
}

export type Erreurs = Partial<Record<Champ, string>>;

export type Resultat =
	| { statut: "envoye"; mode: "email" | "store" | "piege" }
	| { statut: "invalide"; valeurs: Valeurs; erreurs: Erreurs }
	| { statut: "refuse"; valeurs: Valeurs }
	| { statut: "echec"; valeurs: Valeurs; raison: string };

/** Sous-ensemble de D1Database utilisé ici. */
export interface BaseLike {
	prepare(sql: string): { bind(...valeurs: unknown[]): unknown };
	batch(requetes: unknown[]): Promise<unknown>;
}

/** Binding `send_email` (Email Routing). */
export interface EnvoiLike {
	send(message: unknown): Promise<unknown>;
}

export interface Config {
	mode: "email" | "store";
	/** Destinataire (adresse vérifiée dans Email Routing). */
	to: string;
	/** Expéditeur, sur le domaine du site. */
	from: string;
	/** Clé secrète Turnstile ; absente → clé de test. */
	turnstileSecret?: string;
}

export interface Dependances {
	fetch: typeof fetch;
	maintenant: () => Date;
	id: () => string;
	/** Mode « store ». */
	base?: BaseLike;
	/** Mode « email » : binding absent tant qu'Email Routing n'est pas actif. */
	envoi?: EnvoiLike;
	/** Construit l'objet attendu par `envoi.send` (EmailMessage de `cloudflare:email`). */
	creerMessage?: (from: string, to: string, brut: string) => unknown;
	/** Journal (sans contenu personnel). */
	journal?: (evenement: Record<string, string | number | boolean>) => void;
}

// --- Validation ------------------------------------------------------------

const VIDES: Valeurs = { nom: "", email: "", telephone: "", destinataire: "", message: "", consentement: false };

export function valeursVides(): Valeurs {
	return { ...VIDES };
}

const texte = (form: FormData, cle: string) => {
	const v = form.get(cle);
	return typeof v === "string" ? v : "";
};

/** Une ligne : caractères de contrôle et retours à la ligne remplacés par une espace. */
const uneLigne = (v: string) =>
	v
		.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/** Texte libre : retours à la ligne gardés (\n), autres caractères de contrôle retirés. */
const plusieursLignes = (v: string) =>
	v
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
		.trim();

/** Longueur en caractères (et non en unités UTF-16). */
const longueur = (v: string) => [...v].length;

export function lireValeurs(form: FormData): Valeurs {
	return {
		nom: uneLigne(texte(form, "nom")),
		email: uneLigne(texte(form, "email")),
		telephone: uneLigne(texte(form, "telephone")),
		destinataire: uneLigne(texte(form, "destinataire")),
		message: plusieursLignes(texte(form, "message")),
		consentement: texte(form, "consentement") === "oui",
	};
}

export function valider(v: Valeurs): Erreurs {
	const erreurs: Erreurs = {};
	if (!v.nom) erreurs.nom = "Indiquez votre nom et votre prénom.";
	else if (longueur(v.nom) > LIMITES.nom) erreurs.nom = `${LIMITES.nom} caractères au maximum.`;

	if (!v.email) erreurs.email = "Indiquez votre adresse e-mail pour que l'étude puisse vous répondre.";
	else if (!adresseSure(v.email)) erreurs.email = "Cette adresse e-mail n'est pas valide (exemple : nom@domaine.fr).";

	if (longueur(v.telephone) > LIMITES.telephone || !/^[0-9+().\s-]*$/.test(v.telephone))
		erreurs.telephone = "Ce numéro de téléphone n'est pas valide (chiffres, espaces, +, points et tirets).";

	if (v.destinataire && !CONTACTS.includes(v.destinataire)) erreurs.destinataire = "Choisissez un contact dans la liste.";

	if (!v.message) erreurs.message = "Écrivez votre message.";
	else if (longueur(v.message) > LIMITES.message)
		erreurs.message = `Votre message dépasse ${LIMITES.message} caractères (${longueur(v.message)}).`;

	if (!v.consentement)
		erreurs.consentement = "Cochez la case pour accepter le traitement de vos données, nécessaire pour vous répondre.";
	return erreurs;
}

// --- Turnstile -------------------------------------------------------------

export type Verification = "ok" | "refuse" | "indisponible";

/** Vérification côté serveur du jeton Turnstile (siteverify). */
export async function verifierTurnstile(
	jeton: string,
	secret: string | undefined,
	ip: string | null,
	f: typeof fetch,
): Promise<Verification> {
	if (!jeton || jeton.length > LIMITES.jeton) return "refuse";
	const cle = secret || TURNSTILE_TEST.secretKey;
	const corps = new URLSearchParams({ secret: cle, response: jeton });
	if (ip) corps.set("remoteip", ip);
	let reponse: Response;
	try {
		reponse = await f(SITEVERIFY, { method: "POST", body: corps, signal: AbortSignal.timeout(5000) });
	} catch {
		return "indisponible";
	}
	if (!reponse.ok) return "indisponible";
	const resultat = (await reponse.json().catch(() => null)) as { success?: boolean; action?: string } | null;
	if (!resultat?.success) return "refuse";
	// Les clés de test ne renvoient pas d'action ; avec une vraie clé, le jeton
	// doit venir du widget de ce formulaire.
	if (cle !== TURNSTILE_TEST.secretKey && resultat.action !== ACTION_TURNSTILE) return "refuse";
	return "ok";
}

// --- Remise du message -----------------------------------------------------

/** Contenu texte de l'e-mail adressé à l'étude. */
export function texteEmail(v: Valeurs, date: Date): string {
	const quand = new Intl.DateTimeFormat("fr-FR", {
		dateStyle: "full",
		timeStyle: "short",
		timeZone: "Europe/Paris",
	}).format(date);
	return [
		"Nouveau message envoyé depuis le formulaire de contact du site.",
		"",
		`Nom / Prénom : ${v.nom}`,
		`E-mail : ${v.email}`,
		`Téléphone : ${v.telephone || "non renseigné"}`,
		`Contact souhaité : ${v.destinataire || "non précisé"}`,
		"",
		"Message :",
		v.message,
		"",
		"--",
		`Envoyé le ${quand}. Le visiteur a accepté le traitement de ses données pour cette demande.`,
		"Pour lui répondre, utilisez « Répondre » : la réponse part vers son adresse.",
	].join("\n");
}

export function objetEmail(v: Valeurs): string {
	return `Contact site : ${v.nom}${v.destinataire ? ` (pour ${v.destinataire})` : ""}`;
}

async function stocker(v: Valeurs, deps: Dependances): Promise<void> {
	if (!deps.base) throw new Error("Binding DB absent");
	const maintenant = deps.maintenant().getTime();
	const limite = maintenant - CONSERVATION_JOURS * 24 * 60 * 60 * 1000;
	// Purge au fil de l'eau : chaque insertion supprime d'abord les messages
	// de plus de 30 jours (index sur cree_le). Une seule aller-retour D1.
	await deps.base.batch([
		deps.base.prepare("DELETE FROM contact_messages WHERE cree_le < ?").bind(limite),
		deps.base
			.prepare(
				"INSERT INTO contact_messages (cree_le, nom, email, telephone, destinataire, message) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind(maintenant, v.nom, v.email, v.telephone || null, v.destinataire || null, v.message),
	]);
}

async function envoyer(v: Valeurs, config: Config, deps: Dependances): Promise<void> {
	if (!deps.envoi || !deps.creerMessage) throw new Error("Binding d'envoi absent");
	const date = deps.maintenant();
	const brut = construireMime({
		from: config.from,
		fromNom: "Site Saccoccio & Associés",
		to: config.to,
		replyTo: v.email,
		objet: objetEmail(v),
		texte: texteEmail(v, date),
		date,
		id: deps.id(),
	});
	await deps.envoi.send(deps.creerMessage(config.from, config.to, brut));
}

/**
 * Traite une soumission du formulaire. Ne lève pas d'exception : chaque
 * issue est un `Resultat`. Le journal ne reçoit jamais le contenu.
 */
export async function traiterContact(
	form: FormData,
	ip: string | null,
	config: Config,
	deps: Dependances,
): Promise<Resultat> {
	const journal = deps.journal ?? (() => {});
	const valeurs = lireValeurs(form);

	// Champ piège rempli : on répond comme si tout allait bien, sans rien faire.
	if (texte(form, CHAMP_PIEGE) !== "") {
		journal({ evenement: "contact", issue: "piege" });
		return { statut: "envoye", mode: "piege" };
	}

	const erreurs = valider(valeurs);
	if (Object.keys(erreurs).length > 0) {
		journal({ evenement: "contact", issue: "invalide", champs: Object.keys(erreurs).join(",") });
		return { statut: "invalide", valeurs, erreurs };
	}

	const verification = await verifierTurnstile(
		texte(form, "cf-turnstile-response"),
		config.turnstileSecret,
		ip,
		deps.fetch,
	);
	if (verification !== "ok") {
		journal({ evenement: "contact", issue: `turnstile-${verification}` });
		return verification === "refuse"
			? { statut: "refuse", valeurs }
			: { statut: "echec", valeurs, raison: "turnstile-indisponible" };
	}

	try {
		if (config.mode === "email") await envoyer(valeurs, config, deps);
		else await stocker(valeurs, deps);
	} catch (erreur) {
		journal({
			evenement: "contact",
			issue: "echec",
			mode: config.mode,
			// Message d'erreur tronqué, adresses masquées (jamais de donnée du visiteur).
			erreur: erreur instanceof Error ? erreur.message.replace(/\S+@\S+/g, "[adresse]").slice(0, 200) : "inconnue",
		});
		return { statut: "echec", valeurs, raison: config.mode };
	}
	journal({ evenement: "contact", issue: "envoye", mode: config.mode });
	return { statut: "envoye", mode: config.mode };
}

/** Code HTTP de la réponse selon le résultat. */
export function codeHttp(r: Resultat): number {
	switch (r.statut) {
		case "envoye":
			return 200;
		case "invalide":
			return 422;
		case "refuse":
			return 403;
		case "echec":
			return 503;
	}
}
