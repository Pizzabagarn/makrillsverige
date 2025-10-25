export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}, retries = 2, backoffMs = 300): Promise<Response> {
  try {
    const res = await fetch(input, init);
    if (!res.ok && retries > 0 && (res.status >= 500 || res.status === 429)) {
      await new Promise(r => setTimeout(r, backoffMs));
      return fetchWithRetry(input, init, retries - 1, Math.min(backoffMs * 2, 2000));
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoffMs));
      return fetchWithRetry(input, init, retries - 1, Math.min(backoffMs * 2, 2000));
    }
    throw err;
  }
}


