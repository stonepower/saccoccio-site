# Kit de contenus : pages de l'ancien site

> **Dans ce dépôt** : les PDF de `documents/` ont été déplacés dans
> `public/documents/` (servis tels quels, sans copie en double). Les images
> de `images/` restent ici (originaux) ; leurs WebP sont produits par
> `scripts/optimize-images.mjs`. Les `pages/*.html` sont la source des pages
> prérendues (voir CLAUDE.md, « Pages éditoriales »). Seule correction
> apportée : 4 caractères mal encodés (« T?l. », « GR?OUX ») dans
> `contact__plans-acces-horaires.html`.

Ce kit a été préparé le 25/11/2026 à partir des pages **publiques** du site https://www.saccoccio-et-associes-manosque-notaires.fr. La base de données n'a pas été utilisée : elle contient des données clients.

## Contenu

| Élément | Contenu |
|---|---|
| `pages/*.html` | **34 pages à reprendre** (environ 69 000 mots). Le HTML est nettoyé et en UTF-8 : encodage réparé, sans classes ni styles, avec seulement des balises simples (`h1`-`h4`, `p`, listes, liens, `strong`/`em`, tableaux, `img`). Le nom du fichier reprend la nouvelle URL, avec `__` à la place de `/`. |
| `pages.json` | Une fiche par page : ancien id, titre, `h1` d'origine, rubrique, anciennes URL, nouvelle URL, fichier, statut, nombre de mots, images et documents cités. |
| `urls.csv` | **La carte des URL** : ancienne URL → nouvelle URL, pour les pages, les rubriques, les annonces, le simulateur et le contact. C'est la source des redirections 301. |
| `documents/` | 58 PDF : les 57 numéros de « La lettre de mon notaire » et un document des mentions légales. |
| `images/` | Les photos des trois études (Manosque, Gréoux-les-Bains, Valensole) et celle des prédécesseurs. |
| (hors kit) | 3 pages qui ne sont pas reprises et deviennent de simples redirections : l'ancienne fiche « Accueil » (p1), la « Vente notariale interactive » (p311, une page « en construction ») et le « Décret n° 2010-48 » (p62, un texte de 2010 devenu obsolète). |

## Réécritures déjà faites dans le HTML

- Les liens internes `product_info.php?products_id=N` pointent vers la nouvelle URL de `urls.csv`.
- Les liens vers `contact_us.php` pointent vers `/contact/`, et ceux vers `allprods.php` vers `/annonces/`.
- Les PDF pointent vers `/documents/<nom>.pdf`, et les images vers `/images/contenu/<nom>`.
- Les liens vers le panier, la liste d'envies et le compte client sont neutralisés.
- Les ancres internes (`#historique`…) et les `id` des titres sont conservés.

## Points à valider avec l'étude (rien n'a été changé dans les textes)

1. **L'équipe** (`office-notarial__equipe.html` et la section « L'équipe » de `office-notarial.html`) : les deux listes ne concordent pas. Il faut demander à l'étude la liste à jour et son accord pour publier les photos. **Les photos de l'équipe ne sont pas dans le kit.** En attendant, afficher les noms et fonctions sans photo.
2. **Liste des coordonnées** (`contact__coordonnees.html`) : le **contenu est périmé** (il cite d'anciens collaborateurs). Les e-mails nominatifs y sont remplacés par `prenom.nom@notaires.fr`. Il faut une liste à jour.
3. **Tarifs** : ce sont des tarifs réglementés, à faire relire.
4. **Mentions légales** : l'hébergeur doit être mis à jour (Cloudflare), et une politique de confidentialité ajoutée (formulaire de contact).
5. **Pages orphelines** : « Mon entreprise », « Mon patrimoine », « Mon logement » et « Ma famille » n'apparaissent dans aucun menu, alors que ce sont les textes les plus longs. Elles sont reprises sous `/conseils/`, mais il faut décider si on les ajoute au menu.
6. **Doublons** : `/office-notarial/` est une page longue qui regroupe Historique, Fonctions, Profession, Équipe, Lexique, Tarifs et Prédécesseurs. Ces sections existent aussi en pages séparées, et le sous-menu pointe vers ces pages séparées. Pour l'instant, on garde les deux, comme sur l'ancien site. Plus tard, on pourra ajouter une URL canonique ou fusionner.
7. **Textes anciens** : plusieurs textes juridiques datent des années 2010. Une relecture éditoriale reste recommandée.
