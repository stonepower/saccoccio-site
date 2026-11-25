-- Migration number: 0002 	 2026-11-25T00:00:00.000Z
-- Annonces immobilières importées du flux XML Immonot
-- (scripts/import-annonces.mjs, voir docs/annonces.md).
-- Schéma uniquement : aucune donnée.
--
-- ⚠️ L'adresse exacte du bien (<Adresse>) et ses coordonnées (<Latitude>,
-- <Longitude>) ne sont JAMAIS importées : aucune colonne ne doit les
-- recevoir. La localisation s'arrête à la commune.
CREATE TABLE IF NOT EXISTS annonces (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Clef/@id du flux : identifiant Immonot stable, clé de synchronisation.
	immonot_id TEXT NOT NULL UNIQUE,
	-- Référence de l'étude (Clef/@refClient), par exemple « 025/1912 ».
	ref_client TEXT NOT NULL,
	-- Chemin de la fiche (/annonces/<slug>/) : fixé à la création, jamais modifié.
	slug TEXT NOT NULL UNIQUE,
	-- Position dans le flux (ordre de la liste, comme l'ancien site).
	rang INTEGER NOT NULL DEFAULT 0,

	-- Bien et localisation (commune uniquement).
	type_bien TEXT NOT NULL, -- APPT, MAIS, TEBA, FMCO, IMMR, GAPA, PROP, DIVE
	sous_nature TEXT, -- libelleSousNature (« Maison individuelle »…)
	type_vente TEXT NOT NULL, -- VENT
	ville TEXT NOT NULL,
	code_postal TEXT,
	insee TEXT,
	departement TEXT,
	affiche_commune INTEGER NOT NULL DEFAULT 1,

	-- Prix (en euros).
	affiche_prix INTEGER NOT NULL DEFAULT 1,
	prix REAL, -- PVB : prix affiché
	prix_net_vendeur REAL, -- PNV
	frais_nego REAL,
	frais_acte REAL,
	mode_nego TEXT, -- TFC, HN, HNI, NV
	charge_nego TEXT, -- A (acquéreur) ou V (vendeur)

	-- Surfaces et pièces (colonnes servant à la liste et à la recherche).
	surface_habitable REAL,
	surface_terrain REAL,
	nb_pieces INTEGER,
	nb_chambres INTEGER,

	-- Texte complet (Annonce ; AnnonceAnglais n'est pas importé).
	texte TEXT NOT NULL DEFAULT '',
	-- URLs des photos (JSON, tableau de chaînes, en https), hébergées chez Immonot.
	photos TEXT NOT NULL DEFAULT '[]',
	-- Autres caractéristiques non vides (JSON) : chauffage, DPE, copropriété…
	details TEXT NOT NULL DEFAULT '{}',

	-- Négociateur (affiché sur la fiche, comme sur l'ancien site).
	nego_nom TEXT,
	nego_tel TEXT,
	nego_email TEXT,

	-- Dates du flux (millisecondes depuis l'epoch).
	date_creation INTEGER,
	date_maj INTEGER,
	-- SHA-256 du contenu normalisé : détecte un changement sans dateMAJ.
	empreinte TEXT NOT NULL,

	-- Suivi de la synchronisation (millisecondes depuis l'epoch, UTC).
	actif INTEGER NOT NULL DEFAULT 1,
	cree_le INTEGER NOT NULL,
	maj_le INTEGER NOT NULL,
	retire_le INTEGER
);

CREATE INDEX IF NOT EXISTS annonces_actif_rang ON annonces (actif, rang);
