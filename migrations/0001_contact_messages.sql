-- Migration number: 0001 	 2026-11-25T00:00:00.000Z
-- Messages du formulaire de contact en mode « store » (CONTACT_MODE).
-- Schéma uniquement : aucune donnée. Ces messages sont des données
-- personnelles : le Worker supprime ceux de plus de 30 jours à chaque
-- insertion (src/lib/contact.ts), et aucune page ne les affiche.
CREATE TABLE IF NOT EXISTS contact_messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Date de réception, en millisecondes depuis l'epoch (UTC).
	cree_le INTEGER NOT NULL,
	nom TEXT NOT NULL,
	email TEXT NOT NULL,
	telephone TEXT,
	destinataire TEXT,
	message TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contact_messages_cree_le ON contact_messages (cree_le);
