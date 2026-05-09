// api/sheets.js  — Vercel serverless function
// Lee Google Sheets con la API oficial (sin límite de filas)
// Variables de entorno requeridas en Vercel:
//   GOOGLE_API_KEY  → API key de Google Cloud (Sheets API habilitada)
//   SHEET_ID        → ID del Google Sheet (opcional, tiene default)

const SHEET_ID_DEFAULT = '1ytfLJDMHuvg7kcYq_Y1G5hJx2BritUV4C4RxDyBjcZI';

export default async function handler(req, res) {
  // CORS — permite que el mismo dominio llame al endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { sheet, from, to } = req.query;
  const SHEET_ID = process.env.SHEET_ID || SHEET_ID_DEFAULT;
  const API_KEY  = process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Falta GOOGLE_API_KEY en las variables de entorno de Vercel.' });
  }

  const sheetName = sheet || '📋 ordenes';

  try {
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/` +
      `${encodeURIComponent(sheetName)}?key=${API_KEY}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Google Sheets API: ${errText}` });
    }

    const data = await response.json();

    if (!data.values || data.values.length < 2) {
      return res.json([]);
    }

    const [rawHeaders, ...rows] = data.values;
    const headers = rawHeaders.map(h => String(h ?? '').trim());

    // Compute date buffer (2 days before 'from' to handle timezone edges)
    let filterFrom = null;
    if (from) {
      const buf = new Date(from);
      buf.setDate(buf.getDate() - 2);
      filterFrom = buf.toISOString().slice(0, 10);
    }

    const objects = [];
    for (const row of rows) {
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        if (headers[i]) obj[headers[i]] = row[i] !== undefined ? row[i] : '';
      }

      // Server-side date filter — skip rows outside range
      if (filterFrom || to) {
        const fecha = String(obj.fecha ?? '').slice(0, 10);
        if (!fecha) continue;
        if (filterFrom && fecha < filterFrom) continue;
        if (to       && fecha > to)          continue;
      }

      objects.push(obj);
    }

    // Cache 5 minutes on CDN
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res.json(objects);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
