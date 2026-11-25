# Kit annonces : exemples du flux XML Immonot

Ce kit a été préparé le 25/11/2026 à partir des fichiers déposés chaque nuit par Immonot dans `fluxxml/` sur l'ancien serveur.

## Contenu

| Fichier | Contenu |
|---|---|
| `xml/04025_20261001011818.xml` | Instantané du 01/10/2026 (25 annonces) |
| `xml/04025_20261110011816.xml` | Instantané du 10/11/2026 (27 annonces : 5 ajoutées, 3 retirées par rapport au 01/10) |
| `xml/04025_20261124011818.xml` | Instantané du 24/11/2026 (25 annonces : 2 retirées par rapport au 10/11) |

Les trois fichiers permettent de tester une synchronisation **par différence** : ajouts, retraits et mises à jour.

## Anonymisation (le dépôt est public)

Seules ces valeurs ont été modifiées. Le reste est tel qu'Immonot le fournit.

- `<Adresse>` → `[adresse retirée]`. C'est l'adresse exacte du bien, donc souvent le domicile du vendeur.
- `<Latitude>` et `<Longitude>` → tronquées à 2 décimales (environ 1 km).
- `nomNego` → `Prénom NOM`, et `tel` → `00.00.00.00.00` (le mobile de la négociatrice). Ces deux valeurs sont affichées sur le site (voir plus bas) : elles ne sont anonymisées qu'ici.

**En production, le vrai flux contient ces données.** Le nouveau site **ne doit jamais afficher ni stocker** l'adresse exacte, ni les coordonnées précises. Ne pas importer `<Adresse>` du tout. Pour une éventuelle carte, utiliser des coordonnées arrondies ou le centre de la commune. L'ancien site faisait déjà ainsi : il plaçait les biens au centre de la commune, retrouvé par le code INSEE. **Correction (décision de l'utilisateur, 25/11/2026)** : le nom, le téléphone et l'e-mail du négociateur (`nomNego`, `tel`, `mailNego`) **sont affichés** sur la fiche, comme sur l'ancien site. Ils ne sont anonymisés que dans ce kit, parce que le dépôt est public. Si le flux ne les fournit pas (ou si le téléphone est inexploitable), la fiche affiche le service négociation de l'étude (`negociation.04025@notaires.fr`, 04 92 70 70 70). En revanche, `<Adresse>` n'est **jamais** importée, stockée ni affichée, et aucune coordonnée plus précise que la commune n'est conservée.

## Format

Encodage UTF-8. La racine est `<EchangeNotaire>`, puis `<CrpCen id="04025" …>` (l'étude), puis un `<Clef>` par annonce.

- **Attributs de `<Clef>`** :
  - `id` : identifiant Immonot **stable**, clé de synchronisation ;
  - `refClient` : par exemple `025/1912` ;
  - localisation : `insee`, `codePostal`, `ville`, `departement` ;
  - type de bien : `typeVente` (`VENT`), `typeBien`, `codeSousNature`, `libelleSousNature` ;
  - prix et affichage : `modeNego`, `affichePrix`, `afficheCommune` ;
  - dates : `dateCreation`, `dateMAJ` (en millisecondes depuis l'epoch) ;
  - divers : `isCoupDeCoeur`, `flag`, `garage`.
- **Éléments** :
  - prix : `PVB` (prix de vente), `PNV` (prix net vendeur), `fraisActe`, `fraisNego` ;
  - surfaces : `SurfaceHabitable`, `SurfaceTerrain`, etc. ;
  - pièces : `NbrePiece`, `NbreChambres` ;
  - DPE : `dpeNrj` + `nrjLettre`, `dpeGes` + `gesLettre`, `dpeDate`, `ExempteDpe`, `DpeVierge`, `coutAnnMin` / `coutAnnMax` ;
  - copropriété ;
  - textes : `Annonce` (français) et `AnnonceAnglais` ;
  - un `Photo id="N"` par photo : URL `http://photos.immonotpro.com/…`, qui existe aussi en HTTPS.
- **Libellés de l'ancien site** (`sincronizacionXML.php`) :
  - `typeBien` :
    - `APPT` : Appartement ;
    - `MAIS` : Maison ;
    - `TEBA` : Terrain ;
    - `FMCO` : Fonds de commerce ;
    - `IMMR` : Immeuble de rapport ;
    - `GAPA` : Garage/Parking ;
    - `PROP` : Propriété ;
    - `DIVE` : Divers.
  - `modeNego` :
    - `TFC` : Tous frais compris ;
    - `HN` : Honoraires notaire en sus ;
    - `HNI` : Honoraires notaire inclus ;
    - `NV` : affiché tel quel.
  - Le titre de l'annonce, quand le flux n'en fournit pas, est le type de bien.
- Le site est en français uniquement : on n'utilise pas `AnnonceAnglais`.

## Fonctionnement actuel et cible

- **Aujourd'hui** : Immonot dépose vers 1 h 18 un fichier `04025_AAAAMMJJhhmmss.xml` (instantané complet) dans un dossier FTP du serveur du prestataire. Un script PHP vide puis recharge toutes les annonces.
- **Cible** (décisions de l'utilisateur) :
  - synchronisation **par différence** sur `Clef/@id` : ajouts, mises à jour et retraits ;
  - URLs stables, par exemple `/annonces/maison-valensole-025-1912/` ;
  - données dans D1 ;
  - **photos NON copiées dans R2** : on garde les liens vers `https://photos.immonotpro.com` (les JPEG font environ 665 Ko ; une optimisation par Cloudflare Image Transformations pourra venir après le passage du DNS) ;
  - import par une **GitHub Action nocturne**, déclenchée par un **Worker Cloudflare programmé** (GitHub désactive les cron après 60 jours d'inactivité).
- **L'endroit où Immonot déposera le fichier après l'arrêt de l'ancien hébergement n'est pas encore connu** (question posée à Immonot). La récupération du fichier doit donc être isolée et interchangeable (FTP, SFTP, URL, etc.). En attendant, l'import doit pouvoir se lancer à la main sur un des fichiers de ce kit.
- **Garde-fou** : si le fichier du jour est absent, vide ou invalide, ou s'il contient beaucoup moins d'annonces que la veille, **ne rien supprimer** et signaler l'erreur (échec du workflow). Un flux tronqué ne doit pas vider le site.

## Référence visuelle

Les captures de la liste des annonces et du détail d'une annonce sont dans `reference/design-kit/captures/`, et le HTML correspondant dans `reference/design-kit/pages/`. Les pictogrammes DPE et GES sont dans `reference/design-kit/images/`.
