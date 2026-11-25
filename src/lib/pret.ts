/**
 * Calcul d'un prêt immobilier à taux fixe (écrit pour ce projet : le
 * simulateur de l'ancien site, sous copyright tiers, n'est pas repris).
 *
 * Utilisé dans le navigateur par la page /simulateur-pret/ (prérendue :
 * aucun calcul dans le Worker) et par les tests (`tests/pret.test.ts`).
 * Aucune dépendance.
 *
 * - Échéance constante : M = C·t / (1 − (1 + t)^−n), avec t le taux
 *   périodique proportionnel (taux annuel / nombre d'échéances par an) et
 *   n le nombre d'échéances ; M = C / n si le taux est nul.
 * - Les montants sont calculés en centimes entiers : l'échéance et les
 *   intérêts de chaque période sont arrondis au centime ; la dernière
 *   échéance est ajustée pour solder exactement le capital.
 * - Assurance : pourcentage annuel du capital initial, donc montant fixe à
 *   chaque échéance (arrondi au centime).
 */

/** Nombre d'échéances par an. */
export type Periodicite = 12 | 4 | 2 | 1;

export const PERIODICITES: readonly { valeur: Periodicite; libelle: string; echeance: string }[] = [
	{ valeur: 12, libelle: "Mensuelle", echeance: "Mensualité" },
	{ valeur: 4, libelle: "Trimestrielle", echeance: "Échéance trimestrielle" },
	{ valeur: 2, libelle: "Semestrielle", echeance: "Échéance semestrielle" },
	{ valeur: 1, libelle: "Annuelle", echeance: "Annuité" },
];

/** Bornes de saisie (messages d'erreur dans `validerSaisie`). */
export const LIMITES = {
	montantMax: 100_000_000,
	tauxMax: 30,
	assuranceMax: 5,
	dureeMaxAnnees: 50,
} as const;

export interface ParametresPret {
	/** Montant emprunté, en euros. */
	capital: number;
	/** Taux nominal annuel, en % (3,5 pour 3,5 %). */
	tauxAnnuel: number;
	/** Nombre total d'échéances. */
	nbEcheances: number;
	periodicite: Periodicite;
	/** Taux annuel d'assurance, en % du capital initial (0 si aucune). */
	tauxAssurance?: number;
}

export interface LigneAmortissement {
	numero: number;
	/** Année du prêt (1 pour les premières échéances). */
	annee: number;
	capitalDebut: number;
	interets: number;
	capitalAmorti: number;
	assurance: number;
	/** Échéance hors assurance. */
	echeance: number;
	capitalRestant: number;
}

export interface RecapAnnuel {
	annee: number;
	interets: number;
	capitalAmorti: number;
	assurance: number;
	/** Total versé dans l'année, assurance comprise. */
	verse: number;
	capitalRestant: number;
}

export interface ResultatPret {
	/** Échéance constante hors assurance (la dernière peut différer de quelques centimes). */
	echeance: number;
	/** Assurance de chaque échéance. */
	assurance: number;
	/** Échéance constante assurance comprise. */
	echeanceAvecAssurance: number;
	/** Dernière échéance hors assurance, après ajustement. */
	derniereEcheance: number;
	coutInterets: number;
	coutAssurance: number;
	/** Intérêts + assurance (hors frais de dossier et de garantie). */
	coutTotal: number;
	/** Capital + coût total. */
	totalVerse: number;
	lignes: LigneAmortissement[];
	annees: RecapAnnuel[];
}

const enCentimes = (euros: number): number => Math.round(euros * 100);
const enEuros = (centimes: number): number => centimes / 100;

/** Taux périodique proportionnel (taux annuel en % → taux par échéance). */
export function tauxPeriodique(tauxAnnuel: number, periodicite: Periodicite): number {
	return tauxAnnuel / 100 / periodicite;
}

/** Échéance exacte (non arrondie) d'un capital C sur n échéances au taux t. */
export function echeanceExacte(capital: number, t: number, n: number): number {
	if (t === 0) return capital / n;
	return (capital * t) / (1 - (1 + t) ** -n);
}

/** Échéance constante hors assurance, arrondie au centime. */
export function calculerEcheance(capital: number, tauxAnnuel: number, nbEcheances: number, periodicite: Periodicite): number {
	return enEuros(Math.round(echeanceExacte(enCentimes(capital), tauxPeriodique(tauxAnnuel, periodicite), nbEcheances)));
}

/** Assurance de chaque échéance, arrondie au centime. */
export function calculerAssurance(capital: number, tauxAssurance: number, periodicite: Periodicite): number {
	return enEuros(Math.round((enCentimes(capital) * tauxAssurance) / 100 / periodicite));
}

/** Tableau d'amortissement complet et coûts du crédit. */
export function amortir(p: ParametresPret): ResultatPret {
	const t = tauxPeriodique(p.tauxAnnuel, p.periodicite);
	const n = p.nbEcheances;
	const echeanceC = enCentimes(calculerEcheance(p.capital, p.tauxAnnuel, n, p.periodicite));
	const assuranceC = enCentimes(calculerAssurance(p.capital, p.tauxAssurance ?? 0, p.periodicite));

	const lignes: LigneAmortissement[] = [];
	let restant = enCentimes(p.capital);
	let interetsTotal = 0;
	for (let i = 1; i <= n; i++) {
		const interets = Math.round(restant * t);
		// Dernière échéance (ou capital déjà presque soldé) : on solde tout.
		const amorti = i === n ? restant : Math.min(restant, echeanceC - interets);
		const debut = restant;
		restant -= amorti;
		interetsTotal += interets;
		lignes.push({
			numero: i,
			annee: Math.ceil(i / p.periodicite),
			capitalDebut: enEuros(debut),
			interets: enEuros(interets),
			capitalAmorti: enEuros(amorti),
			assurance: enEuros(assuranceC),
			echeance: enEuros(interets + amorti),
			capitalRestant: enEuros(restant),
		});
	}

	const annees: RecapAnnuel[] = [];
	for (const l of lignes) {
		let a = annees[l.annee - 1];
		if (!a) {
			a = { annee: l.annee, interets: 0, capitalAmorti: 0, assurance: 0, verse: 0, capitalRestant: 0 };
			annees.push(a);
		}
		// Cumuls en centimes pour éviter les erreurs d'arrondi des flottants.
		a.interets = enEuros(enCentimes(a.interets) + enCentimes(l.interets));
		a.capitalAmorti = enEuros(enCentimes(a.capitalAmorti) + enCentimes(l.capitalAmorti));
		a.assurance = enEuros(enCentimes(a.assurance) + enCentimes(l.assurance));
		a.verse = enEuros(enCentimes(a.verse) + enCentimes(l.echeance) + enCentimes(l.assurance));
		a.capitalRestant = l.capitalRestant;
	}

	const coutAssurance = assuranceC * n;
	return {
		echeance: enEuros(echeanceC),
		assurance: enEuros(assuranceC),
		echeanceAvecAssurance: enEuros(echeanceC + assuranceC),
		derniereEcheance: lignes.length ? lignes[lignes.length - 1].echeance : 0,
		coutInterets: enEuros(interetsTotal),
		coutAssurance: enEuros(coutAssurance),
		coutTotal: enEuros(interetsTotal + coutAssurance),
		totalVerse: enEuros(enCentimes(p.capital) + interetsTotal + coutAssurance),
		lignes,
		annees,
	};
}

/**
 * Calcul inverse : montant empruntable pour une échéance souhaitée
 * (assurance comprise si un taux d'assurance est donné). Le résultat est
 * en euros : c'est le plus grand montant dont l'échéance, calculée par le
 * calcul direct (assurance comprise, dernière échéance ajustée incluse), ne
 * dépasse pas l'échéance souhaitée.
 */
export function capitalEmpruntable(
	echeanceSouhaitee: number,
	tauxAnnuel: number,
	nbEcheances: number,
	periodicite: Periodicite,
	tauxAssurance = 0,
): number {
	const t = tauxPeriodique(tauxAnnuel, periodicite);
	// Échéance (hors arrondi) d'un capital de 1 € : intérêts + assurance.
	const parEuro = echeanceExacte(1, t, nbEcheances) + tauxAssurance / 100 / periodicite;
	let capital = Math.floor(echeanceSouhaitee / parEuro);
	// Plus forte échéance versée, assurance comprise (la dernière, ajustée,
	// peut dépasser l'échéance constante de quelques centimes).
	const total = (c: number) => {
		const r = amortir({ capital: c, tauxAnnuel, nbEcheances, periodicite, tauxAssurance });
		return enCentimes(Math.max(r.echeance, r.derniereEcheance) + r.assurance);
	};
	const plafond = enCentimes(echeanceSouhaitee);
	// Corrige les écarts d'un euro dus aux arrondis au centime (montant maximal).
	while (capital > 0 && total(capital) > plafond) capital--;
	while (total(capital + 1) <= plafond) capital++;
	return Math.max(capital, 0);
}

/**
 * Lit un nombre saisi à la française : « 200 000 », « 3,5 % », « 1 159,92 € »,
 * ou avec un point décimal. Renvoie `null` si la saisie n'est pas un nombre
 * positif.
 */
export function lireNombre(saisie: string): number | null {
	let texte = saisie
		.replace(/[\s  '€%]/g, "")
		.replace(/eur(os?)?$/i, "");
	// « 200.000 » : point séparateur de milliers (sans virgule décimale).
	if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(texte)) texte = texte.replaceAll(".", "");
	texte = texte.replace(",", ".");
	if (!/^\d+(\.\d+)?$/.test(texte)) return null;
	const n = Number(texte);
	return Number.isFinite(n) ? n : null;
}

export type Mode = "echeance" | "capital";
export type UniteDuree = "ans" | "mois";

/** Saisie brute du formulaire (valeurs des champs). */
export interface Saisie {
	mode: Mode;
	montant: string;
	echeanceSouhaitee: string;
	taux: string;
	duree: string;
	unite: UniteDuree;
	periodicite: string;
	assurance: string;
}

export interface SaisieValide {
	mode: Mode;
	/** Montant emprunté (mode « echeance ») ou échéance souhaitée (mode « capital »). */
	montant: number;
	tauxAnnuel: number;
	tauxAssurance: number;
	periodicite: Periodicite;
	nbEcheances: number;
}

export type ErreursSaisie = Partial<Record<"montant" | "echeanceSouhaitee" | "taux" | "duree" | "assurance", string>>;

const fr = (n: number): string => n.toLocaleString("fr-FR");

/** Valide la saisie et renvoie soit les paramètres, soit des messages d'erreur par champ. */
export function validerSaisie(s: Saisie): { ok: true; valeurs: SaisieValide } | { ok: false; erreurs: ErreursSaisie } {
	const erreurs: ErreursSaisie = {};
	const periodicite = (PERIODICITES.find((p) => String(p.valeur) === s.periodicite)?.valeur ?? 12) as Periodicite;

	const champMontant = s.mode === "capital" ? "echeanceSouhaitee" : "montant";
	const montant = lireNombre(s.mode === "capital" ? s.echeanceSouhaitee : s.montant);
	if (montant === null || montant <= 0) {
		erreurs[champMontant] =
			s.mode === "capital"
				? "Indiquez l'échéance souhaitée en euros, par exemple 1 000."
				: "Indiquez le montant emprunté en euros, par exemple 200 000.";
	} else if (montant > LIMITES.montantMax) {
		erreurs[champMontant] = `Le montant ne peut pas dépasser ${fr(LIMITES.montantMax)} €.`;
	}

	const taux = lireNombre(s.taux);
	if (taux === null) erreurs.taux = "Indiquez le taux annuel en %, par exemple 3,5 (0 pour un prêt sans intérêts).";
	else if (taux > LIMITES.tauxMax) erreurs.taux = `Le taux ne peut pas dépasser ${fr(LIMITES.tauxMax)} %.`;

	const assurance = s.assurance.trim() === "" ? 0 : lireNombre(s.assurance);
	if (assurance === null) erreurs.assurance = "Indiquez le taux d'assurance en %, par exemple 0,30, ou laissez le champ vide.";
	else if (assurance > LIMITES.assuranceMax)
		erreurs.assurance = `Le taux d'assurance ne peut pas dépasser ${fr(LIMITES.assuranceMax)} %.`;

	const duree = lireNombre(s.duree);
	const moisParEcheance = 12 / periodicite;
	const mois = duree === null ? null : s.unite === "mois" ? duree : duree * 12;
	if (duree === null || mois === null || !Number.isInteger(mois) || mois <= 0) {
		erreurs.duree =
			s.unite === "mois" ? "Indiquez la durée en nombre entier de mois, par exemple 240." : "Indiquez la durée en années, par exemple 20.";
	} else if (mois > LIMITES.dureeMaxAnnees * 12) {
		erreurs.duree = `La durée ne peut pas dépasser ${LIMITES.dureeMaxAnnees} ans.`;
	} else if (mois % moisParEcheance !== 0) {
		const libelle = PERIODICITES.find((p) => p.valeur === periodicite)?.libelle.toLowerCase();
		erreurs.duree = `Avec une périodicité ${libelle}, la durée doit être un multiple de ${moisParEcheance} mois.`;
	}

	if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
	return {
		ok: true,
		valeurs: {
			mode: s.mode,
			montant: montant as number,
			tauxAnnuel: taux as number,
			tauxAssurance: assurance as number,
			periodicite,
			nbEcheances: (mois as number) / moisParEcheance,
		},
	};
}
