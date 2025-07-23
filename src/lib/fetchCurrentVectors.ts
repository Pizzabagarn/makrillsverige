// src/lib/fetchCurrentVectors.ts
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

export type CurrentVector = {
    u: number | null;
    v: number | null;
    time: string;
};

type DMIResponse = {
    domain?: {
        axes?: {
            t?: { values?: string[] };
        };
    };
    ranges?: {
        "current-u"?: { values?: number[] };
        "current-v"?: { values?: number[] };
    };
};

export async function fetchCurrentVectors(lat: number, lon: number): Promise<CurrentVector[]> {
    const apiKey = process.env.DMI_API_KEY;
    if (!apiKey) throw new Error("DMI_API_KEY saknas");

    const url = new URL("https://dmigw.govcloud.dk/v1/forecastedr/collections/dkss_idw/position");
    url.searchParams.set("coords", `POINT(${lon} ${lat})`);
    url.searchParams.set("crs", "crs84");
    url.searchParams.set("parameter-name", "current-u,current-v");
    url.searchParams.set("model", "dkss_idw");
    url.searchParams.set("format", "CoverageJSON");
    url.searchParams.set("api-key", apiKey);

    // Use built-in fetch in Node.js 18+ or imported fetch
    const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
    const res = await fetchFn(url.toString());
    if (!res.ok) throw new Error(`API-fel (${res.status}) vid ${lat},${lon}`);

    const data = await res.json() as DMIResponse;

    const times: string[] = data.domain?.axes?.t?.values ?? [];
    const uArray: number[] = data.ranges?.["current-u"]?.values ?? [];
    const vArray: number[] = data.ranges?.["current-v"]?.values ?? [];

    if (!uArray.length || !vArray.length || uArray.length !== vArray.length) {
        throw new Error(`Felaktiga u/v-värden vid ${lat},${lon}`);
    }

    return uArray.map((u: number, i: number) => ({
        u,
        v: vArray[i],
        time: times[i] ?? ""
    }));
}
