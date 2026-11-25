// Compléments au type Env généré par `wrangler types` (worker-configuration.d.ts) :
// secret et binding qui ne figurent pas (ou pas encore) dans wrangler.jsonc.
declare namespace Cloudflare {
	interface Env {
		/** Secret Turnstile (Cloudflare) ; absent → clé de test « always passes ». */
		TURNSTILE_SECRET_KEY?: string;
		/** Binding send_email (Email Routing), déclaré à la bascule DNS. */
		CONTACT_EMAIL?: SendEmail;
	}
}
