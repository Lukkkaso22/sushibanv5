// api/sheets.js  — Vercel serverless function
// Lee Google Sheets con la API oficial (sin límite de filas)
// Variables de entorno requeridas en Vercel:
//   GOOGLE_API_KEY  → API key de Google Cloud (Sheets API habilitada)

const SHEET_ID_DEFAULT = '1ytfLJDMHuvg7kcYq_Y1G5hJx2BritUV4C4RxDyBjcZI';

// Convierte serial de fecha de Google Sheets (ej: 46384) a "YYYY-MM-DD"
function serialToIso(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    const ms = Math.round((val - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

// Convierte serial de tiempo (ej: 0.583) a "HH:MM"
function serialToTime(val) {
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(val ?? '');
}

export default async function handler(req, res) {
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
      `${encodeURIComponent(sheetName)}?key=${API_KEY}` +
      `&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

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

    // Buffer: 2 días antes del from para cubrir edges de zona horaria
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

      // Normalizar fecha (puede venir como serial numérico o string)
      obj.fecha = serialToIso(obj.fecha);

      // Normalizar hora_apertura si viene como serial de tiempo
      if (obj.hora_apertura !== undefined) {
        obj.hora_apertura = serialToTime(obj.hora_apertura);
      }

      // Filtro server-side por fecha
      if (filterFrom || to) {
        const f = obj.fecha;
        if (!f) continue;
        if (filterFrom && f < filterFrom) continue;
        if (to       && f > to)          continue;
      }

      objects.push(obj);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res.json(objects);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
