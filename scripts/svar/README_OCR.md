### OCR depth labels (single-image MVP)

This small tool extracts numeric depth labels from one scanned lake map image using Tesseract OCR and writes a GeoJSON with pixel-based points. It does not generate any images.

Prerequisites
- Python 3.9+
- Install packages:
  ```bash
  pip install -r scripts/svar/requirements-ocr.txt
  ```
- Install Tesseract (Windows): see `https://github.com/UB-Mannheim/tesseract/wiki` and ensure `tesseract.exe` is on PATH.

Run example (PowerShell)
```powershell
python scripts/svar/ocr_extract_depth_points.py `
  --image "C:\Users\Super\Documents\GitHub\makrillsverige\public\data\svar\dzi\615365-134524-kartor\preview-2-0170_Havgårdssjön_615365-134524.png" `
  --out   "C:\Users\Super\Documents\GitHub\makrillsverige\public\data\svar\dzi\615365-134524-kartor\preview-2-0170_Havgårdssjön_615365-134524.depth_points.geojson" `
  --lake-id "615365-134524" `
  --min-confidence 0.45
```

Output
- A GeoJSON FeatureCollection where each feature is a `Point` in image pixel coordinates with properties: `lake_id`, `depth_m`, `confidence`, `ocr_bbox`, `source_image`, `coordinate_space`.
- You can visualize these points in your app by mapping pixel coordinates to your viewer coordinate system; georeferencing can be added later.

Notes
- Keep the input as original-resolution scans for the best OCR accuracy.
- If the map has very thin contour lines that confuse OCR, try increasing the morphological opening kernel in the script from `(2,2)` to `(3,3)`.
- This tool does not read from Supabase or require any environment variables.



