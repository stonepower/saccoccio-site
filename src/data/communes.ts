/**
 * Centre des communes (code INSEE → coordonnées), pour la carte des fiches
 * d'annonces : la carte reste à l'échelle de la COMMUNE, comme sur l'ancien
 * site. Les coordonnées précises du flux (<Latitude>, <Longitude>) ne sont
 * jamais importées.
 *
 * Valeurs arrondies à 3 décimales (centre approximatif de la commune, à
 * vérifier sur https://geo.api.gouv.fr/communes/<insee>?fields=centre).
 * Une commune absente n'a pas de carte intégrée, seulement le lien
 * « Agrandir le plan » (recherche OpenStreetMap par nom) : l'ajouter ici.
 */
export const CENTRES_COMMUNES: Readonly<Record<string, { nom: string; lat: number; lon: number }>> = {
	"04070": { nom: "Digne-les-Bains", lat: 44.093, lon: 6.236 },
	"04094": { nom: "Gréoux-les-Bains", lat: 43.758, lon: 5.882 },
	"04112": { nom: "Manosque", lat: 43.834, lon: 5.784 },
	"04197": { nom: "Sainte-Tulle", lat: 43.786, lon: 5.766 },
	"04230": { nom: "Valensole", lat: 43.837, lon: 5.983 },
	"04245": { nom: "Volx", lat: 43.878, lon: 5.842 },
};

export function centreCommune(insee: string | null): { lat: number; lon: number } | null {
	return (insee && CENTRES_COMMUNES[insee]) || null;
}
