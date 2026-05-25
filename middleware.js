export default function middleware(request) {
  const url = new URL(request.url);

  // Interceptar peticiones que comiencen por /api
  if (url.pathname.startsWith('/api')) {
    // Obtener la URL del backend desde la variable de entorno de Vercel
    const backendUrl = process.env.BACKEND_API_URL;

    if (backendUrl) {
      // Extraer la ruta restando el prefijo /api
      const path = url.pathname.replace(/^\/api/, '');
      // Construir la URL final en el servidor externo
      const targetUrl = backendUrl.replace(/\/$/, '') + path + url.search;

      // Crear una respuesta vacía y añadir la cabecera x-middleware-rewrite
      // para hacer reescritura interna (reverse proxy) ocultando la IP
      const response = new Response(null);
      response.headers.set('x-middleware-rewrite', targetUrl);
      return response;
    }
  }
}
