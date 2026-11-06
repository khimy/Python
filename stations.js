// Saudi Arabia Weather Stations
// Sources: National Center for Meteorology (NCM), NOAA, WMO
const SAUDI_WEATHER_STATIONS = [
    {
        id: "OERK",
        name: "Riyadh - King Khalid International",
        city: "Riyadh",
        lat: 24.9576,
        lon: 46.6988,
        elevation: 620,
        wmo: "40437",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEJN",
        name: "Jeddah - King Abdulaziz International",
        city: "Jeddah",
        lat: 21.6796,
        lon: 39.1565,
        elevation: 17,
        wmo: "41024",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEDF",
        name: "Dammam - King Fahd International",
        city: "Dammam",
        lat: 26.4712,
        lon: 49.7979,
        elevation: 22,
        wmo: "40417",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEMA",
        name: "Madinah - Prince Mohammad Bin Abdulaziz",
        city: "Madinah",
        lat: 24.5534,
        lon: 39.7050,
        elevation: 636,
        wmo: "40430",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEMK",
        name: "Makkah Station",
        city: "Makkah",
        lat: 21.3891,
        lon: 39.8579,
        elevation: 240,
        wmo: "41030",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OETF",
        name: "Taif Regional Airport",
        city: "Taif",
        lat: 21.4834,
        lon: 40.5434,
        elevation: 1478,
        wmo: "41036",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEAB",
        name: "Abha Regional Airport",
        city: "Abha",
        lat: 18.2404,
        lon: 42.6567,
        elevation: 2093,
        wmo: "41112",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OETB",
        name: "Tabuk Regional Airport",
        city: "Tabuk",
        lat: 28.3654,
        lon: 36.6189,
        elevation: 770,
        wmo: "40375",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEHL",
        name: "Hail Regional Airport",
        city: "Hail",
        lat: 27.4382,
        lon: 41.6862,
        elevation: 1015,
        wmo: "40394",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEBA",
        name: "Al Baha Airport",
        city: "Al Baha",
        lat: 20.2961,
        lon: 41.6343,
        elevation: 1652,
        wmo: "41055",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OENG",
        name: "Najran Airport",
        city: "Najran",
        lat: 17.6114,
        lon: 44.4193,
        elevation: 1214,
        wmo: "41128",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEJZ",
        name: "Jizan - King Abdullah bin Abdulaziz",
        city: "Jizan",
        lat: 16.9011,
        lon: 42.5858,
        elevation: 6,
        wmo: "41140",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OESK",
        name: "Al Jouf - Sakaka Airport",
        city: "Sakaka",
        lat: 29.7851,
        lon: 40.0999,
        elevation: 689,
        wmo: "40361",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEAR",
        name: "Arar Airport",
        city: "Arar",
        lat: 30.9066,
        lon: 41.1382,
        elevation: 550,
        wmo: "40357",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEQS",
        name: "Qassim - Prince Nayef Airport",
        city: "Buraidah",
        lat: 26.3027,
        lon: 43.7714,
        elevation: 648,
        wmo: "40405",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEYN",
        name: "Yanbu Airport",
        city: "Yanbu",
        lat: 24.1442,
        lon: 38.0634,
        elevation: 8,
        wmo: "40439",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEKK",
        name: "Al Ahsa Airport",
        city: "Al Ahsa (Hofuf)",
        lat: 25.2854,
        lon: 49.4852,
        elevation: 178,
        wmo: "40420",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEWD",
        name: "Wadi Al Dawasir Airport",
        city: "Wadi Al Dawasir",
        lat: 20.5042,
        lon: 45.1996,
        elevation: 617,
        wmo: "41061",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OESH",
        name: "Sharurah Airport",
        city: "Sharurah",
        lat: 17.4669,
        lon: 47.1214,
        elevation: 725,
        wmo: "41136",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OERF",
        name: "Rafha Airport",
        city: "Rafha",
        lat: 29.6264,
        lon: 43.4906,
        elevation: 444,
        wmo: "40362",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEGN",
        name: "Al Wajh Airport",
        city: "Al Wajh",
        lat: 26.1986,
        lon: 36.4764,
        elevation: 20,
        wmo: "40400",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEBH",
        name: "Bisha Airport",
        city: "Bisha",
        lat: 19.9844,
        lon: 42.6209,
        elevation: 1163,
        wmo: "41084",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEDR",
        name: "Dhahran Air Base",
        city: "Dhahran",
        lat: 26.2654,
        lon: 50.1521,
        elevation: 17,
        wmo: "40416",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEKJ",
        name: "Al Kharj Station",
        city: "Al Kharj",
        lat: 24.0627,
        lon: 47.5880,
        elevation: 430,
        wmo: "—",
        type: "Climatological",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEJU",
        name: "Jubail Station",
        city: "Jubail",
        lat: 27.0380,
        lon: 49.4051,
        elevation: 8,
        wmo: "—",
        type: "Climatological",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OETR",
        name: "Turaif Airport",
        city: "Turaif",
        lat: 31.6927,
        lon: 38.7312,
        elevation: 854,
        wmo: "40356",
        type: "Synoptic",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "QNFD",
        name: "Al Qunfudhah Station",
        city: "Al Qunfudhah",
        lat: 19.1283,
        lon: 41.0790,
        elevation: 6,
        wmo: "41080",
        type: "Climatological",
        authority: "National Center for Meteorology (NCM)"
    },
    {
        id: "OEUH",
        name: "Unayzah Station",
        city: "Unayzah",
        lat: 26.0844,
        lon: 43.9936,
        elevation: 600,
        wmo: "40407",
        type: "Climatological",
        authority: "National Center for Meteorology (NCM)"
    }
];

// More NCM synoptic stations that report to the WMO (coordinates from NOAA NCEI station history)
SAUDI_WEATHER_STATIONS.push(
    { id: "OEGT", name: "Guriat Domestic Airport", city: "Guriat", lat: 31.4120, lon: 37.2790, elevation: 510, wmo: "40360", type: "Synoptic", authority: "National Center for Meteorology (NCM)" },
    { id: "OEPA", name: "Al Qaisumah - Hafr Al Batin Airport", city: "Hafr Al Batin", lat: 28.3350, lon: 46.1250, elevation: 358, wmo: "40373", type: "Synoptic", authority: "National Center for Meteorology (NCM)" },
    { id: "OEAO", name: "AlUla International Airport", city: "AlUla", lat: 26.4830, lon: 38.1190, elevation: 623, wmo: "40401", type: "Synoptic", authority: "National Center for Meteorology (NCM)" },
    { id: "OEDM", name: "Al Dawadmi - Prince Salman Airport", city: "Al Dawadmi", lat: 24.4500, lon: 44.1210, elevation: 922, wmo: "40414", type: "Synoptic", authority: "National Center for Meteorology (NCM)" },
    { id: "OEKM", name: "Khamis Mushait - King Khalid Air Base", city: "Khamis Mushait", lat: 18.2970, lon: 42.8040, elevation: 2066, wmo: "41114", type: "Synoptic", authority: "National Center for Meteorology (NCM)" }
);

// NOAA NCEI "Global Summary of the Day" (GSOD) identifiers. These carry the daily
// observations that NCM stations exchange through the WMO. null = no WMO observations.
const NCM_GSOD_IDS = {
    OERK: "40437099999", OEJN: "41024099999", OEDF: "40415099999", OEMA: "40430099999",
    OEMK: "41031099999", // Makkah: nearest NCM synoptic station is Mina, 3 km away
    OETF: "41036099999", OEAB: "41112099999", OETB: "40375099999", OEHL: "40394099999",
    OEBA: "41055099999", OENG: "41128099999", OEJZ: "41140099999", OESK: "40361099999",
    OEAR: "40357099999", OEQS: "40405099999", OEYN: "40439099999", OEKK: "40420099999",
    OEWD: "41061099999", OESH: "41136099999", OERF: "40362099999", OEGN: "40400099999",
    OEBH: "41084099999", OEDR: "40416099999", OEJU: "40419499999", OETR: "40356099999",
    OEGT: "40360099999", OEPA: "40373099999", OEAO: "40401099999", OEDM: "40414099999",
    OEKM: "41114099999",
    OEKJ: null, QNFD: null, OEUH: null
};
SAUDI_WEATHER_STATIONS.forEach(s => { s.gsod = NCM_GSOD_IDS[s.id] || null; });
