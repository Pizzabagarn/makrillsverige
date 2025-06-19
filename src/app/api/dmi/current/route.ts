// src/app/api/dmi/current/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  const url = new URL("https://dmigw.govcloud.dk/v1/forecastedr/collections/dkss_idw/position");
  url.searchParams.set("coords", `POINT(${lon} ${lat})`);
  url.searchParams.set("crs", "crs84");
  url.searchParams.set("parameter-name", "current-u,current-v");
  url.searchParams.set("model", "dkss_idw");
  url.searchParams.set("format", "CoverageJSON");
  url.searchParams.set("api-key", process.env.DMI_API_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    return NextResponse.json({ error: "DMI API error" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
