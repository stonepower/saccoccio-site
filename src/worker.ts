/**
 * Point d'entrée du Worker (repris du template officiel EmDash pour Cloudflare).
 *
 * Le handler `scheduled` sert à la publication programmée d'EmDash. Aucun
 * Cron Trigger n'est déclaré pour l'instant dans wrangler.jsonc (pas de
 * back-office, et le plan gratuit limite le nombre de crons par compte) :
 * le handler est exporté mais jamais appelé.
 */
import handler, {
	createScheduledHandler,
	EmDashRoom,
	EmDashRoomSite,
	PluginBridge,
} from "@emdash-cms/cloudflare/worker";

export { EmDashRoom, EmDashRoomSite, PluginBridge };

export default {
	...handler,
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
