// Calcul du simulateur de prêt (src/lib/pret.ts) : échéance, taux nul, calcul
// inverse, amortissement, saisie à la française.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	amortir,
	calculerEcheance,
	capitalEmpruntable,
	lireNombre,
	validerSaisie,
	type Periodicite,
	type Saisie,
} from "../src/lib/pret.ts";

const centimes = (n: number) => Math.round(n * 100);

test("200 000 € à 3,5 % sur 20 ans, mensuel : 1 159,92 €", () => {
	assert.equal(calculerEcheance(200_000, 3.5, 240, 12), 1159.92);
	const r = amortir({ capital: 200_000, tauxAnnuel: 3.5, nbEcheances: 240, periodicite: 12 });
	assert.equal(r.echeance, 1159.92);
	assert.equal(r.lignes.length, 240);
	assert.equal(r.annees.length, 20);
	// Première échéance : 583,33 € d'intérêts (200 000 × 3,5 % / 12).
	assert.equal(r.lignes[0].interets, 583.33);
	assert.equal(r.lignes[0].capitalAmorti, 576.59);
	// Toutes les échéances sont égales, sauf la dernière (ajustée).
	assert.ok(r.lignes.slice(0, -1).every((l) => l.echeance === 1159.92));
	assert.ok(Math.abs(r.derniereEcheance - 1159.92) < 1);
	assert.equal(r.coutInterets, 78_380.66);
	assert.equal(r.coutTotal, r.coutInterets);
});

test("même résultat que l'ancien simulateur : 100 000 € à 6,5 % sur 300 mois", () => {
	assert.equal(calculerEcheance(100_000, 6.5, 300, 12), 675.21);
});

test("taux nul : capital divisé par le nombre d'échéances, sans intérêts", () => {
	const r = amortir({ capital: 1000, tauxAnnuel: 0, nbEcheances: 3, periodicite: 12 });
	assert.deepEqual(
		r.lignes.map((l) => l.echeance),
		[333.33, 333.33, 333.34],
	);
	assert.equal(r.coutInterets, 0);
	assert.equal(calculerEcheance(120_000, 0, 240, 12), 500);
	assert.equal(capitalEmpruntable(500, 0, 240, 12), 120_000);
});

test("assurance : % annuel du capital initial, fixe à chaque échéance", () => {
	const r = amortir({ capital: 200_000, tauxAnnuel: 3.5, nbEcheances: 240, periodicite: 12, tauxAssurance: 0.3 });
	assert.equal(r.assurance, 50);
	assert.equal(r.echeanceAvecAssurance, 1209.92);
	assert.equal(r.coutAssurance, 12_000);
	assert.equal(r.coutTotal, 90_380.66);
	assert.equal(r.totalVerse, 290_380.66);
	assert.equal(r.annees[0].assurance, 600);
});

const CAS: [number, number, number, Periodicite, number][] = [
	[200_000, 3.5, 240, 12, 0],
	[200_000, 3.5, 240, 12, 0.3],
	[350_000, 4.15, 300, 12, 0.36],
	[87_500, 2.9, 60, 4, 0],
	[150_000, 5, 15, 1, 0.2],
	[45_000, 0, 84, 12, 0.5],
	[1_234_567, 1.25, 50, 2, 0],
];

/** Plus forte échéance versée, assurance comprise (dernière échéance ajustée incluse). */
const plusForte = (capital: number, tauxAnnuel: number, nbEcheances: number, periodicite: Periodicite, tauxAssurance: number) => {
	const r = amortir({ capital, tauxAnnuel, nbEcheances, periodicite, tauxAssurance });
	return centimes(Math.max(r.echeance, r.derniereEcheance) + r.assurance);
};

test("calcul inverse cohérent avec le calcul direct", () => {
	for (const [capital, taux, n, p, assurance] of CAS) {
		const r = amortir({ capital, tauxAnnuel: taux, nbEcheances: n, periodicite: p, tauxAssurance: assurance });
		const inverse = capitalEmpruntable(r.echeanceAvecAssurance, taux, n, p, assurance);
		// On retrouve le montant de départ à quelques euros près : la dernière
		// échéance, ajustée, peut dépasser l'échéance constante de quelques
		// centimes, ce que le calcul inverse s'interdit…
		assert.ok(inverse <= capital && capital - inverse <= 5, `${capital} → ${inverse}`);
		// … aucune échéance ne dépasse l'échéance donnée…
		assert.ok(plusForte(inverse, taux, n, p, assurance) <= centimes(r.echeanceAvecAssurance));
		// … et c'est le montant maximal : un euro de plus la dépasserait.
		assert.ok(plusForte(inverse + 1, taux, n, p, assurance) > centimes(r.echeanceAvecAssurance));
	}
	assert.equal(capitalEmpruntable(1159.92, 3.5, 240, 12), 200_000);
	assert.equal(capitalEmpruntable(1000, 3.5, 240, 12), 172_425);
});

test("la somme du capital amorti est égale au capital emprunté", () => {
	for (const [capital, taux, n, p, assurance] of CAS) {
		const r = amortir({ capital, tauxAnnuel: taux, nbEcheances: n, periodicite: p, tauxAssurance: assurance });
		const somme = r.lignes.reduce((s, l) => s + centimes(l.capitalAmorti), 0);
		assert.equal(somme, centimes(capital));
		assert.equal(r.lignes.at(-1)?.capitalRestant, 0);
		assert.equal(
			r.annees.reduce((s, a) => s + centimes(a.capitalAmorti), 0),
			centimes(capital),
		);
		// Intérêts : somme des lignes = coût affiché.
		assert.equal(
			r.lignes.reduce((s, l) => s + centimes(l.interets), 0),
			centimes(r.coutInterets),
		);
		// Chaque échéance = capital amorti + intérêts, sans montant négatif.
		for (const l of r.lignes) {
			assert.equal(centimes(l.echeance), centimes(l.capitalAmorti) + centimes(l.interets));
			assert.ok(l.capitalAmorti >= 0 && l.interets >= 0);
		}
	}
});

test("saisie à la française", () => {
	assert.equal(lireNombre("200 000"), 200_000);
	assert.equal(lireNombre("200 000 €"), 200_000);
	assert.equal(lireNombre("200.000"), 200_000);
	assert.equal(lireNombre("3,5 %"), 3.5);
	assert.equal(lireNombre("3.5"), 3.5);
	assert.equal(lireNombre("0,30"), 0.3);
	assert.equal(lireNombre("1 159,92 €"), 1159.92);
	assert.equal(lireNombre(""), null);
	assert.equal(lireNombre("-5"), null);
	assert.equal(lireNombre("abc"), null);
	assert.equal(lireNombre("1e6"), null);
});

const saisie = (s: Partial<Saisie> = {}): Saisie => ({
	mode: "echeance",
	montant: "200 000",
	echeanceSouhaitee: "",
	taux: "3,5",
	duree: "20",
	unite: "ans",
	periodicite: "12",
	assurance: "",
	...s,
});

test("validation : saisie correcte, durée en années ou en mois", () => {
	const v = validerSaisie(saisie());
	assert.ok(v.ok);
	assert.deepEqual(v.valeurs, { mode: "echeance", montant: 200_000, tauxAnnuel: 3.5, tauxAssurance: 0, periodicite: 12, nbEcheances: 240 });
	const m = validerSaisie(saisie({ duree: "18", unite: "mois", periodicite: "4" }));
	assert.ok(m.ok && m.valeurs.nbEcheances === 6);
	const t0 = validerSaisie(saisie({ taux: "0" }));
	assert.ok(t0.ok && t0.valeurs.tauxAnnuel === 0);
});

test("validation : erreurs claires, par champ", () => {
	const v = validerSaisie(saisie({ montant: "", taux: "abc", duree: "0", assurance: "x" }));
	assert.ok(!v.ok);
	assert.deepEqual(Object.keys(v.erreurs).sort(), ["assurance", "duree", "montant", "taux"]);
	assert.match(v.erreurs.montant ?? "", /montant emprunté/);
	const inverse = validerSaisie(saisie({ mode: "capital", echeanceSouhaitee: "" }));
	assert.ok(!inverse.ok && inverse.erreurs.echeanceSouhaitee);
	const trimestre = validerSaisie(saisie({ duree: "10", unite: "mois", periodicite: "4" }));
	assert.ok(!trimestre.ok && /multiple de 3 mois/.test(trimestre.erreurs.duree ?? ""));
	assert.ok(!validerSaisie(saisie({ duree: "51" })).ok);
	assert.ok(!validerSaisie(saisie({ taux: "31" })).ok);
	assert.ok(!validerSaisie(saisie({ duree: "2,5", unite: "mois" })).ok);
});
