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
- design et contenus repris à l'identique de l'ancien site (34 pages
  éditoriales importées, prérendues ; 3 anciennes pages deviennent de simples
  redirections) ;
- simulateur de prêt conservé (PR ultérieure) ;
- nouvelles URLs optimisées pour le SEO, avec redirections 301 depuis les
  anciennes (`src/lib/redirections.ts`, d'après `urls.csv` du kit) ;
- **pas de back-office pour l'instant** ;
- annonces immobilières Immonot importées depuis un XML, par différence
  (`scripts/import-annonces.mjs`, workflow `import-annonces.yml`, voir
  `docs/annonces.md`). Leurs photos restent hébergées chez Immonot et ne vont
  **pas** dans R2. La source nocturne (Worker programmé) viendra quand Immonot
  aura indiqué où déposer le fichier.

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
| `scripts/emdash-migrate.mjs` | Migrations du schéma EmDash en déploiement (cible vérifiée, verrou) |
| `scripts/smoke-test.sh` | Smoke test après déploiement (dont 503 différé) |
| `src/live.config.ts` | Chargeur EmDash (ne pas modifier) |
| `migrations/` | Migrations D1 du projet |
| `src/layouts/Base.astro` | Gabarit commun (`<head>`, polices, en-tête, pied de page) |
| `src/components/` | En-tête, pied de page, carrousel, pictogrammes, carte d'annonce, formulaire… |
| `src/data/site.ts` | Infos publiques de l'étude, menu, liens du pied de page, photos du bandeau |
| `src/styles/global.css` | Variables (couleurs, polices, grille) et styles de base |
| `src/demo/design.astro` | Page de démonstration du gabarit, `/_design/` (noindex) |
| `scripts/optimize-images.mjs` | Conversion des images de design en WebP (`public/images/`) |
| `reference/design-kit/` | Kit de l'ancien site : captures (référence visuelle), HTML, images originales |
| `reference/contenus-kit/` | Kit de contenus : `pages/*.html` (source des 34 pages), `pages.json`, `urls.csv`, images originales |
| `src/pages/[...chemin].astro` | Pages éditoriales, **prérendues** au build (une par fiche reprise de `pages.json`) |
| `src/data/pages.ts` | Liste des pages (d'après `pages.json`), fil d'Ariane par rubrique |
| `src/lib/contenu.ts` | Préparation du HTML du kit au build (images, équipe sans photo, ancres) |
| `src/layouts/Contenu.astro` | Gabarit des pages de contenu (carrousel, fil d'Ariane, sections) |
| `src/lib/redirections.ts` | Redirections 301 des anciennes URL (appelé par `gate.ts`) |
| `src/lib/seo.ts` | SEO : longueurs des title / description, URL canoniques (`URL_SITE`), JSON-LD (Notary, BreadcrumbList) |
| `src/lib/pages-contenu.ts` | Sources HTML des pages éditoriales et leurs meta descriptions uniques (build) |
| `src/pages/plan-du-site.astro`, `src/pages/sitemap.xml.ts` | Plan du site (prérendu) et sitemap (remplace celui d'EmDash) |
| `src/pages/contact/`, `src/components/PageContact.astro` | Page Contact (prérendue) et traitement du formulaire (`/contact/envoi/`, Worker) |
| `src/lib/contact.ts`, `src/lib/mime.ts`, `src/lib/contact-worker.ts` | Formulaire : validation, anti-spam, stockage D1 ou e-mail (voir `docs/formulaire-contact.md`) |
| `src/pages/politique-de-confidentialite.astro` | Politique de confidentialité (prérendue, à valider par l'étude) |
| `docs/` | Documentation d'exploitation (formulaire de contact, Turnstile, Email Routing) |
| `public/documents/` | Les 58 PDF (« La lettre de mon notaire », mentions légales), assets statiques |
| `src/pages/annonces/` | Liste `/annonces/` et fiches `/annonces/<slug>/` (Worker, une requête D1 au plus) |
| `src/lib/annonces*.ts` | Annonces : formats et slugs (`annonces.ts`, partagé avec l'import), lecture D1 en cache 60 s, recherche, fiche |
| `src/components/RechercheAnnonces.astro`, `EtiquetteDpe.astro` | Formulaire « Rechercher un logement », étiquettes DPE / GES en CSS |
| `src/data/communes.ts` | Centre des communes (carte à l'échelle de la commune) |
| `scripts/import-annonces.mjs`, `scripts/annonces/` | Import du flux Immonot : XML, normalisation, différence, SQL, sources |
| `reference/annonces-kit/` | Kit annonces : 3 flux XML anonymisés et leur README (format, libellés) |
| `tests/` | `npm test` après un build : pages, redirections, bundle du Worker, import et rendu des annonces |

## Design

Le design de l'ancien site est reproduit **à l'identique** : la référence
visuelle est `reference/design-kit/captures/` (bureau 1280 px, mobile
390 px). `reference/rendu/` contient les captures du nouveau rendu au moment
de la PR « design ». Les fichiers du thème d'origine (probablement
commercial) ne doivent **pas** être récupérés ni versionnés.

### Conventions CSS

- **Notre propre CSS**, sans Bootstrap, jQuery ni Font Awesome.
- Les couleurs, polices et la grille sont des **variables** dans
  `src/styles/global.css` (`--c-bordeaux`, `--c-bandeau`, `--f-texte`,
  `--conteneur`…) : ne pas écrire de couleur en dur dans un composant
  quand une variable existe.
- `global.css` ne contient que la base (typographie, `.conteneur`,
  `.grille`, `.section`, `.btn`, `.btn-primaire`, `.champ`, `.sr-only`).
  Le reste va dans le `<style>` du composant ou de la page (portée Astro ;
  `:global(...)` pour cibler un composant enfant, comme `.icone`).
- Grille Bootstrap 3 reproduite : conteneur de 750 / 970 / 1170 px à partir
  de 768 / 992 / 1200 px, gouttière de 30 px ; menu « burger » sous 768 px.
  Mise en page en CSS grid/flex.
- Noms de classes en français, sans préfixe (`.bandeau`, `.pied-liens`…).
- Polices **auto-hébergées** via `@fontsource` (sous-ensemble **latin**
  uniquement : `@fontsource/raleway/latin-400.css`, etc.) : Raleway 400/700
  (texte), Lato 400/700 (menu, annonces). **Jamais de Google Fonts** (RGPD).
  Rochester n'est pas utilisée.
- Pictogrammes : SVG en ligne via `src/components/Icone.astro` (tracés
  Material Icons, Apache 2.0). Ajouter un tracé plutôt qu'une bibliothèque.
- JavaScript : le moins possible. Le carrousel est en CSS pur ; seul le
  menu mobile a quelques lignes de JS (sans JS, le menu reste déplié).
  Respecter `prefers-reduced-motion`.
- Accessibilité : `lang="fr"`, `alt` sur chaque image, navigation au
  clavier (sous-menus ouverts au `:focus-within`), lien d'évitement,
  `<title>` et meta description propres à chaque page (props de `Base`).
- Aucun traceur (ni Google Analytics, ni Google Maps).

### Images

- Les images de design sont des **assets statiques** du Worker, dans
  `public/images/`, au format **WebP**. Elles ne vont **pas** dans R2 et ne
  comptent pas dans la taille du Worker.
- Elles sont produites par `node scripts/optimize-images.mjs` (devDependency
  `sharp`) à partir des originaux de `reference/design-kit/images/` :
  redimensionnées à **2 × leur taille d'affichage au maximum**, jamais
  agrandies. Pour en ajouter une : déposer l'original dans `reference/`,
  l'ajouter à la table `IMAGES` du script, relancer le script et versionner
  le WebP produit. Ne pas versionner d'originaux ailleurs que dans
  `reference/`.
- Les SVG vectoriels restent en SVG. Exception : le logo « Notaire conseil
  en stratégie » était un SVG qui n'embarquait qu'un PNG de 1856 px ; le
  script en extrait un WebP de 300 px.
- Toujours renseigner `width` et `height` (pas de décalage au chargement)
  et `loading="lazy"` sous la ligne de flottaison.
- Les photos des annonces restent chez Immonot (URL distantes).
- `public/favicon.ico` vient du kit.

### Pages éditoriales (prérendues)

Les 34 pages de `reference/contenus-kit/pages.json` (hors statuts « non
reprise » et « redirection seule ») sont **prérendues** au build
(`export const prerender = true`) : fichiers HTML servis comme assets
statiques, sans code ni contenu dans le Worker, sans D1 et sans CPU par
requête. Le HTML du kit est la source : il n'est pas réécrit. Au build,
`src/lib/contenu.ts` ne fait que remplacer les images (liste blanche
`IMAGES_CONTENU`, WebP), retirer **toute photo de personne** (l'équipe est
affichée en noms et fonctions), retirer les liens neutralisés du panier et
poser les ancres du lexique. Une correction de texte se fait dans
`reference/contenus-kit/pages/*.html`.

- Les assets statiques ne passent **pas** par le middleware : hors
  production, le `noindex` est assuré par la meta robots de `Base.astro`
  (SITE_ENV connu au build) et par un `X-Robots-Tag` ajouté au `_headers`
  (intégration `noindexAssetsHorsProduction` d'`astro.config.mjs`).
- Le middleware d'EmDash s'exécute aussi pendant le prérendu, sur la D1
  **locale et vide** du build : en mode « check », il écrirait la page 503
  à la place du contenu. `astro.config.mjs` force donc
  `EMDASH_MIGRATIONS_MODE = "auto"` dans l'environnement Vite `prerender`
  **seulement** (la D1 locale du build est migrée, rien de distant).
  `tests/worker.test.mjs` vérifie que le Worker déployé n'en hérite pas.
- Menu (`NAVIGATION`) : celui de l'ancien site. Les pages `/conseils/*`,
  Situation géographique, Coordonnées et Plans d'accès sont hors menu
  (comme sur l'ancien site, ou à valider avec l'étude) mais figurent dans
  `/plan-du-site/` et `sitemap.xml`.
- `/simulateur-pret/` est liée mais pas encore créée (404 attendu jusqu'à
  sa PR). `/annonces/` est rendue par le Worker (voir « Annonces »).

### SEO

Voir `src/lib/seo.ts`, `src/layouts/Base.astro` et `tests/seo.test.mjs`.

- `URL_SITE` (`src/data/site.ts`) : domaine de **production**, base des
  canonical, d'Open Graph, du JSON-LD, du sitemap et de la ligne `Sitemap:`
  de `robots.txt`, dans tous les environnements.
- Chaque page indexable a un `<title>` (≤ 60 caractères) et une meta
  description (≤ 155) **uniques**, une canonical absolue, Open Graph et
  Twitter (`fr_FR`, image par défaut `IMAGE_PARTAGE`), un seul `<h1>`, un
  `alt` sur chaque image. Les fiches d'annonces construisent les leurs à
  partir du type, de la commune, de la surface, du prix et de la référence.
- JSON-LD en un seul graphe par page : `WebSite`, `Notary` (Manosque et ses
  annexes de Gréoux-les-Bains et Valensole, d'après `SITES`),
  `BreadcrumbList`, et `RealEstateListing` + `Offer` sur les fiches (prix,
  commune, code postal ; **jamais** d'adresse ni de coordonnées).
- Liste des annonces : `/annonces/` (jamais `?page=1`), pages suivantes
  canoniques vers elles-mêmes ; une recherche filtrée est en
  `noindex, follow`.
- `sitemap.xml` (Worker) : URL canoniques, annonces actives de D1 avec
  `lastmod` ; XML gardé avec le catalogue en cache 60 s (une requête D1 au
  plus).

### Formulaire de contact

Voir `docs/formulaire-contact.md`. `/contact/` est prérendue ; le POST va à
`/contact/envoi/` (Worker). Anti-spam : Turnstile (secret
`TURNSTILE_SECRET_KEY` sur le Worker, clés de test s'il est absent), champ
piège, limites de taille. `CONTACT_MODE` : `store` en staging (table D1
`contact_messages`, purgée à 30 jours à chaque insertion, **jamais
affichée**), `email` en production via le binding `send_email`
`CONTACT_EMAIL`, **ajouté seulement à la bascule DNS** (Email Routing actif
et adresse de l'étude vérifiée). MIME construit à la main (`src/lib/mime.ts`,
pas de dépendance).

### Annonces immobilières

Voir `docs/annonces.md`. Table D1 `annonces` (`migrations/0002_annonces.sql`),
alimentée par `scripts/import-annonces.mjs` (workflow `import-annonces.yml`,
lancé à la main pour l'instant ; production depuis un tag `v*`, avec
approbation). **Jamais** d'`<Adresse>` ni de coordonnées plus précises que la
commune ; le négociateur (nom, téléphone, e-mail du flux) est affiché.
Garde-fous de l'import : flux absent, vide, invalide ou < 50 % des annonces
actives → rien n'est modifié. Les pages lisent un catalogue en une requête
D1 (`batch`), gardé 60 s dans l'isolat. Annonce retirée : 410.

### Redirections 301

`src/middleware/gate.ts` redirige les anciennes URL (`product_info.php`,
`*-p-N.html`, `index.php?cPath=`, `*-c-N.html`, `allprods.php`,
`contact_us.php`, `CalcAmortEuR2.htm`) **avant** EmDash, d'après
`reference/contenus-kit/urls.csv` (aucune destination ajoutée à la main ; un
`products_id` inconnu est une annonce → `/annonces/`). Seuls les chemins en
`.php`, `.html` ou `.htm` sont examinés.

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
fait environ 2,44 Mo (les pages prérendues et les PDF n'y comptent pas) (l'admin EmDash n'est livré qu'en français pour cela :
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

- `import-annonces.yml` — manuel (`workflow_dispatch`) ou
  `repository_dispatch` : import des annonces d'un fichier du kit dans la D1
  de l'environnement choisi (voir `docs/annonces.md`) ;
- `ci.yml` — chaque PR : typecheck, build et `wrangler deploy --dry-run`
  pour les deux environnements, contrôle de la taille du Worker, `npm test` ;
- `deploy-staging.yml` — push sur `main` (ou « Run workflow ») : build,
  migrations EmDash, migrations du projet, déploiement,
  `emdash migrate --check`, smoke test (`scripts/smoke-test.sh`). Entrée
  facultative `take_over_lock_id` (voir « Verrou de migration ») ;
- `deploy-production.yml` — tag `v*` : sauvegarde chiffrée de la D1,
  migrations EmDash, migrations du projet, déploiement,
  `emdash migrate --check`, smoke test.

Le smoke test vérifie la page d'accueil, puis la redemande 3 fois à 20 s
d'intervalle : un 503 (migrations en attente, verrou bloqué) fait échouer
le job, même s'il apparaît après un premier 200.

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
  `_emdash_*`, …). Ne pas écrire de migration sur ces tables.
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

### Migrations du schéma EmDash

Le Worker **n'applique plus** les migrations EmDash :
`migrations: { runtime: "check", dev: "auto" }` dans `astro.config.mjs`.
En `auto`, la première requête créait environ 90 tables ; sur le plan gratuit
(10 ms de CPU par requête), le Worker était coupé en pleine migration et
laissait un verrou, d'où un 503 permanent (« Database migrations are
required… »). En `check`, le Worker fait une seule requête de statut et
répond 503 tant que des migrations manquent. `npm run dev` reste en `auto`.
La variable `EMDASH_MIGRATIONS_MODE` remplacerait ce réglage : ne pas la
définir sur les environnements déployés.

Les workflows appliquent les migrations avec `scripts/emdash-migrate.mjs`,
après le build (qui écrit `.emdash/migrations.json`) et **avant**
`wrangler deploy` :

1. `emdash migrate --status --json --wrangler-config wrangler.jsonc --wrangler-env <env>` ;
2. vérification que la cible est **exactement** la D1 attendue : nom et UUID
   écrits en dur dans le workflow (`EXPECTED_D1_NAME`, `EXPECTED_D1_ID`),
   identiques à `wrangler.jsonc`, au compte et à l'environnement rapportés
   par EmDash, et fingerprint recalculé par le script
   (SHA-256 de `{"kind":"d1","identity":[compte, uuid]}`) ;
3. `emdash migrate --expected-target-fingerprint <fp> …` s'il y a des
   migrations en attente (le fingerprint n'est donc jamais saisi à la main) ;
4. après le déploiement : `emdash migrate --check` (code 2 : migrations en
   attente, code 3 : base migrée par une version plus récente d'EmDash).

Le job échoue sans rien écrire si la cible diffère, si la base contient des
migrations inconnues (retour à une version plus ancienne d'EmDash), ou si un
verrou est tenu (voir ci-dessous). Les identifiants sont lus uniquement dans
`CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.

Avant une mise à jour d'EmDash, relire
https://docs.emdashcms.com/deployment/updating/ (certaines migrations, comme
`095_plugin_storage_unique_scope`, ont des contraintes avec du trafic réel).

### Verrou de migration

Une migration interrompue laisse un verrou dans `_emdash_migrations_lock`.
L'étape « Migrations EmDash » affiche alors
`Verrou de migration : tenu depuis … (… min), id <id>`.

- **staging** : un verrou de plus de 15 minutes est repris automatiquement
  (`emdash migrate --take-over-lock <id>`, qui applique ensuite les
  migrations en attente). Pour un verrou plus récent, attendre ou relancer
  `deploy-staging` depuis l'onglet Actions (« Run workflow », branche
  `main`) avec `take_over_lock_id` = l'id affiché. Un id qui ne correspond
  plus au verrou actuel est refusé.
- **production** : le workflow ne reprend **jamais** un verrou ; il échoue
  avec l'id, avant toute migration et tout déploiement. Vérifier d'abord
  qu'aucune migration ne tourne et que la base est cohérente (sauvegarde du
  run), puis décider avec le propriétaire du dépôt.

Les migrations EmDash sur D1 ne sont pas transactionnelles : une migration
coupée en plein milieu peut être partiellement appliquée.

## Commandes

```bash
npm ci                               # installer (versions du package-lock)
npm run dev                          # serveur de dev Astro (local)
npm run typecheck                    # wrangler types + astro check
CLOUDFLARE_ENV=staging npm run build # build pour un environnement
npm test                             # tests (après un build)
npx wrangler deploy --dry-run --env staging
```

## Documentation de référence

- EmDash sur Workers : https://developers.cloudflare.com/workers/framework-guides/web-apps/emdash/
- Documentation EmDash : https://docs.emdashcms.com/
- Astro sur Cloudflare : https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Wrangler (configuration, environnements) : https://developers.cloudflare.com/workers/wrangler/configuration/

EmDash est un projet récent : vérifier les API dans la documentation à jour
plutôt que de se fier à sa mémoire.
