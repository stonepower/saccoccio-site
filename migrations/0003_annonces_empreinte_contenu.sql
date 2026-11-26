-- Migration number: 0003 	 2026-11-26T00:00:00.000Z
-- Annonces : empreinte du contenu SANS dateMAJ, et date de modification
-- propre au site (scripts/import-annonces.mjs, voir docs/annonces.md).
-- Schéma uniquement : aucune donnée.
--
-- Immonot change `dateMAJ` chaque nuit sur toutes les annonces, même quand
-- rien d'autre ne bouge. L'import ne réécrit donc une ligne que si
-- `empreinte_contenu` change, et c'est alors seulement que `modifie_le`
-- avance (c'est le `lastmod` du sitemap ; `date_maj` n'y sert jamais).
--
-- Compatible avec le code précédent : colonnes facultatives, qu'il ignore.
-- La colonne `empreinte` (0002, qui incluait dateMAJ) n'est plus comparée ;
-- elle reçoit désormais la même valeur que `empreinte_contenu`.

-- SHA-256 du contenu normalisé, hors `dateMAJ` et hors rang. NULL tant que
-- le premier import qui suit cette migration ne l'a pas calculée.
ALTER TABLE annonces ADD COLUMN empreinte_contenu TEXT;

-- Dernière modification réelle du contenu (millisecondes depuis l'epoch, UTC).
ALTER TABLE annonces ADD COLUMN modifie_le INTEGER;

-- Point de départ des lignes existantes : leur dernière écriture.
UPDATE annonces SET modifie_le = maj_le WHERE modifie_le IS NULL;
