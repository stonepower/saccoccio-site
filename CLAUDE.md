# CLAUDE.md — site de l'étude Saccoccio & Associés (Manosque)

Ce fichier décrit le projet et les règles à respecter. **Tout est rédigé en
français** : code commenté, messages de commit, descriptions de PR et
contenus du site.

## Contexte

Refonte de `saccoccio-et-associes-manosque-notaires.fr`, un ancien site
osCommerce (PHP 7.2) piraté puis sécurisé en urgence. Le nouveau site est
entièrement en français.

Décisions déjà prises (ne pas les remettre en cause sans l'accord du
propriétaire du dépôt) :

- français uniquement ;
- design et contenus repris à l'identique de l'ancien site (39 pages,
  importées dans une PR ultérieure) ;
- simulateur de prêt conservé (PR ultérieure) ;
- nouvelles URLs optimisées pour le SEO, avec redirections 301 depuis les
  anciennes (PR ultérieure) ;
- **pas de back-office pour l'instant** ;
- annonces immobilières Immonot importées chaque nuit depuis un XML (PR
  ultérieure). Leurs photos restent hébergées chez Immonot et ne vont **pas**
  dans R2.

## Stack

- [Astro](https://docs.astro.build/) 7 en rendu serveur (`output: "server"`),
  adaptateur `@astrojs/cloudflare` ;
- [EmDash](https://docs.emdashcms.com/) (CMS de Cloudflare pour Astro),
  intégration `emdash/astro` + `@emdash-cms/cloudflare` ;
- Cloudflare Workers (plan gratuit) avec D1 (contenu), R2 (médias) et KV
  (cache et sessions Astro) ;
- TypeScript strict (`astro/tsconfigs/strict`), Node 24 LTS (voir `.nvmrc`),
  npm (`package-lock.json`). Toutes les versions sont **épinglées** dans
  `package.json`.

Fichiers clés :

| Fichier | Rôle |
| --- | --- |
| `astro.config.mjs` | Astro + adaptateur Cloudflare + intégration EmDash |
| `wrangler.jsonc` | Workers, bindings, environnements `staging` et `production` |
| `src/worker.ts` | Point d'entrée du Worker (template officiel EmDash) |
| `src/middleware/gate.ts` | Verrou `/_emdash/*` et `X-Robots-Tag` hors production |
| `src/pages/robots.txt.ts` | `robots.txt` selon l'environnement |
| `src/live.config.ts` | Chargeur EmDash (ne pas modifier) |
| `migrations/` | Migrations D1 du projet |

### Back-office EmDash fermé

Il n'y a pas d'option EmDash pour retirer l'admin. Le middleware
`src/middleware/gate.ts` (branché via `middleware.outer`, il s'exécute avant
EmDash) répond **404 sur tout `/_emdash/*`** (admin, assistant d'installation,
API, MCP) tant que la variable `EMDASH_ADMIN_ENABLED` ne vaut pas `"true"`.
Elle vaut `"false"` en staging et en production.

⚠️ Avec EmDash, **la première personne qui termine l'assistant
`/_emdash/admin/setup` devient administratrice**. Ne jamais passer
`EMDASH_ADMIN_ENABLED` à `"true"` sur un environnement déployé sans avoir
prévu de faire l'installation immédiatement (ou sans protection en amont,
par ex. Cloudflare Access). Le serveur MCP et les polices Google sont
également désactivés.

### Limite de taille du Worker

Le plan gratuit limite un Worker à **3 Mo compressés**. Le bundle actuel
fait environ 2,4 Mo (l'admin EmDash n'est livré qu'en français pour cela :
`admin.locales: ["fr"]`). Surveiller la ligne `Total Upload … gzip:` du
`wrangler deploy --dry-run` de la CI à chaque ajout de dépendance.

## Environnements

| Environnement | Worker | URL | Indexation |
| --- | --- | --- | --- |
| staging | `saccoccio-staging` | https://saccoccio-staging.lcollin.workers.dev | **non** (`X-Robots-Tag: noindex`, `robots.txt` en `Disallow: /`) |
| production | `saccoccio-prod` | https://saccoccio-prod.lcollin.workers.dev | oui |

Aucune route de domaine pour l'instant (`workers_dev` uniquement).

La configuration de premier niveau de `wrangler.jsonc` (`saccoccio-local`)
sert **uniquement au développement local**. Ne jamais lancer
`wrangler deploy` sans `--env`.

L'environnement est choisi **au moment du build** :
`CLOUDFLARE_ENV=staging npm run build`, puis
`npx wrangler deploy --env staging`. Wrangler refuse un `--env` différent de
celui du build (garde-fou utile).

## Ressources Cloudflare

Compte « Lcollin＠stonepower.fr's Account », ID
`33ea8f3fceadead883be73978a4450a5`. Plan gratuit. Toutes les ressources
sont déjà créées : **ne pas les recréer**.

| Ressource | staging | production |
| --- | --- | --- |
| D1 (`DB`) | `saccoccio-db-staging` — `cc9d552e-65cf-46b6-af5c-e98426505cc4` | `saccoccio-db-prod` — `32fd88c5-38e1-4498-97bc-661dd4c1a3f6` |
| KV (`CACHE`) | `saccoccio-cache-staging` — `27394cd344784462a26ec2a090b66f37` | `saccoccio-cache-prod` — `e42be39228ab49478e2f6c2c593e62d2` |
| R2 (`MEDIA`) | `saccoccio-media-staging` | `saccoccio-media-prod` |

D1 et R2 sont en WEUR. Sous-domaine workers.dev du compte : `lcollin.workers.dev`.

### ⛔ Ne pas toucher au reste du compte

Ce compte Cloudflare héberge **d'autres sites clients**. Interdit :

- de modifier, supprimer ou créer d'autres Workers, bases D1, namespaces KV,
  buckets R2, zones ou routes que ceux listés ci-dessus ;
- de modifier le sous-domaine workers.dev `lcollin.workers.dev` (d'autres
  Workers en dépendent) ;
- d'ajouter des bindings qui provoqueraient la création automatique de
  ressources par Wrangler (par ex. un KV `SESSION` : les sessions Astro
  utilisent volontairement `CACHE`), ou des Cron Triggers sans en parler
  (le plan gratuit en limite le nombre **par compte**).

## Flux de travail

1. Créer une branche depuis `main` (`feat/…`, `fix/…`, `chore/…`, `ci/…`).
2. Ouvrir une pull request (rédigée en français). La CI vérifie le typecheck,
   le build et un `wrangler deploy --dry-run` pour chaque environnement.
3. Le propriétaire du dépôt relit et **merge lui-même** dans `main`
   (branche protégée, PR obligatoire).
4. Le merge sur `main` **déploie automatiquement staging** (environnement
   GitHub `staging`).
5. Un tag `v*` (par ex. `v0.1.0`) déclenche le déploiement de **production**,
   qui attend l'**approbation** de stonepower dans l'onglet Actions
   (environnement GitHub `production`). Une sauvegarde de la D1 de production
   est exportée avant chaque migration.

Rien n'est installé sur le Mac du propriétaire : tout passe par GitHub
(PR + Actions) et Cloudflare. Les secrets et variables sont dans les
environnements GitHub :

| Nom | Type | Environnements | Rôle |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | staging, production | Wrangler (Workers, D1, KV, R2) |
| `CLOUDFLARE_ACCOUNT_ID` | variable | staging, production | ID du compte Cloudflare |
| `D1_BACKUP_PASSPHRASE` | secret | production | chiffrement GPG des sauvegardes D1 |

Workflows (`.github/workflows/`) :

- `ci.yml` — chaque PR : typecheck, build et `wrangler deploy --dry-run`
  pour les deux environnements, contrôle de la taille du Worker ;
- `deploy-staging.yml` — push sur `main` : build, migrations, déploiement,
  smoke test (`scripts/smoke-test.sh`) ;
- `deploy-production.yml` — tag `v*` : sauvegarde chiffrée de la D1,
  migrations, déploiement, smoke test.

### Sauvegardes de la D1 de production

Le dépôt étant public, les artefacts sont téléchargeables par n'importe quel
compte GitHub : la sauvegarde est donc **chiffrée** (`*.sql.gpg`, conservée
30 jours). Elle est au format `sqlite3 .dump`, car les tables virtuelles
FTS5 d'EmDash empêchent l'export au format D1. Pour la lire :
`gpg -d fichier.sql.gpg > dump.sql`, puis `sqlite3 restauration.db < dump.sql`.
Le signet D1 Time Travel du moment est joint : il permet aussi
`npx wrangler d1 time-travel restore saccoccio-db-prod --bookmark=… --env production`.

### 🚫 Ne jamais merger

Un agent (Claude ou autre) **ne merge jamais** une PR, n'approuve jamais un
déploiement de production, ne pousse jamais directement sur `main` et ne crée
pas de tag de release sans demande explicite. Il ouvre la PR et s'arrête là.

## Données personnelles

L'ancien site et ses sauvegardes contiennent des **données personnelles**
(clients, formulaires, comptes osCommerce). Ils ne doivent **JAMAIS** être
versionnés, même temporairement, même dans une branche :

- `website/`, `*.sql`, `*.tar.gz`, `*.zip`, `.env*`, `.dev.vars` sont dans
  `.gitignore` — ne pas retirer ces lignes ;
- seule exception : `migrations/*.sql`, qui ne doit contenir **que du
  schéma**, jamais de données ;
- ne jamais copier de données réelles dans le code, les fixtures, les tests,
  les issues ou les descriptions de PR ;
- le dépôt est **public**.

## Migrations D1

- EmDash gère **lui-même** son schéma (tables `options`, `users`,
  `_emdash_*`, …) : il applique ses migrations au démarrage du Worker
  (`migrations.runtime: "auto"`). Ne pas écrire de migration sur ces tables.
- Le dossier `migrations/` (déclaré via `migrations_dir` dans
  `wrangler.jsonc`) est réservé à **nos** tables (par ex. annonces Immonot).
- Créer une migration :
  `npx wrangler d1 migrations create saccoccio-db-staging nom_de_la_migration`
  → `migrations/NNNN_nom_de_la_migration.sql`.
- Tester en local : `npx wrangler d1 migrations apply saccoccio-db-staging --local`.
- Les workflows appliquent les migrations avant chaque déploiement :
  `npx wrangler d1 migrations apply saccoccio-db-staging --remote --env staging`
  (staging) et l'équivalent sur `saccoccio-db-prod` (production, après une
  sauvegarde exportée en artefact).
- Une migration appliquée ne se modifie jamais : on en écrit une nouvelle.
  Les migrations doivent être compatibles avec la version précédente du code
  (le déploiement suit la migration).

## Commandes

```bash
npm ci                               # installer (versions du package-lock)
npm run dev                          # serveur de dev Astro (local)
npm run typecheck                    # wrangler types + astro check
CLOUDFLARE_ENV=staging npm run build # build pour un environnement
npx wrangler deploy --dry-run --env staging
```

## Documentation de référence

- EmDash sur Workers : https://developers.cloudflare.com/workers/framework-guides/web-apps/emdash/
- Documentation EmDash : https://docs.emdashcms.com/
- Astro sur Cloudflare : https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Wrangler (configuration, environnements) : https://developers.cloudflare.com/workers/wrangler/configuration/

EmDash est un projet récent : vérifier les API dans la documentation à jour
plutôt que de se fier à sa mémoire.
