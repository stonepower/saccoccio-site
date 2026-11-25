/**
 * Branchement du formulaire de contact sur le Worker : lit la configuration
 * (variables de wrangler.jsonc, secret TURNSTILE_SECRET_KEY, bindings DB et
 * CONTACT_EMAIL) et appelle `traiterContact` (src/lib/contact.ts).
 *
 * Variables (wrangler.jsonc, par environnement) :
 * - CONTACT_MODE : "store" (D1, purge à 30 jours) ou "email" (Email Routing) ;
 * - CONTACT_TO, CONTACT_FROM : destinataire et expéditeur ;
 * - TURNSTILE_SITE_KEY : clé publique du widget (lue au build par la page).
 * Secret (Cloudflare, facultatif) : TURNSTILE_SECRET_KEY ; absent → clé de
 * test « always passes ».
 * Binding (production, après la bascule DNS) : CONTACT_EMAIL (send_email).
 * Voir docs/formulaire-contact.md.
 */
import { EmailMessage } from "cloudflare:email";
import { env } from "cloudflare:workers";
import { LIMITES, type Resultat, traiterContact, valeursVides } from "./contact";

export async function traiterRequeteContact(requete: Request): Promise<Resultat> {
	const journal = (evenement: Record<string, string | number | boolean>) => console.log(JSON.stringify(evenement));

	// Corps trop gros : refusé avant toute lecture.
	const taille = Number(requete.headers.get("Content-Length") ?? "0");
	if (taille > LIMITES.requete) {
		journal({ evenement: "contact", issue: "trop-gros" });
		return { statut: "invalide", valeurs: valeursVides(), erreurs: { message: "Votre envoi est trop volumineux." } };
	}
	let form: FormData;
	try {
		form = await requete.formData();
	} catch {
		journal({ evenement: "contact", issue: "corps-illisible" });
		return { statut: "invalide", valeurs: valeursVides(), erreurs: { message: "Formulaire illisible : réessayez." } };
	}

	const mode = env.CONTACT_MODE === "email" ? "email" : "store";
	if (!env.TURNSTILE_SECRET_KEY && env.SITE_ENV === "production") {
		journal({ evenement: "contact", alerte: "TURNSTILE_SECRET_KEY absent : clé de test utilisée" });
	}
	return traiterContact(
		form,
		requete.headers.get("CF-Connecting-IP"),
		{ mode, to: env.CONTACT_TO, from: env.CONTACT_FROM, turnstileSecret: env.TURNSTILE_SECRET_KEY },
		{
			fetch: (...args) => fetch(...args),
			maintenant: () => new Date(),
			id: () => crypto.randomUUID(),
			base: env.DB,
			envoi: env.CONTACT_EMAIL,
			creerMessage: (from, to, brut) => new EmailMessage(from, to, brut),
			journal,
		},
	);
}
