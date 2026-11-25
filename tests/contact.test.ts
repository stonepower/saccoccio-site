// Formulaire de contact : validation, champ piège, Turnstile simulé, modes
// « store » et « email » (D1 et binding send_email simulés), en-têtes MIME.
// Aucune donnée réelle : uniquement des valeurs fictives.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTACTS } from "../src/data/contact.ts";
import {
	CHAMP_PIEGE,
	type Config,
	CONSERVATION_JOURS,
	type Dependances,
	LIMITES,
	TURNSTILE_TEST,
	traiterContact,
	verifierTurnstile,
} from "../src/lib/contact.ts";
import { construireMime, encoderMot } from "../src/lib/mime.ts";

const MAINTENANT = new Date("2026-11-25T10:00:00Z");
const JETON = "XXXX.DUMMY.TOKEN.XXXX";

function formulaire(champs: Record<string, string> = {}): FormData {
	const f = new FormData();
	const defaut: Record<string, string> = {
		nom: "Camille Exemple",
		email: "camille@example.test",
		telephone: "04 00 00 00 00",
		destinataire: CONTACTS[0],
		message: "Bonjour,\nJe souhaite un rendez-vous.",
		consentement: "oui",
		"cf-turnstile-response": JETON,
		[CHAMP_PIEGE]: "",
	};
	for (const [k, v] of Object.entries({ ...defaut, ...champs })) f.set(k, v);
	return f;
}

/** fetch simulé pour siteverify : enregistre les appels. */
function siteverify(reponse: unknown, appels: URLSearchParams[] = [], ok = true): typeof fetch {
	return (async (_url: string, init: RequestInit) => {
		appels.push(new URLSearchParams(init.body as URLSearchParams));
		return new Response(JSON.stringify(reponse), { status: ok ? 200 : 500 });
	}) as unknown as typeof fetch;
}

/** D1 simulée : garde les requêtes préparées et leurs paramètres. */
function baseSimulee() {
	const requetes: { sql: string; params: unknown[] }[] = [];
	return {
		requetes,
		base: {
			prepare: (sql: string) => ({ bind: (...params: unknown[]) => ({ sql, params }) }),
			batch: async (lot: unknown[]) => {
				requetes.push(...(lot as { sql: string; params: unknown[] }[]));
				return [];
			},
		},
	};
}

/** Binding send_email simulé. */
function envoiSimule(echoue = false) {
	const messages: { from: string; to: string; brut: string }[] = [];
	return {
		messages,
		envoi: {
			send: async (m: unknown) => {
				if (echoue) throw new Error("E_SENDER_NOT_VERIFIED camille@example.test");
				messages.push(m as { from: string; to: string; brut: string });
			},
		},
		creerMessage: (from: string, to: string, brut: string) => ({ from, to, brut }),
	};
}

const CONFIG: Config = {
	mode: "store",
	to: "etude@example.test",
	from: "formulaire@example.test",
};

function deps(extra: Partial<Dependances> = {}): Dependances & { journal: NonNullable<Dependances["journal"]>; journaux: unknown[] } {
	const journaux: unknown[] = [];
	return {
		fetch: siteverify({ success: true }),
		maintenant: () => MAINTENANT,
		id: () => "11111111-2222-3333-4444-555555555555",
		journal: (e) => journaux.push(e),
		journaux,
		...extra,
	};
}

/** Décode le corps base64 d'un message MIME. */
function corps(brut: string): string {
	const b64 = brut.split("\r\n\r\n")[1].replace(/\r\n/g, "");
	return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

function enTetes(brut: string): string[] {
	return brut.split("\r\n\r\n")[0].split("\r\n");
}

// --- Validation ------------------------------------------------------------

test("validation : champs obligatoires et consentement", async () => {
	const r = await traiterContact(
		formulaire({ nom: "  ", email: "", message: "", consentement: "" }),
		null,
		CONFIG,
		deps(),
	);
	assert.equal(r.statut, "invalide");
	assert.deepEqual(Object.keys(r.statut === "invalide" ? r.erreurs : {}).sort(), [
		"consentement",
		"email",
		"message",
		"nom",
	]);
});

test("validation : téléphone facultatif, contact vide accepté", async () => {
	const { base } = baseSimulee();
	const r = await traiterContact(formulaire({ telephone: "", destinataire: "" }), null, CONFIG, deps({ base }));
	assert.equal(r.statut, "envoye");
});

test("validation : formats et limites de taille", async () => {
	const cas: [Record<string, string>, string][] = [
		[{ email: "pas-une-adresse" }, "email"],
		[{ email: "a@b.test\r\nBcc: x@y.test" }, "email"],
		[{ email: '"x"@example.test' }, "email"],
		[{ telephone: "06 <script>" }, "telephone"],
		[{ telephone: "0".repeat(LIMITES.telephone + 1) }, "telephone"],
		[{ nom: "N".repeat(LIMITES.nom + 1) }, "nom"],
		[{ message: "m".repeat(LIMITES.message + 1) }, "message"],
		[{ destinataire: "Quelqu'un d'autre" }, "destinataire"],
	];
	for (const [champs, champ] of cas) {
		const r = await traiterContact(formulaire(champs), null, CONFIG, deps());
		assert.equal(r.statut, "invalide", JSON.stringify(champs));
		assert.ok(r.statut === "invalide" && r.erreurs[champ as keyof typeof r.erreurs], `${champ} : ${JSON.stringify(champs)}`);
	}
});

test("validation : la limite du message compte les caractères, pas les octets", async () => {
	const { base } = baseSimulee();
	const r = await traiterContact(formulaire({ message: "é".repeat(LIMITES.message) }), null, CONFIG, deps({ base }));
	assert.equal(r.statut, "envoye");
});

test("validation : les champs saisis sont renvoyés pour être réaffichés", async () => {
	const r = await traiterContact(formulaire({ email: "faux" }), null, CONFIG, deps());
	assert.equal(r.statut, "invalide");
	assert.equal(r.statut === "invalide" && r.valeurs.nom, "Camille Exemple");
	assert.equal(r.statut === "invalide" && r.valeurs.message, "Bonjour,\nJe souhaite un rendez-vous.");
});

// --- Champ piège -----------------------------------------------------------

test("champ piège rempli : réponse « envoyé » sans Turnstile, ni stockage, ni e-mail", async () => {
	const { base, requetes } = baseSimulee();
	const { envoi, messages, creerMessage } = envoiSimule();
	const appels: URLSearchParams[] = [];
	const d = deps({ base, envoi, creerMessage, fetch: siteverify({ success: true }, appels) });
	for (const mode of ["store", "email"] as const) {
		const r = await traiterContact(formulaire({ [CHAMP_PIEGE]: "https://spam.test" }), null, { ...CONFIG, mode }, d);
		assert.deepEqual(r, { statut: "envoye", mode: "piege" });
	}
	assert.equal(appels.length, 0);
	assert.equal(requetes.length, 0);
	assert.equal(messages.length, 0);
});

// --- Turnstile -------------------------------------------------------------

test("Turnstile : jeton absent → refusé sans appeler siteverify", async () => {
	const appels: URLSearchParams[] = [];
	const r = await traiterContact(
		formulaire({ "cf-turnstile-response": "" }),
		null,
		CONFIG,
		deps({ fetch: siteverify({ success: true }, appels) }),
	);
	assert.equal(r.statut, "refuse");
	assert.equal(appels.length, 0);
});

test("Turnstile : sans secret, la clé de test officielle est utilisée", async () => {
	const appels: URLSearchParams[] = [];
	const { base } = baseSimulee();
	const r = await traiterContact(formulaire(), "203.0.113.7", CONFIG, deps({ base, fetch: siteverify({ success: true }, appels) }));
	assert.equal(r.statut, "envoye");
	assert.equal(appels[0].get("secret"), TURNSTILE_TEST.secretKey);
	assert.equal(appels[0].get("response"), JETON);
	assert.equal(appels[0].get("remoteip"), "203.0.113.7");
});

test("Turnstile : échec de siteverify → refusé, rien n'est stocké", async () => {
	const { base, requetes } = baseSimulee();
	const r = await traiterContact(
		formulaire(),
		null,
		CONFIG,
		deps({ base, fetch: siteverify({ success: false, "error-codes": ["invalid-input-response"] }) }),
	);
	assert.equal(r.statut, "refuse");
	assert.equal(requetes.length, 0);
});

test("Turnstile : vraie clé → l'action du widget doit être « contact »", async () => {
	const secret = "0x4AAAAAAAexemple";
	assert.equal(await verifierTurnstile(JETON, secret, null, siteverify({ success: true, action: "contact" })), "ok");
	assert.equal(await verifierTurnstile(JETON, secret, null, siteverify({ success: true, action: "login" })), "refuse");
	assert.equal(await verifierTurnstile(JETON, secret, null, siteverify({ success: true })), "refuse");
});

test("Turnstile : siteverify injoignable → échec (503), pas de refus", async () => {
	const panne = (async () => {
		throw new TypeError("réseau");
	}) as unknown as typeof fetch;
	assert.equal(await verifierTurnstile(JETON, undefined, null, panne), "indisponible");
	assert.equal(await verifierTurnstile(JETON, undefined, null, siteverify({}, [], false)), "indisponible");
	const r = await traiterContact(formulaire(), null, CONFIG, deps({ fetch: panne }));
	assert.equal(r.statut, "echec");
});

test("Turnstile : jeton trop long refusé", async () => {
	assert.equal(
		await verifierTurnstile("x".repeat(LIMITES.jeton + 1), undefined, null, siteverify({ success: true })),
		"refuse",
	);
});

// --- Mode store ------------------------------------------------------------

test("mode store : purge des messages de plus de 30 jours puis insertion, dans le même lot", async () => {
	const { base, requetes } = baseSimulee();
	const d = deps({ base });
	const r = await traiterContact(formulaire({ telephone: "" }), null, CONFIG, d);
	assert.deepEqual(r, { statut: "envoye", mode: "store" });
	assert.equal(requetes.length, 2);
	assert.match(requetes[0].sql, /^DELETE FROM contact_messages WHERE cree_le < \?$/);
	assert.deepEqual(requetes[0].params, [MAINTENANT.getTime() - CONSERVATION_JOURS * 86_400_000]);
	assert.match(requetes[1].sql, /^INSERT INTO contact_messages /);
	assert.deepEqual(requetes[1].params, [
		MAINTENANT.getTime(),
		"Camille Exemple",
		"camille@example.test",
		null,
		CONTACTS[0],
		"Bonjour,\nJe souhaite un rendez-vous.",
	]);
	// Le journal ne contient aucune donnée du visiteur.
	assert.ok(!JSON.stringify(d.journaux).includes("Camille"));
	assert.ok(!JSON.stringify(d.journaux).includes("example.test"));
});

test("mode store : D1 en erreur → échec (503)", async () => {
	const d = deps({
		base: {
			prepare: () => ({ bind: () => ({}) }),
			batch: async () => {
				throw new Error("D1_ERROR: no such table: contact_messages");
			},
		},
	});
	const r = await traiterContact(formulaire(), null, CONFIG, d);
	assert.equal(r.statut, "echec");
});

// --- Mode email ------------------------------------------------------------

test("mode email : message MIME envoyé par le binding, Reply-To = visiteur", async () => {
	const { envoi, messages, creerMessage } = envoiSimule();
	const r = await traiterContact(formulaire(), null, { ...CONFIG, mode: "email" }, deps({ envoi, creerMessage }));
	assert.deepEqual(r, { statut: "envoye", mode: "email" });
	assert.equal(messages.length, 1);
	const { from, to, brut } = messages[0];
	assert.equal(from, "formulaire@example.test");
	assert.equal(to, "etude@example.test");
	const h = enTetes(brut);
	assert.ok(h.includes("To: <etude@example.test>"));
	assert.ok(h.includes("Reply-To: <camille@example.test>"));
	assert.ok(h.some((l) => /^From: .+ <formulaire@example\.test>$/.test(l)));
	assert.ok(h.includes("Message-ID: <11111111-2222-3333-4444-555555555555@example.test>"));
	assert.ok(h.includes("Content-Transfer-Encoding: base64"));
	const texte = corps(brut);
	assert.match(texte, /Nom \/ Prénom : Camille Exemple/);
	assert.match(texte, /Je souhaite un rendez-vous\./);
	assert.match(texte, new RegExp(`Contact souhaité : ${CONTACTS[0]}`));
});

test("mode email : sans binding (avant la bascule DNS) → échec (503), rien n'est stocké", async () => {
	const { base, requetes } = baseSimulee();
	const r = await traiterContact(formulaire(), null, { ...CONFIG, mode: "email" }, deps({ base }));
	assert.equal(r.statut, "echec");
	assert.equal(requetes.length, 0);
});

test("mode email : erreur du binding → échec, adresse masquée dans le journal", async () => {
	const { envoi, creerMessage } = envoiSimule(true);
	const d = deps({ envoi, creerMessage });
	const r = await traiterContact(formulaire(), null, { ...CONFIG, mode: "email" }, d);
	assert.equal(r.statut, "echec");
	assert.ok(!JSON.stringify(d.journaux).includes("camille@example.test"));
});

// --- En-têtes MIME : pas d'injection -----------------------------------------

test("MIME : retours à la ligne dans le nom → aucun en-tête injecté", async () => {
	const { envoi, messages, creerMessage } = envoiSimule();
	const nom = "Camille\r\nBcc: victime@example.test\r\n\r\nCorps injecté";
	const r = await traiterContact(formulaire({ nom }), null, { ...CONFIG, mode: "email" }, deps({ envoi, creerMessage }));
	assert.equal(r.statut, "envoye");
	const h = enTetes(messages[0].brut);
	assert.ok(!h.some((l) => /^bcc:/i.test(l)), "en-tête Bcc injecté");
	// Toute ligne d'en-tête est soit un en-tête connu, soit une suite (repli).
	for (const l of h) assert.match(l, /^(From|To|Reply-To|Subject|Date|Message-ID|MIME-Version|Content-Type|Content-Transfer-Encoding): | =\?UTF-8\?B\?/);
});

test("MIME : objet avec CR/LF et caractères de contrôle, encodé en RFC 2047", () => {
	const brut = construireMime({
		from: "formulaire@example.test",
		fromNom: "Site Saccoccio & Associés",
		to: "etude@example.test",
		replyTo: "camille@example.test",
		objet: "Objet\r\nBcc: victime@example.test\u0000\u2028fin",
		texte: "Ligne 1\n.\nBcc: pas un en-tête",
		date: MAINTENANT,
		id: "abc",
	});
	const h = enTetes(brut);
	assert.equal(h.filter((l) => /^bcc:/i.test(l)).length, 0);
	assert.ok(h.includes("Date: Wed, 25 Nov 2026 10:00:00 +0000"));
	// Le corps est entièrement en base64 : rien n'y ressemble à un en-tête.
	assert.ok(!brut.split("\r\n\r\n")[1].includes("Bcc"));
	assert.equal(corps(brut), "Ligne 1\r\n.\r\nBcc: pas un en-tête");
	// L'objet décodé ne contient plus de retour à la ligne.
	const objet = h.find((l) => l.startsWith("Subject: "));
	assert.equal(objet, "Subject: Objet Bcc: victime@example.test fin");
});

test("MIME : encoded-words découpés sans couper un caractère multi-octets", () => {
	const mot = encoderMot("é".repeat(60) + " 😀");
	const morceaux = mot.split("\r\n ");
	assert.ok(morceaux.length > 1);
	let decode = "";
	for (const m of morceaux) {
		assert.ok(m.length <= 75, `mot trop long : ${m.length}`);
		const b64 = m.match(/^=\?UTF-8\?B\?(.+)\?=$/)?.[1];
		assert.ok(b64);
		decode += new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
	}
	assert.equal(decode, "é".repeat(60) + " 😀");
});

test("MIME : adresse Reply-To ou From douteuse refusée", () => {
	const base = {
		from: "formulaire@example.test",
		fromNom: "Site",
		to: "etude@example.test",
		objet: "o",
		texte: "t",
		date: MAINTENANT,
		id: "abc",
	};
	assert.throws(() => construireMime({ ...base, replyTo: "a@example.test\r\nBcc: b@example.test" }));
	assert.throws(() => construireMime({ ...base, replyTo: "a@example.test, b@example.test" }));
	assert.throws(() => construireMime({ ...base, from: "Nom <a@example.test>" }));
});
