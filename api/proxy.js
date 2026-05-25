export default async function handler(req, res) {
  // Cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Manejar preflight request (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    res.status(500).json({ error: 'BACKEND_API_URL environment variable is not defined' });
    return;
  }

  // Obtener la ruta del recurso desde req.url
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api/, '');
  const targetUrl = backendUrl.replace(/\/$/, '') + path + url.search;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {},
    };

    // Copiar cabeceras del cliente al backend, ignorando las de infraestructura
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'host' && lowerKey !== 'connection' && lowerKey !== 'content-length') {
        fetchOptions.headers[lowerKey] = value;
      }
    }

    // Configurar el cuerpo de la petición (si aplica)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (typeof req.body === 'object' && req.body !== null) {
        fetchOptions.body = JSON.stringify(req.body);
        fetchOptions.headers['content-type'] = 'application/json';
      } else {
        fetchOptions.body = req.body;
      }
    }

    // Realizar la llamada HTTP saliente al servidor de producción
    const backendResponse = await fetch(targetUrl, fetchOptions);
    const contentType = backendResponse.headers.get('content-type') || '';

    // Propagar el código de estado HTTP
    res.status(backendResponse.status);

    // Propagar las cabeceras de respuesta del backend
    for (const [key, value] of backendResponse.headers.entries()) {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    }

    // Responder según el tipo de contenido
    if (contentType.includes('application/json')) {
      const json = await backendResponse.json();
      res.json(json);
    } else {
      const text = await backendResponse.text();
      res.send(text);
    }
  } catch (error) {
    console.error('Error en el Proxy de Vercel:', error);
    res.status(500).json({ error: 'Proxy Error', details: error.message });
  }
}
