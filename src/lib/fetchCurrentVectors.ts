// src/lib/fetchCurrentVectors.ts
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env.local') });
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

    const res = await fetch(url.toString());
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
