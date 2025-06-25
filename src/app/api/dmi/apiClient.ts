// src/lib/dmi/apiClient.ts
const DMI_BASE_URL = "https://dmigw.govcloud.dk/v1/forecastedr";

export async function dmiFetch(endpoint: string, params: Record<string, string>) {
  const url = new URL(`https://dmigw.govcloud.dk/v1/forecastedr/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // Lägg till API-nyckel för autentisering enligt DMI:s krav
  const apiKey = process.env.DMI_API_KEY;
  if (apiKey) {
    url.searchParams.set('api-key', apiKey);
  } else {
    console.warn('⚠️ DMI_API_KEY saknas - API-anrop kommer att misslyckas');
  }

  console.log("Fetching:", url.toString().replace(/api-key=[^&]+/, 'api-key=***')); // Dölj API-nyckel i loggar

  const res = await fetch(url.toString());
  if (!res.ok) {
    // Try to get more detailed error information
    let errorDetails = '';
    try {
      const errorBody = await res.text();
      errorDetails = errorBody ? ` - ${errorBody}` : '';
    } catch (e) {
      // Ignore errors when trying to read response body
    }
    throw new Error(`DMI API error: ${res.status} ${res.statusText}${errorDetails}`);
  }
  return await res.json();
}

