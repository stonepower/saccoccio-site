# Kit design : référence de l'ancien site

Ce kit a été préparé le 25/11/2026 à partir du site en ligne https://www.saccoccio-et-associes-manosque-notaires.fr et de la copie locale de l'ancien site. Il sert **de modèle** pour reproduire le design à l'identique dans le nouveau site Astro.

## Contenu

| Dossier ou fichier | Contenu |
|---|---|
| `captures/` | Captures pleine page de l'ancien site, au format bureau (1280 px) et mobile (390 px) : accueil, page de contenu, liste des annonces, détail d'une annonce (bureau seulement), contact, simulateur. **C'est la référence visuelle.** |
| `pages/` | Le HTML rendu de ces mêmes pages, pour la structure, les textes et les classes. Les e-mails nominatifs y sont remplacés par `prenom.nom@notaires.fr`, et Google Analytics a été retiré. L'encodage est ISO-8859-1. |
| `styles-calcules-accueil.json` | Les styles réellement appliqués (couleurs, polices, tailles, marges), relevés dans le navigateur. |
| `images/` | Les images de design : logos, bandeaux, photos de l'accueil, pictogrammes DPE et GES, favicon. Le nom de chaque fichier reprend son ancien chemin, avec `_` à la place de `/`. |

## Ce qui n'est volontairement PAS dans le kit

- **Les fichiers du thème** (`templates/saccoccio/` : CSS, SASS et JS). C'est probablement un thème commercial, et le dépôt est public : on ne le redistribue pas. Il faut écrire notre propre CSS, qui reproduit le rendu des captures.
- **Les photos de l'équipe** (`ihm/img/equipe/`). Ce sont des données personnelles : elles seront reprises avec le contenu, après accord de l'étude.
- **Les photos des annonces.** Elles restent hébergées chez Immonot (`photos.immonotpro.com`).
- **Les PDF de « La lettre de mon notaire ».** Ils relèvent de l'import des contenus.

## Repères

- **Couleurs** :
  - bordeaux `#76022B` pour les liens et les boutons principaux ;
  - bandeau haut `#75062D` (la capture montre un bordeau proche de `#9B0A3F` : se fier à la capture) ;
  - texte `#666`, titres `#333` ;
  - pied de page `#111` avec du texte `#ccc` ;
  - fond gris des sections `#eee`.
- **Polices** : Raleway 400/700 pour le texte et les titres, Lato 700 pour le menu, Rochester (décorative). Elles doivent être **auto-hébergées** : pas de Google Fonts, pour respecter le RGPD.
- **Mise en page** : grille de type Bootstrap 3 (conteneur de 750, 970 ou 1170 px selon l'écran). Menu en majuscules, centré, de 80 px de haut, avec une ombre. Sous-menus sur fond `#111`.
- **Pied de page** : 3 colonnes (Manosque, Gréoux-les-Bains, Valensole), chacune avec son blason, puis les liens, les mentions et le paragraphe SEO.

## Nettoyage : spam caché dans `pages/simulateur.html`

L'ancienne page du simulateur (`CalcAmortEuR2.htm`) contenait, juste avant `</body>`, un bloc de spam injecté lors du piratage du site : une liste `<ul style="height: 1px; overflow: hidden;">` de 129 liens vers des sites étrangers, invisible à l'écran mais lue par les moteurs de recherche. Ce bloc a été **supprimé** du fichier de référence (rien d'autre n'a été modifié) ; aucun de ces liens n'est repris dans le nouveau site. Le test `tests/simulateur.test.mjs` vérifie qu'il ne revient pas dans `reference/`.

Le reste de la page (formulaire et script d'un calculateur tiers, « calcul-de-pret.com ») ne sert que de référence pour les champs et les libellés : son JavaScript, sous copyright, n'est pas repris. Le nouveau simulateur (`src/lib/pret.ts`) est écrit pour ce projet.
