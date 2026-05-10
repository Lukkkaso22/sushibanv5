// api/sheets.js — Vercel serverless function
const SHEET_ID_DEFAULT = '1ytfLJDMHuvg7kcYq_Y1G5hJx2BritUV4C4RxDyBjcZI';

function serialToIso(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    const ms = Math.round((val - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const { sheet, from, to } = req.query;
  const SHEET_ID = process.env.SHEET_ID || SHEET_ID_DEFAULT;
  const API_KEY  = process.env.GOOGLE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Falta GOOGLE_API_KEY.' });
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

      // Normalize fecha
      obj.fecha = serialToIso(obj.fecha);

      // Normalize hora_apertura
      if (typeof obj.hora_apertura === 'number') {
        obj.hora_apertura = serialToTime(obj.hora_apertura);
      } else {
        obj.hora_apertura = String(obj.hora_apertura ?? '');
      }

      // FIX: en algunos registros el nombre del local quedó en hora_apertura
      // en vez de local (bug en el Apps Script). Lo detectamos y corregimos.
      if (!obj.local && obj.hora_apertura && obj.hora_apertura.startsWith('Sushiban')) {
        obj.local = obj.hora_apertura;
        obj.hora_apertura = '';
      }

      // Date filter
      if (filterFrom || to) {
        const f = obj.fecha;
        if (!f) continue;
        if (filterFrom && f < filterFrom) continue;
        if (to       && f > to)          continue;
      }

      objects.push(obj);
    }

    return res.json(objects);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
