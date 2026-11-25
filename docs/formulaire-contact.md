# Formulaire de contact

La page `/contact/` est prérendue (asset statique). Le formulaire est envoyé
en POST à `/contact/envoi/`, rendu par le Worker :

| Fichier | Rôle |
| --- | --- |
| `src/pages/contact/index.astro` | Page prérendue (coordonnées, horaires, formulaire) |
| `src/pages/contact/envoi.astro` | Traitement : redirection 303, page d'erreur ou JSON |
| `src/components/PageContact.astro`, `FormulaireContact.astro` | Mise en page et formulaire (script d'amélioration progressive) |
| `src/lib/contact.ts` | Validation, champ piège, Turnstile, stockage D1, e-mail |
| `src/lib/mime.ts` | Message MIME (en-têtes encodés, corps en base64) |
| `src/lib/contact-worker.ts` | Lecture des variables, secrets et bindings du Worker |
| `migrations/0001_contact_messages.sql` | Table du mode `store` |
| `tests/contact.test.ts`, `tests/contact-page.test.mjs` | Tests (`npm test`) |

## Configuration par environnement

| Nom | Type | local / staging | production |
| --- | --- | --- | --- |
| `CONTACT_MODE` | variable (`wrangler.jsonc`) | `store` | `email` |
| `CONTACT_TO` | variable | `saccoccio.tirand.bondil.perrot@notaires.fr` | idem |
| `CONTACT_FROM` | variable | `formulaire@saccoccio-et-associes-manosque-notaires.fr` | idem |
| `TURNSTILE_SITE_KEY` | variable (publique, lue **au build**) | clé de test `1x00000000000000000000AA` | clé de test, **à remplacer** |
| `TURNSTILE_SECRET_KEY` | **secret Cloudflare** | absent → clé de test « always passes » | à créer |
| `CONTACT_EMAIL` | binding `send_email` | aucun | **à ajouter à la bascule DNS** |

### Mode `store` (staging)

Le message est inséré dans la table D1 `contact_messages`. Chaque insertion
supprime d'abord les messages de plus de **30 jours** (même lot D1, index sur
`cree_le`) : pas de cron. **Aucune page ne lit cette table** (vérifié par
`tests/contact-page.test.mjs`). Le journal du Worker ne contient que l'issue
(`envoye`, `invalide`, `piege`…), jamais le contenu.

Pour vider la table à la main (staging), depuis l'onglet Actions ou un poste
équipé de Wrangler :
`npx wrangler d1 execute saccoccio-db-staging --remote --env staging --command "DELETE FROM contact_messages"`.

### Mode `email` (production)

Le Worker construit un e-mail texte (From = `CONTACT_FROM`, To =
`CONTACT_TO`, Reply-To = adresse du visiteur) et l'envoie par le binding
`CONTACT_EMAIL`. **Tant que ce binding n'est pas déclaré**, chaque envoi
échoue proprement : le visiteur voit « Votre message n'a pas pu être envoyé…
appelez l'étude au 04 92 70 70 70 », et rien n'est stocké. La production
n'étant pas encore publique (pas de domaine), c'est sans conséquence.

Le binding n'est **pas** dans `wrangler.jsonc` : d'après la documentation
Cloudflare, Email Routing doit être actif sur la zone et l'adresse de
destination vérifiée **avant** de lier une adresse à un Worker. Le DNS du
domaine étant encore chez OVH, la zone n'existe pas chez Cloudflare : on
n'ajoute le binding qu'à la bascule (le `--dry-run` de la CI ne contacte pas
l'API et ne peut pas détecter ce refus).

## À faire par le propriétaire du dépôt

### 1. Créer le widget Turnstile (maintenant)

1. Tableau de bord Cloudflare, compte de l'étude → **Turnstile** →
   **Add widget**.
2. Nom : `saccoccio-contact`. Hostnames :
   `saccoccio-staging.lcollin.workers.dev`,
   `saccoccio-prod.lcollin.workers.dev`, et, à la bascule,
   `saccoccio-et-associes-manosque-notaires.fr` et
   `www.saccoccio-et-associes-manosque-notaires.fr`. Mode : **Managed**.
   (Un widget par environnement est possible ; un seul suffit.)
3. Copier la **clé de site** (publique) et la **clé secrète**.
4. **Clé de site** : la mettre dans `wrangler.jsonc`, `env.production.vars.TURNSTILE_SITE_KEY`
   (et `env.staging` si l'on veut tester le vrai widget en staging), par une
   PR. Elle est lue au build : la page n'est à jour qu'après le déploiement.
5. **Clé secrète** : Cloudflare → **Workers & Pages** → `saccoccio-prod` →
   **Settings** → **Variables and Secrets** → **Add** → type **Secret**, nom
   `TURNSTILE_SECRET_KEY`. Même chose sur `saccoccio-staging` si sa clé de
   site a été changée. Les secrets sont conservés d'un `wrangler deploy` à
   l'autre : aucun workflow à modifier, rien dans GitHub.

⚠️ La clé de site et la clé secrète vont **ensemble** : clé de test + secret
absent, ou vraie clé + vrai secret. Un mélange fait échouer toutes les
vérifications (« La vérification anti-spam a échoué »). Avec une vraie clé, le
Worker vérifie aussi que le jeton vient du widget `contact`.

### 2. À la bascule DNS (domaine chez Cloudflare)

1. **Activer Email Routing** sur la zone
   `saccoccio-et-associes-manosque-notaires.fr` : Cloudflare → la zone →
   **Email** → **Email Routing** → **Enable** ; accepter l'ajout des
   enregistrements MX et SPF proposés (le domaine n'a pas de messagerie
   aujourd'hui, il n'y a donc pas de MX existant à préserver).
2. **Adresse de destination** : Email Routing → **Destination addresses** →
   ajouter `saccoccio.tirand.bondil.perrot@notaires.fr`. **L'étude reçoit un
   e-mail de Cloudflare et doit cliquer sur le lien de vérification.** Tant
   qu'elle ne l'a pas fait, l'envoi est refusé.
3. **Ajouter le binding** par une PR, dans `env.production` de `wrangler.jsonc` :

   ```jsonc
   "send_email": [
   	{
   		"name": "CONTACT_EMAIL",
   		"destination_address": "saccoccio.tirand.bondil.perrot@notaires.fr"
   	}
   ],
   ```

   puis retirer le test « binding pas encore déclaré » de
   `tests/contact-page.test.mjs`. Merger, taguer. Si le déploiement de
   production refuse le binding, vérifier les étapes 1 et 2 (Email Routing
   actif, adresse vérifiée).
4. **Tester** : envoyer un message depuis le site et vérifier sa réception
   par l'étude (expéditeur `formulaire@…`, « Répondre » vise le visiteur).
5. Facultatif : passer staging en `email` aussi (même binding dans
   `env.staging`), ou le laisser en `store`.

## Sans JavaScript

Le formulaire est un POST classique : succès → redirection 303 vers
`/contact/?envoye=1#message-envoye` (le message s'affiche grâce à `:target`) ;
erreur → la page est réaffichée par le Worker avec les messages et les champs
conservés. Seule limite : Turnstile ne fonctionne qu'avec JavaScript. Un
navigateur sans JavaScript voit donc un avertissement (`<noscript>`) avec le
téléphone et l'adresse e-mail de l'étude, et l'envoi est refusé.
