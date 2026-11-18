// Piccolo client per le API: aggiunge il token JWT a ogni richiesta e gestisce gli errori
const Api = (() => {
  const logout = () => { localStorage.clear(); location.href = '/'; };
  async function req(method, url, body) {
    const token = localStorage.getItem('token');
    const res = await fetch('/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
      body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== '/auth/login') logout();
    if (!res.ok) throw new Error(data.message || 'Errore di rete');
    return data;
  }
  return { logout, get: (u) => req('GET', u), post: (u, b) => req('POST', u, b), put: (u, b) => req('PUT', u, b), del: (u) => req('DELETE', u) };
})();
