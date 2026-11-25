/**
 * Données de la page Contact, reprises de l'ancienne page
 * (reference/design-kit/pages/contact.html).
 *
 * Tous les messages partent vers l'adresse générale de l'étude (CONTACT_TO) :
 * la liste « Contact » sert seulement à indiquer la personne ou le service
 * concerné, repris dans l'objet de l'e-mail. Liste à tenir à jour avec
 * l'étude (arrivées, départs).
 *
 * Ce fichier est importé par le Worker (validation de la route
 * /contact/envoi/) : n'y mettre que des données publiques et légères.
 */

/** Intitulés de la liste « Contact » de l'ancien formulaire, dans l'ordre. */
export const CONTACTS: readonly string[] = [
	"Notaire - Philippe SACCOCCIO",
	"Notaire - Sophie CASANOVA-TIRAND",
	"Notaire - Vincent BONDIL",
	"Notaire - Claire CHOUQUET",
	"Notaire - François ALBESSARD",
	"Notaire salarié - Kathy LAURENT",
	"Notaire salarié - Caroline SAUJEON",
	"Notaire salarié - Valérie MARC-VIVIEN",
	"Notaire salarié - Marlène SALEH",
	"Notaire salarié - Lucie MICHAUD",
	"Notaire assistant - Mélanie DELANNOY",
	"Clerc de notaire - Coralie REITA",
	"Clerc de notaire - Corinne LEPORINI",
	"Clerc de notaire - Catherine GAY",
	"Clerc de notaire - Elora GALLAY",
	"Clerc de notaire - Vincent VOTA",
	"Clerc de notaire - Mary BIONDETTI",
	"Clerc de notaire - Amaya OGIEZ",
	"Clerc de notaire - Valérie LAMBOLEY",
	"Clerc de notaire - Sylvie VALLEE",
	"Clerc de notaire - Sandrine ESPOSITO",
	"Standardiste & Clerc de notaire - Amélie CORTES",
	"Notaire stagiaire - Malorie BANON",
	"Secrétaire - Agnès GUERRINI",
	"Secrétaire - Marielle FABRE",
	"Secrétariat Gréoux-les-Bains",
	"Comptable taxateur - Clorinde BODJI",
	"Comptable - Gladys BONNEFIN",
	"Aide comptable - Audrey BICCHIERAY",
	"Formaliste - Sylvie MARTIN",
	"Aide formaliste - Soleine LEFEBVRE",
	"Standardiste - Jocelyne ETIENNE",
	"Standardiste - Natacha PINATEL",
	"Négociatrice - Marine BOURRE",
];

/** Encadré « Service négociation » (colonne de droite). */
export const NEGOCIATION = {
	nom: "Marine BOURRE",
	portable: "06 81 04 34 53",
	email: "negociation.04025@notaires.fr",
} as const;

/** Téléphone affiché quand l'envoi échoue (standard de Manosque). */
export const TELEPHONE_ETUDE = "04 92 70 70 70";

/** Adresse publique de l'étude (page Coordonnées), pour les secours sans formulaire. */
export const EMAIL_ETUDE = "saccoccio.tirand.bondil.perrot@notaires.fr";
