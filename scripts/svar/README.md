### SVAR lake map downloader

This tool downloads ZIP packages of lake maps from `https://vattenwebb.smhi.se/svarwebb/` per provided mapping of `waterId -> svarId`. It saves the original ZIP and sidecar metadata. Optional extraction can be enabled.

- Source: `https://vattenwebb.smhi.se/svarwebb/`
- Robots note: The site's robots.txt disallows `/rest` for generic bots. The download endpoint is `/svarwebb/rest/downloadmap/{id}`. Therefore, the script requires an explicit `--allow-rest` flag. Use only if you have consent to automate downloads.

#### Input mapping
Provide a JSON array where each item has:

```
[{ "waterId": "vanern", "svarId": "647666-129906" }]
```

See `scripts/svar/water_svar_ids.sample.json` for an example.

#### Usage

```
pnpm ts-node scripts/svar/download_svar_maps.ts --input scripts/svar/water_svar_ids.sample.json --allow-rest

# Optional flags
--outdir public/data/svar/zips
--concurrency 2
--extract            # expands the ZIP (Windows uses PowerShell Expand-Archive)
--timeout 120000     # ms
--retries 2
```

#### Output structure

```
public/data/svar/zips/
  vanern/
    647666-129906-kartor.zip
    647666-129906-kartor.json    # metadata with headers, hash, timestamps
    647666-129906-kartor/        # if --extract
      *.tif / *.png / *.jpg
```

#### Metadata schema

```
{
  "waterId": "vanern",
  "svarId": "647666-129906",
  "url": "https://vattenwebb.smhi.se/svarwebb/rest/downloadmap/647666-129906",
  "savedAt": "2025-10-28T00:44:00.000Z",
  "statusCode": 200,
  "headers": { /* response headers */ },
  "sha256": "...",
  "extractor": null | "powershell Expand-Archive" | "unzip"
}
```

#### Linking to your app

- Keep your own authoritative water list (with your `waterId` and geometry).
- This downloader preserves your `waterId` in paths so you can show the files on a future water information page.
- No image conversion is performed here; rendering/overlay decisions are deferred to the app.

#### Legal and load

- Be respectful: low concurrency, retries/backoff, clear user agent.
- Cite the source in your UI: "Källa: SMHI/Havs- och vattenmyndigheten (SVAR)".



