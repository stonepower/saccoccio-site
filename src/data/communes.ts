/**
 * Centre des communes (code INSEE → coordonnées), pour la carte des fiches
 * d'annonces : la carte reste à l'échelle de la COMMUNE, comme sur l'ancien
 * site. Les coordonnées précises du flux (<Latitude>, <Longitude>) ne sont
 * jamais importées.
 *
 * Valeurs : centre officiel de la commune (champ `centre` de
 * https://geo.api.gouv.fr/communes/<insee>?fields=centre), arrondi à
 * 3 décimales. Jamais de coordonnées plus précises que ce centre.
 * Une commune absente n'a pas de carte intégrée, seulement le lien
 * « Agrandir le plan » (recherche OpenStreetMap par nom) : l'ajouter ici.
 */
export const CENTRES_COMMUNES: Readonly<Record<string, { nom: string; lat: number; lon: number }>> = {
	"04070": { nom: "Digne-les-Bains", lat: 44.095, lon: 6.25 },
	"04094": { nom: "Gréoux-les-Bains", lat: 43.763, lon: 5.86 },
	"04112": { nom: "Manosque", lat: 43.829, lon: 5.79 },
	"04197": { nom: "Sainte-Tulle", lat: 43.782, lon: 5.766 },
	"04230": { nom: "Valensole", lat: 43.839, lon: 5.939 },
	"04245": { nom: "Volx", lat: 43.868, lon: 5.825 },
};

export function centreCommune(insee: string | null): { lat: number; lon: number } | null {
	return (insee && CENTRES_COMMUNES[insee]) || null;
}
