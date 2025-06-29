// src/lib/dmi/apiClient.ts
const DMI_BASE_URL = "https://dmigw.govcloud.dk/v1/forecastedr";

export async function dmiFetch(endpoint: string, params: Record<string, string>) {
  const url = new URL(`https://dmigw.govcloud.dk/v1/forecastedr/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // console.log("Fetching:", url.toString()); // 👈 Lägg till denna rad

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`DMI API error: ${res.status} ${res.statusText}`);
  return await res.json();
}

