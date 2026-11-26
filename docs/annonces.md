# Annonces immobilières (flux Immonot)

Les annonces viennent du flux XML qu'Immonot produit chaque nuit pour l'étude
(format décrit dans `reference/annonces-kit/README.md`). Elles sont importées
dans la D1 (table `annonces`) puis affichées par le Worker.

## Vue d'ensemble

```
Immonot ──(dépôt du XML : source à définir)──▶ GitHub Action « import-annonces »
                                                 │  scripts/import-annonces.mjs
                                                 ▼
                                        D1 : table annonces
                                                 │  1 requête (cache 60 s)
                                                 ▼
                          Worker : /annonces/, /annonces/<slug>/, sitemap.xml
```

- **Photos** : jamais copiées. Les fiches pointent vers
  `https://photos.immonotpro.com/…` (le flux donne des URL en `http`, l'import
  les passe en `https`). Elles ne vont pas dans R2.
- **Vie privée** : `<Adresse>`, `<Latitude>` et `<Longitude>` ne sont jamais
  lues par l'import, donc jamais stockées ni affichées (vérifié par les
  tests). La carte est centrée sur la **commune** (`src/data/communes.ts`).
- **Négociateur** : nom, téléphone et e-mail du flux (`nomNego`, `tel`,
  `mailNego`) affichés sur la fiche, comme sur l'ancien site. À défaut, le
  service négociation de l'étude.

## Données (D1)

Migrations `migrations/0002_annonces.sql` et
`0003_annonces_empreinte_contenu.sql`, appliquées par les workflows de
déploiement. Une ligne par annonce, clé `immonot_id` (`Clef/@id`, stable).

| Colonne | Rôle |
| --- | --- |
| `immonot_id` | identifiant Immonot (unique), clé de synchronisation |
| `ref_client` | référence de l'étude (« 025/1912 ») |
| `slug` | URL `/annonces/<slug>/`, fixé à la **création** et jamais modifié |
| `rang` | ordre du flux (ordre de la liste, comme l'ancien site) |
| type, ville, code postal, INSEE, prix, surfaces, pièces | colonnes de liste et de recherche |
| `texte` | texte complet (`Annonce`) |
| `photos` | JSON : URL https |
| `details` | JSON : chauffage, DPE, copropriété, taxe foncière… (valeurs non vides) |
| `nego_*` | négociateur |
| `date_maj` | `dateMAJ` du flux, à titre indicatif : **jamais** utilisé pour détecter un changement ni pour le sitemap |
| `empreinte_contenu` | SHA-256 du contenu normalisé, **sans `dateMAJ`** ni rang (0003) |
| `empreinte` | même valeur (0002 ; elle incluait `dateMAJ`, elle n'est plus comparée) |
| `modifie_le` | dernière modification **réelle** du contenu (date du site) : `lastmod` du sitemap |
| `actif`, `cree_le`, `maj_le`, `retire_le` | suivi de la synchronisation (`maj_le` : dernière écriture de la ligne) |

Le slug suit `<type>-<ville>-<référence>` : `maison-valensole-025-1912`. En
cas de collision, un suffixe `-2`, `-3`… est ajouté.

## Import (`scripts/import-annonces.mjs`)

1. **Récupération** du flux par une *source* (`scripts/annonces/sources.mjs`).
   Interface : `recupererFlux() → { octets, origine }`. Seule la source
   `fichier` (chemin local) existe aujourd'hui.
2. **Analyse** XML sans dépendance (`scripts/annonces/xml.mjs`) : UTF-8
   strict (un octet invalide est une erreur, pas un « � »), document mal
   formé ou tronqué refusé, pas de DTD.
3. **Normalisation** (`scripts/annonces/flux.mjs`) : nombres, booléens,
   photos en https, champs vides retirés, CRPCEN vérifié (`04025`).
4. **Différence** avec la base (`scripts/annonces/synchro.mjs`), une requête
   de lecture : insertions, mises à jour, retraits (`actif = 0`,
   `retire_le`), réactivations (annonce retirée qui revient, même slug).
   Une mise à jour n'a lieu que si **l'empreinte du contenu** change :
   Immonot change `dateMAJ` chaque nuit sur toutes les annonces, même quand
   rien d'autre ne bouge (vérifié : entre deux flux successifs, les 25
   annonces ne diffèrent que par `dateMAJ`). Un tel flux donne `+0 ~0 −0` et
   n'écrit rien ; `modifie_le` n'avance qu'à une vraie modification (ou à
   une création, une réactivation). Le « ~N » du résumé, en simulation comme
   en import, ne compte que ces vraies modifications.
   Les lignes importées avant la migration 0003 n'ont pas d'empreinte : le
   premier import qui suit la calcule (« N empreinte(s) initialisée(s) »),
   sans compter de modification ni changer `modifie_le` (repris de `maj_le`
   par la migration).
5. **Application** en un seul fichier SQL par
   `wrangler d1 execute --remote --file` (valeurs échappées : D1 n'accepte
   pas de paramètres liés dans un fichier).

**Garde-fous** (rien n'est écrit, le script échoue avec un message clair) :
fichier absent, vide, illisible ou mal formé ; flux d'une autre étude ; aucune
annonce ; annonce en double ; **moins de 50 % des annonces actives** en base
(flux probablement tronqué).

Les requêtes D1 d'un fichier ne forment pas une transaction : si Wrangler
échoue en cours d'écriture, relancer l'import suffit (la différence est
recalculée).

```bash
# Simulation (aucune écriture) : affiche « +N ~N −N »
node scripts/import-annonces.mjs --env staging --fichier reference/annonces-kit/xml/04025_20261124011818.xml --dry-run
# D1 locale (npm run dev), après `npx wrangler d1 migrations apply saccoccio-db-staging --local`
node scripts/import-annonces.mjs --local --fichier reference/annonces-kit/xml/04025_20261124011818.xml
```

## Workflow `import-annonces.yml`

- **Run workflow** (onglet Actions) : environnement (`staging` ou
  `production`), fichier du kit, simulation. Le job fait une simulation, puis
  l'import (sauf en simulation). Le résumé apparaît dans le récapitulatif du
  run.
- Secrets et variables : ceux des environnements GitHub existants
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- **Production** : environnement GitHub `production`, donc **approbation**
  de stonepower, et lancement **depuis un tag `v*`** (« Use workflow from »
  → Tags), comme le déploiement. La table doit exister : déployer d'abord une
  version qui contient la migration 0002.
- `repository_dispatch` (type `import-annonces`, `client_payload` :
  `environnement`, `fichier`, `simulation`) est prêt pour le futur déclencheur
  programmé. Exemple :
  `POST /repos/stonepower/saccoccio-site/dispatches`
  `{"event_type": "import-annonces", "client_payload": {"environnement": "staging", "fichier": "04025_20261124011818.xml"}}`.

## Pages

| URL | Rendu | Contenu |
| --- | --- | --- |
| `/annonces/` | Worker, cache HTTP 5 min | liste (10 par page), recherche en GET, état vide |
| `/annonces/<slug>/` | Worker, cache HTTP 5 min | fiche ; 410 si retirée depuis moins d'un an, sinon 404 |
| `/sitemap.xml` | Worker | pages fixes + annonces actives |

Paramètres de recherche : `departement`, `ville`, `type` (`maison`,
`appartement`…), `prix_min`, `prix_max` (paliers de l'ancien site,
`1000000plus` = plus de 1 000 000 €), `page`.

Chaque page lit le **catalogue** (annonces actives + slugs retirés) en **une**
requête D1 (`batch`), gardé 60 s en mémoire dans l'isolat
(`src/lib/annonces-d1.ts`). Sans D1 (table absente), les pages répondent 503
sans cache.

Carte : aucune requête vers un tiers au chargement. Le bouton « Afficher la
carte » charge l'iframe OpenStreetMap à la demande ; le lien « Agrandir le
plan » ouvre OpenStreetMap centré sur la commune. Une commune absente de
`src/data/communes.ts` n'a que le lien (recherche par nom) : l'y ajouter.

Les anciennes URL `product_info.php?products_id=N` d'annonces redirigent vers
`/annonces/` : les `products_id` changeaient à chaque import de l'ancien site,
aucune correspondance fiable avec les nouvelles fiches n'existe.

## Mise en route après le merge

1. Le merge déploie staging (migration 0002 appliquée par
   `deploy-staging`).
2. Actions → **import-annonces** → Run workflow (branche `main`),
   environnement `staging`, fichier `04025_20261124011818.xml`. Cocher
   « Simulation » pour un premier essai : le résumé doit indiquer `+25 ~0 −0`.
3. Relancer sans simulation, puis vérifier
   https://saccoccio-staging.lcollin.workers.dev/annonces/.

## Source réelle du flux : à définir avec Immonot

L'ancien hébergement recevait le fichier par FTP vers 1 h 18
(`04025_AAAAMMJJhhmmss.xml`, instantané complet). Il faut un nouvel endroit.
**Questions à poser à Immonot** :

1. Quels modes de livraison proposez-vous : dépôt FTP/SFTP chez nous, mise à
   disposition sur **votre** serveur (URL HTTPS, SFTP), envoi par e-mail ?
   Une URL HTTPS fixe avec authentification (jeton ou identifiant/mot de
   passe) est le plus simple pour nous.
2. Le fichier reste-t-il un **instantané complet** de toutes les annonces de
   l'étude (et non un différentiel) ?
3. À quelle heure est-il disponible ? Est-il garanti complet une fois
   publié (pas de fichier partiel pendant l'écriture) ?
4. Nom du fichier : toujours `04025_<horodatage>.xml` ? Combien de fichiers
   sont conservés ?
5. Les URL des photos (`photos.immonotpro.com`) restent-elles stables tant
   que l'annonce est en ligne ? Acceptez-vous le lien direct (hotlink) en
   HTTPS ?
6. Le format (`EchangeNotaire` / `CrpCen` / `Clef`) et l'encodage UTF-8
   changent-ils ? Existe-t-il une documentation ou un schéma (XSD) ?
7. Peut-on désactiver l'envoi de l'adresse exacte et des coordonnées
   précises, que nous n'utilisons pas ?

**Ensuite** (PR ultérieure) :

- ajouter une source dans `scripts/annonces/sources.mjs` (par ex.
  `sourceUrl(url)`, `sourceSftp(…)`), ses identifiants en **secrets**
  d'environnement GitHub, et le choix de la source dans le workflow ;
- créer un **Worker programmé** (Cron Trigger) qui appelle
  `repository_dispatch` chaque nuit (GitHub désactive les `schedule` après
  60 jours d'inactivité du dépôt). À valider avant : le nombre de Cron
  Triggers est limité **par compte** sur le plan gratuit, et le compte
  héberge d'autres sites ; le Worker a besoin d'un jeton GitHub (fine-grained,
  « Contents: read & write » sur ce seul dépôt) en secret ;
- **production** : l'environnement GitHub `production` exige une approbation
  et un tag `v*`, ce qui empêche un import nocturne automatique. Prévoir un
  environnement dédié (par ex. `production-annonces`) sans approbation,
  autorisé depuis `main`, avec un jeton Cloudflare limité à D1 ;
- éventuellement, optimiser les photos (≈ 665 Ko chacune) par Cloudflare
  Image Transformations après le passage du DNS.
