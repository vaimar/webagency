import { buildResortJoinKey, buildSkiMapLayerData, cleanResortName, filterSkiResorts } from './skiMap';
import { SkiHotel, SkiResort } from './api';

describe('buildResortJoinKey', () => {
    it('normalizes accents and separators', () => {
        expect(buildResortJoinKey('Côte d’Ivoire', 'Les 2 Alpes')).toBe('cote-d-ivoire::les-2-alpes');
    });
});

describe('cleanResortName', () => {
    it('drops a lost diacritic but keeps the letter it sat on', () => {
        expect(cleanResortName('St Franc?ois Longchamp')).toBe('St Francois Longchamp');
        expect(cleanResortName('Arcali?s-Ordino (Vallnord)')).toBe('Arcalis-Ordino (Vallnord)');
        expect(cleanResortName('Les Bottie?res')).toBe('Les Bottieres');
    });

    it('drops a lost soft hyphen without eating the separator', () => {
        expect(cleanResortName('Le Grand Domaine-Valmorel-?Doucy-?Celliers'))
            .toBe('Le Grand Domaine-Valmorel-Doucy-Celliers');
        expect(cleanResortName('Grandvalira – Pas de la Casa/?Grau Roig'))
            .toBe('Grandvalira – Pas de la Casa/Grau Roig');
    });

    it('trims the separator left behind by a dropped fragment', () => {
        expect(cleanResortName('Pal-?Arinsal-La Massana-Vallnord-'))
            .toBe('Pal-Arinsal-La Massana-Vallnord');
    });

    it('leaves a clean name untouched', () => {
        expect(cleanResortName('Zermatt - Matterhorn')).toBe('Zermatt - Matterhorn');
        expect(cleanResortName('Sölden')).toBe('Sölden');
        expect(cleanResortName('Les 2 Alpes')).toBe('Les 2 Alpes');
    });

    it('survives null and empty input', () => {
        expect(cleanResortName(null)).toBe('');
        expect(cleanResortName(undefined)).toBe('');
    });
});

describe('buildSkiMapLayerData', () => {
    const resorts: SkiResort[] = [
        {
            rank: 1,
            sourceFile: 'ski-resorts.csv',
            name: 'Bardonecchia',
            country: 'Italy',
            region: 'Piedmont',
            latitude: 45.05,
            longitude: 6.70,
            rating: 4.2,
            price: 1311.7,
            season: 'winter',
            totalLifts: 23,
            totalSlopes: 42,
            totalSlopeLengthKm: 140,
            annualSnowfallCm: 170,
        },
        {
            rank: 2,
            sourceFile: 'resorts.csv',
            name: 'Zell am See-Kaprun',
            country: 'Austria',
            region: 'Salzburg',
            latitude: 47.3231,
            longitude: 12.7768,
            rating: 4.8,
            price: 1181.7,
            season: 'winter',
            totalLifts: 49,
            totalSlopes: 26,
            totalSlopeLengthKm: 138,
            annualSnowfallCm: 600,
        },
    ];

    const hotels: SkiHotel[] = [
        {
            sourceFile: 'ski_hotels.csv',
            sourceRow: 1,
            country: 'italy',
            resort: 'bardonecchia',
            resortKey: 'italy::bardonecchia',
            hotel: 'Residence Tabor',
            priceGbp: 550,
            distanceFromLiftM: 1100,
            totalPisteKm: 140,
            totalLifts: 23,
            sleeps: 4,
        },
        {
            sourceFile: 'ski_hotels.csv',
            sourceRow: 2,
            country: 'italy',
            resort: 'bardonecchia',
            resortKey: 'italy::bardonecchia',
            hotel: 'Residence Villa Frejus',
            priceGbp: 561,
            distanceFromLiftM: null,
            totalPisteKm: 140,
            totalLifts: 23,
            sleeps: 6,
        },
        {
            sourceFile: 'ski_hotels.csv',
            sourceRow: 3,
            country: 'france',
            resort: 'missing',
            resortKey: 'france::missing',
            hotel: 'Orphan Hotel',
            priceGbp: 499,
        },
    ];

    it('joins hotel offers by resort key and preserves unmatched rows separately', () => {
        const layerData = buildSkiMapLayerData({ resorts, hotels });

        expect(layerData.sourceFiles).toEqual(['ski-resorts.csv', 'resorts.csv']);
        expect(layerData.resorts).toHaveLength(2);
        expect(layerData.hotelGroups).toHaveLength(1);
        expect(layerData.hotelGroups[0]).toMatchObject({
            country: 'Italy',
            resort: 'Bardonecchia',
            sourceFile: 'ski-resorts.csv',
            cheapestPriceGbp: 550,
        });

        expect(layerData.hotelGroups[0].offers).toHaveLength(2);
        expect(layerData.orphanHotels).toHaveLength(1);
        expect(layerData.orphanHotels[0].hotel).toBe('Orphan Hotel');
    });
});

describe('filterSkiResorts', () => {
    const resorts = buildSkiMapLayerData({
        resorts: [
            {
                rank: 1, name: 'Quiet Valley', country: 'France', region: 'Alps',
                latitude: 45, longitude: 6, totalSlopeLengthKm: 180, elevationTopM: 2800,
                price: 55, childFriendly: true, snowparks: true, nightskiing: false,
            },
            {
                rank: 2, name: 'Night Peak', country: 'Austria', region: 'Tyrol',
                latitude: 47, longitude: 11, totalSlopeLengthKm: 80, elevationTopM: 1900,
                price: 35, childFriendly: false, snowparks: false, nightskiing: true,
            },
        ],
        hotels: [],
    }).resorts;

    const noFilters = {
        query: '', country: '', minPisteKm: null, maxDayPassPrice: null, minTopElevationM: null,
        childFriendly: false, snowpark: false, nightSkiing: false,
    };

    it('matches a resort name or region without requiring every catalog field', () => {
        expect(filterSkiResorts(resorts, { ...noFilters, query: 'tyrol' }).map((resort) => resort.name))
            .toEqual(['Night Peak']);
    });

    it('applies terrain, altitude, price, and amenity filters together', () => {
        expect(filterSkiResorts(resorts, {
            ...noFilters,
            country: 'France',
            minPisteKm: 150,
            maxDayPassPrice: 60,
            minTopElevationM: 2500,
            childFriendly: true,
            snowpark: true,
        }).map((resort) => resort.name)).toEqual(['Quiet Valley']);
    });
});
