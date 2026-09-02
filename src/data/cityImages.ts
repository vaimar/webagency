// Curated, hotlink-safe city photos (Wikimedia Commons, the lead images used
// by each city's Wikipedia article). Keyed by airport IATA so flight views can
// show where a hub or destination actually is. All URLs verified reachable.

export interface CityImage {
    /** Stable upload.wikimedia.org thumbnail URL. */
    url: string;
    /** City shown in the photo — used for alt text and captions. */
    city: string;
    credit: string;
}

const WIKIMEDIA_CREDIT = 'Photo: Wikimedia Commons';

const LONDON: CityImage = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg',
    city: 'London',
    credit: WIKIMEDIA_CREDIT,
};

const PARIS: CityImage = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/960px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg',
    city: 'Paris',
    credit: WIKIMEDIA_CREDIT,
};

const MILAN: CityImage = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Milan_Cathedral_from_Piazza_del_Duomo.jpg/960px-Milan_Cathedral_from_Piazza_del_Duomo.jpg',
    city: 'Milan',
    credit: WIKIMEDIA_CREDIT,
};

const ROME: CityImage = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/960px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg',
    city: 'Rome',
    credit: WIKIMEDIA_CREDIT,
};

export const AIRPORT_CITY_IMAGES: Record<string, CityImage> = {
    STN: LONDON,
    LGW: LONDON,
    LHR: LONDON,
    CDG: PARIS,
    ORY: PARIS,
    BVA: PARIS,
    BGY: MILAN,
    MXP: MILAN,
    LIN: MILAN,
    FCO: ROME,
    CIA: ROME,
    BCN: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Evening_light_over_Barcelona.jpg/960px-Evening_light_over_Barcelona.jpg',
        city: 'Barcelona',
        credit: WIKIMEDIA_CREDIT,
    },
    AMS: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png/960px-Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png',
        city: 'Amsterdam',
        credit: WIKIMEDIA_CREDIT,
    },
    MAD: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Plaza_Mayor_De_Madrid_%28215862629%29_edited.jpeg/960px-Plaza_Mayor_De_Madrid_%28215862629%29_edited.jpeg',
        city: 'Madrid',
        credit: WIKIMEDIA_CREDIT,
    },
    BER: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Museumsinsel_Berlin_Juli_2021_1_%28cropped%29_b.jpg/960px-Museumsinsel_Berlin_Juli_2021_1_%28cropped%29_b.jpg',
        city: 'Berlin',
        credit: WIKIMEDIA_CREDIT,
    },
    MRS: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Notre-Dame_de_la_Garde_aerial_view_2020.jpeg/960px-Notre-Dame_de_la_Garde_aerial_view_2020.jpeg',
        city: 'Marseille',
        credit: WIKIMEDIA_CREDIT,
    },
    CRL: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Grand_Place_Bruselas_2.jpg/960px-Grand_Place_Bruselas_2.jpg',
        city: 'Brussels',
        credit: WIKIMEDIA_CREDIT,
    },
    HHN: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Frankfurt_Main_August_2020_1.jpg/960px-Frankfurt_Main_August_2020_1.jpg',
        city: 'Frankfurt',
        credit: WIKIMEDIA_CREDIT,
    },
    FRA: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Frankfurt_Main_August_2020_1.jpg/960px-Frankfurt_Main_August_2020_1.jpg',
        city: 'Frankfurt',
        credit: WIKIMEDIA_CREDIT,
    },
    LIS: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/960px-Lisboa_-_Portugal_%2852597836992%29.jpg',
        city: 'Lisbon',
        credit: WIKIMEDIA_CREDIT,
    },
    DUB: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Dublin_-_aerial_-_2025-07-07_01.jpg/960px-Dublin_-_aerial_-_2025-07-07_01.jpg',
        city: 'Dublin',
        credit: WIKIMEDIA_CREDIT,
    },
    ALC: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Alicante%2C_Spain.jpg',
        city: 'Alicante',
        credit: WIKIMEDIA_CREDIT,
    },
    // ── Spain / Balearics / Canaries ──────────────────────────────────────────
    IBZ: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/ForbysIbizaTown_03.jpg/960px-ForbysIbizaTown_03.jpg', city: 'Ibiza', credit: WIKIMEDIA_CREDIT },
    AGP: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Da_Gibralfaro_%28cropped%292.jpg/960px-Da_Gibralfaro_%28cropped%292.jpg', city: 'Málaga', credit: WIKIMEDIA_CREDIT },
    PMI: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Kathedrale_von_Palma.jpg/960px-Kathedrale_von_Palma.jpg', city: 'Palma de Mallorca', credit: WIKIMEDIA_CREDIT },
    MAH: { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Mahon_Hafen.jpg', city: 'Menorca', credit: WIKIMEDIA_CREDIT },
    VLC: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Malvarrosa_Beach%2C_Valencia%2C_Spain_%2829812271043%29.jpg/960px-Malvarrosa_Beach%2C_Valencia%2C_Spain_%2829812271043%29.jpg', city: 'Valencia', credit: WIKIMEDIA_CREDIT },
    SVQ: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Sevilla_Cathedral_-_Southeast.jpg/960px-Sevilla_Cathedral_-_Southeast.jpg', city: 'Seville', credit: WIKIMEDIA_CREDIT },
    LPA: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Canteras_EM1B2907_%2840642755393%29.jpg/960px-Canteras_EM1B2907_%2840642755393%29.jpg', city: 'Gran Canaria', credit: WIKIMEDIA_CREDIT },
    TFS: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/At_Palmetum_de_Santa_Cruz_de_Tenerife_2022_028.jpg/960px-At_Palmetum_de_Santa_Cruz_de_Tenerife_2022_028.jpg', city: 'Tenerife', credit: WIKIMEDIA_CREDIT },
    // ── Portugal ──────────────────────────────────────────────────────────────
    OPO: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/960px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG', city: 'Porto', credit: WIKIMEDIA_CREDIT },
    FAO: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/2021_12_12_arne_mueseler_08_17_0576.jpg/960px-2021_12_12_arne_mueseler_08_17_0576.jpg', city: 'Faro', credit: WIKIMEDIA_CREDIT },
    // ── France ────────────────────────────────────────────────────────────────
    NCE: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Promenade_des_Anglais_Nice_IMG_1255.jpg/960px-Promenade_des_Anglais_Nice_IMG_1255.jpg', city: 'Nice', credit: WIKIMEDIA_CREDIT },
    LYS: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Lyon-part-dieu-2023.jpg/960px-Lyon-part-dieu-2023.jpg', city: 'Lyon', credit: WIKIMEDIA_CREDIT },
    TLS: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Toulouse_-_vue_du_Vieux_Toulouse_depuis_St_Sernin_06.jpg/960px-Toulouse_-_vue_du_Vieux_Toulouse_depuis_St_Sernin_06.jpg', city: 'Toulouse', credit: WIKIMEDIA_CREDIT },
    BOD: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Bordeaux_Place_de_la_Bourse_de_nuit.jpg/960px-Bordeaux_Place_de_la_Bourse_de_nuit.jpg', city: 'Bordeaux', credit: WIKIMEDIA_CREDIT },
    // ── Italy ─────────────────────────────────────────────────────────────────
    NAP: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Napoli_-_Maschio_Angioino_-_202209302342_3.jpg/960px-Napoli_-_Maschio_Angioino_-_202209302342_3.jpg', city: 'Naples', credit: WIKIMEDIA_CREDIT },
    BLQ: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Torri_di_Bologna%2C_Bologna.jpg/960px-Torri_di_Bologna%2C_Bologna.jpg', city: 'Bologna', credit: WIKIMEDIA_CREDIT },
    CTA: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Catania_vista_dall%27alto_e_il_vulcano_Etna_a_sovrastarla.jpg/960px-Catania_vista_dall%27alto_e_il_vulcano_Etna_a_sovrastarla.jpg', city: 'Catania', credit: WIKIMEDIA_CREDIT },
    // ── Greece ────────────────────────────────────────────────────────────────
    ATH: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Monastiraki_Square_and_Acropolis_in_Athens_%2844149181684%29.jpg/960px-Monastiraki_Square_and_Acropolis_in_Athens_%2844149181684%29.jpg', city: 'Athens', credit: WIKIMEDIA_CREDIT },
    JTR: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Oia_sunset_-_panoramio_%282%29.jpg/960px-Oia_sunset_-_panoramio_%282%29.jpg', city: 'Santorini', credit: WIKIMEDIA_CREDIT },
    RHO: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Rhodes_sentinel2_%28cropped%29.jpg/960px-Rhodes_sentinel2_%28cropped%29.jpg', city: 'Rhodes', credit: WIKIMEDIA_CREDIT },
    CFU: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Pontikonisi.jpg/960px-Pontikonisi.jpg', city: 'Corfu', credit: WIKIMEDIA_CREDIT },
    SKG: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Tessaloniki_BW_2017-10-05_18-22-47.jpg/960px-Tessaloniki_BW_2017-10-05_18-22-47.jpg', city: 'Thessaloniki', credit: WIKIMEDIA_CREDIT },
    // ── Central Europe ────────────────────────────────────────────────────────
    VIE: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Schoenbrunn_philharmoniker_2012.jpg/960px-Schoenbrunn_philharmoniker_2012.jpg', city: 'Vienna', credit: WIKIMEDIA_CREDIT },
    PRG: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Prague_%286365119737%29.jpg/960px-Prague_%286365119737%29.jpg', city: 'Prague', credit: WIKIMEDIA_CREDIT },
    BUD: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/View_from_Gell%C3%A9rt_Hill_to_the_Danube%2C_Hungary_-_Budapest_%2828493220635%29.jpg/960px-View_from_Gell%C3%A9rt_Hill_to_the_Danube%2C_Hungary_-_Budapest_%2828493220635%29.jpg', city: 'Budapest', credit: WIKIMEDIA_CREDIT },
    KRK: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Krakow_Rynek_Glowny_panorama_2.jpg/960px-Krakow_Rynek_Glowny_panorama_2.jpg', city: 'Kraków', credit: WIKIMEDIA_CREDIT },
    CPH: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/2018_-_Christiansborg_from_the_Marble_Bridge.jpg/960px-2018_-_Christiansborg_from_the_Marble_Bridge.jpg', city: 'Copenhagen', credit: WIKIMEDIA_CREDIT },
    // ── Mediterranean / North Africa ──────────────────────────────────────────
    MLA: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/St_Sebastian_Curtain_%28cropped%29.jpg/960px-St_Sebastian_Curtain_%28cropped%29.jpg', city: 'Malta', credit: WIKIMEDIA_CREDIT },
    RAK: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Pavillon_Menarag%C3%A4rten.jpg/960px-Pavillon_Menarag%C3%A4rten.jpg', city: 'Marrakesh', credit: WIKIMEDIA_CREDIT },
};

export const getCityImageForAirport = (iata?: string | null): CityImage | null => {
    if (!iata) {
        return null;
    }
    return AIRPORT_CITY_IMAGES[iata.trim().toUpperCase()] ?? null;
};

// Name-based lookup for surfaces without an IATA code (e.g. Trip Ledger stops
// titled "Night in Paris"). Matches a known city name as a whole word, so a
// stop that mentions a covered city gets its photo. First match wins.
const NAME_INDEX: Array<{ re: RegExp; image: CityImage }> = (() => {
    const seen = new Set<string>();
    const out: Array<{ re: RegExp; image: CityImage }> = [];
    const escape = (token: string) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const add = (token: string, image: CityImage) => {
        const key = token.toLowerCase();
        if (!token || seen.has(key)) {
            return;
        }
        seen.add(key);
        out.push({ re: new RegExp(`(^|[^\\p{L}])${escape(token)}([^\\p{L}]|$)`, 'iu'), image });
    };
    for (const image of Object.values(AIRPORT_CITY_IMAGES)) {
        add(image.city, image);
    }
    // Common aliases / notable tokens for multi-word or alternately-spelled cities.
    const alias = (token: string, city: string) => {
        const image = Object.values(AIRPORT_CITY_IMAGES).find((entry) => entry.city === city);
        if (image) {
            add(token, image);
        }
    };
    alias('Palma', 'Palma de Mallorca');
    alias('Mallorca', 'Palma de Mallorca');
    alias('Majorca', 'Palma de Mallorca');
    alias('Marrakech', 'Marrakesh');
    alias('Valletta', 'Malta');
    return out;
})();

export const getCityImageByName = (text?: string | null): CityImage | null => {
    if (!text) {
        return null;
    }
    for (const { re, image } of NAME_INDEX) {
        if (re.test(text)) {
            return image;
        }
    }
    return null;
};
