(() => {
  if (!localStorage.getItem('token')) { location.href = '/'; return; }
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const ST = { nuovo: 'Nuovo', lavorazione: 'In lavorazione', spedito: 'Spedito', consegnato: 'Consegnato', annullato: 'Annullato' };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const P = {
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  };
  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
  const SC = { nuovo: '#0EA5E9', lavorazione: '#F59E0B', spedito: '#8B5CF6', consegnato: '#10B981', annullato: '#F43F5E' };
  const PAL = ['#6366F1', '#14B8A6', '#F59E0B', '#EC4899', '#0EA5E9'];

  $('#who').textContent = `${user.name || ''} (${isAdmin ? 'admin' : 'operatore'})`;
  $('#logout').onclick = Api.logout;
  if (isAdmin) $('#nav-users').hidden = false;
  document.querySelectorAll('[data-ic]').forEach((e) => e.insertAdjacentHTML('afterbegin', icon(e.dataset.ic)));

  function toast(msg, type = '') {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + type;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 3000);
  }

  // Finestra modale riutilizzabile per tutti i form
  function openModal(title, body, onSubmit, label = 'Salva') {
    $('#mtitle').textContent = title; $('#mbody').innerHTML = body; $('#merr').textContent = '';
    $('#msubmit').textContent = label;
    $('#mform').onsubmit = async (e) => {
      e.preventDefault(); $('#msubmit').disabled = true;
      try { if ((await onSubmit(new FormData($('#mform')))) !== false) $('#modal').close(); }
      catch (err) { $('#merr').textContent = err.message; }
      finally { $('#msubmit').disabled = false; }
    };
    $('#modal').showModal();
  }
  $('#mcancel').onclick = () => $('#modal').close();

  const table = (heads, rows, empty, st = {}) => rows.length
    ? `<div class="tw"><table><thead><tr>${heads.map((h) => { const [label, key] = [].concat(h); const on = st.sort === key; return key ? `<th class="sortable" data-sort="${key}" aria-sort="${on ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}${on ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>` : `<th>${label}</th>`; }).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<p class="empty">${empty}</p>`;
  const pager = (r) => r.total ? `<div class="pager"><span class="muted">${r.total} risultati · pagina ${r.page} di ${r.pages}</span><span><button class="btn btn-ghost" data-page="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>Precedente</button> <button class="btn btn-ghost" data-page="${r.page + 1}" ${r.page >= r.pages ? 'disabled' : ''}>Successiva</button></span></div>` : '';
  // Gestisce i clic su intestazioni (ordinamento) e pulsanti di pagina
  const listClicks = (el, st, load) => el.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]'), pg = e.target.closest('[data-page]');
    if (th) { st.dir = st.sort === th.dataset.sort && st.dir === 'asc' ? 'desc' : 'asc'; st.sort = th.dataset.sort; st.page = 1; load(); }
    if (pg && !pg.disabled) { st.page = Number(pg.dataset.page); load(); }
  });

  // Vista generica per le entità con elenco, ricerca, ordinamento, pagine, creazione, modifica ed eliminazione
  const crudView = (cfg) => async (root) => {
    root.innerHTML = `<div class="head"><h1>${cfg.title}</h1><button class="btn btn-primary" id="add">${icon('plus')}${cfg.addLabel}</button></div>
      <input class="search" id="q" type="search" placeholder="${cfg.placeholder}" aria-label="Cerca"><div id="list"></div>`;
    const st = { page: 1, sort: 'createdAt', dir: 'desc' };
    let rows = [];
    const fields = (it = {}) => cfg.fields.map((f) => `<label>${f.label}<input name="${f.name}" type="${f.type || 'text'}" ${f.attrs || ''} value="${esc(it[f.name])}" ${f.req ? 'required' : ''}></label>`).join('');
    const load = async () => {
      const r = await Api.get(`${cfg.path}?q=${encodeURIComponent($('#q').value.trim())}&page=${st.page}&limit=8&sort=${st.sort}&dir=${st.dir}`);
      if (st.page > r.pages) { st.page = r.pages; return load(); }
      rows = r.items;
      $('#list').innerHTML = table([...cfg.heads, ''], rows.map((x) =>
        `<tr>${cfg.cells(x).map((c) => `<td>${c}</td>`).join('')}<td class="actions"><button class="btn btn-ghost" data-edit="${x._id}">${icon('edit')}Modifica</button> ${isAdmin ? `<button class="btn btn-ghost danger" data-del="${x._id}">${icon('trash')}Elimina</button>` : ''}</td></tr>`), cfg.empty, st) + pager(r);
    };
    const save = (id) => async (fd) => { const b = Object.fromEntries(fd); await (id ? Api.put(`${cfg.path}/${id}`, b) : Api.post(cfg.path, b)); toast('Salvato'); await load(); };
    $('#add').onclick = () => openModal(cfg.addLabel, fields(), save());
    $('#q').oninput = debounce(() => { st.page = 1; load(); }, 250);
    listClicks($('#list'), st, load);
    $('#list').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-edit],button[data-del]');
      if (!b) return;
      if (b.dataset.edit) openModal('Modifica', fields(rows.find((r) => r._id === b.dataset.edit)), save(b.dataset.edit));
      else if (confirm('Eliminare definitivamente questo elemento?')) {
        try { await Api.del(`${cfg.path}/${b.dataset.del}`); toast('Eliminato'); await load(); } catch (err) { toast(err.message, 'err'); }
      }
    });
    await load();
  };

  const customers = crudView({
    title: 'Clienti', addLabel: 'Nuovo cliente', path: '/customers', placeholder: 'Cerca per nome, email o città',
    heads: [['Nome', 'name'], 'Email', 'Telefono', ['Città', 'city']], empty: 'Nessun cliente trovato. Aggiungine uno con “Nuovo cliente”.',
    fields: [{ name: 'name', label: 'Nome', req: 1 }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Telefono' }, { name: 'city', label: 'Città' }],
    cells: (c) => [esc(c.name), esc(c.email), esc(c.phone), esc(c.city)],
  });
  const products = crudView({
    title: 'Prodotti', addLabel: 'Nuovo prodotto', path: '/products', placeholder: 'Cerca per nome o codice',
    heads: [['Nome', 'name'], 'Codice', ['Prezzo', 'price'], ['Giacenza', 'stock']], empty: 'Nessun prodotto trovato. Aggiungine uno con “Nuovo prodotto”.',
    fields: [{ name: 'name', label: 'Nome', req: 1 }, { name: 'sku', label: 'Codice', req: 1 }, { name: 'price', label: 'Prezzo (€)', type: 'number', attrs: 'min="0" step="0.01"', req: 1 }, { name: 'stock', label: 'Giacenza', type: 'number', attrs: 'min="0" step="1"' }],
    cells: (p) => [esc(p.name), esc(p.sku), money(p.price), p.stock <= 5 ? `<span class="badge">${p.stock} · in esaurimento</span>` : p.stock],
  });

  // Scheda dell'ordine, stampabile come riepilogo/fattura proforma
  async function showOrder(id) {
    const o = await Api.get('/orders/' + id);
    const iva = Math.round(o.total * 22) / 100, c = o.customer || {};
    openModal('Ordine #' + o._id.slice(-6).toUpperCase(), `<div class="invoice">
      <div class="inv-head"><div><b>Gestionale · Piccola impresa</b><br><span class="muted">Riepilogo ordine</span></div>
      <div class="inv-meta">Data: ${new Date(o.createdAt).toLocaleDateString('it-IT')}<br>Stato: <span class="badge-st st-${o.status}">${ST[o.status]}</span></div></div>
      <p><b>Cliente</b><br>${esc(c.name)}<br>${esc(c.email)} ${esc(c.phone)}<br>${esc(c.city)}</p>
      ${table(['Prodotto', 'Prezzo', 'Q.tà', 'Importo'], o.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`), 'Nessuna riga.')}
      <dl class="sum"><dt>Imponibile</dt><dd>${money(o.total)}</dd><dt>IVA 22%</dt><dd>${money(iva)}</dd><dt>Totale</dt><dd><b>${money(o.total + iva)}</b></dd></dl></div>`,
      () => { window.print(); return false; }, 'Stampa');
  }

  async function orders(root) {
    root.innerHTML = `<div class="head"><h1>Ordini</h1><button class="btn btn-primary" id="add">${icon('plus')}Nuovo ordine</button></div>
      <div class="filters"><select id="flt" aria-label="Filtra per stato"><option value="">Tutti gli stati</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label>Dal <input type="date" id="from"></label><label>Al <input type="date" id="to"></label><button class="btn btn-ghost" id="reset">Azzera filtri</button></div><div id="list"></div>`;
    const st = { page: 1, sort: 'createdAt', dir: 'desc' };
    const load = async () => {
      const qs = `status=${$('#flt').value}&from=${$('#from').value}&to=${$('#to').value}&page=${st.page}&limit=8&sort=${st.sort}&dir=${st.dir}`;
      const r = await Api.get('/orders?' + qs);
      if (st.page > r.pages) { st.page = r.pages; return load(); }
      $('#list').innerHTML = table([['Data', 'createdAt'], 'Cliente', 'Prodotti', ['Totale', 'total'], 'Stato', ''], r.items.map((o) =>
        `<tr><td>${new Date(o.createdAt).toLocaleDateString('it-IT')}</td><td>${esc(o.customer?.name)}</td>
        <td>${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ')}</td><td>${money(o.total)}</td>
        <td><select class="st st-${o.status}" data-st="${o._id}" ${o.status === 'annullato' ? 'disabled' : ''} aria-label="Stato ordine">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="actions"><button class="btn btn-ghost" data-view="${o._id}">${icon('eye')}Dettagli</button> ${isAdmin && o.status === 'annullato' ? `<button class="btn btn-ghost danger" data-del="${o._id}">${icon('trash')}Elimina</button>` : ''}</td></tr>`),
        'Nessun ordine trovato con questi filtri.', st) + pager(r);
    };
    const refilter = () => { st.page = 1; load(); };
    ['#flt', '#from', '#to'].forEach((s) => ($(s).onchange = refilter));
    $('#reset').onclick = () => { $('#flt').value = $('#from').value = $('#to').value = ''; refilter(); };
    listClicks($('#list'), st, load);
    $('#list').onchange = async (e) => {
      if (!e.target.dataset.st) return;
      try { await Api.put(`/orders/${e.target.dataset.st}/status`, { status: e.target.value }); toast('Stato aggiornato'); } catch (err) { toast(err.message, 'err'); }
      await load();
    };
    $('#list').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-del],button[data-view]');
      if (!b) return;
      if (b.dataset.view) return showOrder(b.dataset.view).catch((err) => toast(err.message, 'err'));
      if (confirm("Eliminare definitivamente l'ordine?")) { try { await Api.del('/orders/' + b.dataset.del); toast('Eliminato'); await load(); } catch (err) { toast(err.message, 'err'); } }
    });
    $('#add').onclick = async () => {
      const [cs, ps] = await Promise.all([Api.get('/customers'), Api.get('/products')]);
      if (!cs.length || !ps.length) return toast('Servono almeno un cliente e un prodotto', 'err');
      const opts = ps.map((p) => `<option value="${p._id}" ${p.stock < 1 ? 'disabled' : ''}>${esc(p.name)} · ${money(p.price)} · disp. ${p.stock}</option>`).join('');
      const line = `<div class="line"><select aria-label="Prodotto">${opts}</select><input type="number" min="1" value="1" aria-label="Quantità"><button type="button" class="btn btn-ghost" data-rm>Rimuovi</button></div>`;
      openModal('Nuovo ordine', `<label>Cliente<select id="cust">${cs.map((c) => `<option value="${c._id}">${esc(c.name)}</option>`).join('')}</select></label><div id="lines">${line}</div><button type="button" class="btn btn-ghost" id="addline">Aggiungi prodotto</button>`,
        async () => {
          const items = [...document.querySelectorAll('#lines .line')].map((l) => ({ product: l.querySelector('select').value, qty: Number(l.querySelector('input').value) }));
          await Api.post('/orders', { customer: $('#cust').value, items });
          toast('Ordine creato'); await load();
        }, 'Crea ordine');
      $('#addline').onclick = () => $('#lines').insertAdjacentHTML('beforeend', line);
      $('#lines').onclick = (e) => { if ('rm' in e.target.dataset && $('#lines').children.length > 1) e.target.closest('.line').remove(); };
    };
    await load();
  }

  // Gestione utenti (solo admin): crea, cambia ruolo, reimposta password, attiva/disattiva
  async function users(root) {
    root.innerHTML = `<div class="head"><h1>Utenti</h1><button class="btn btn-primary" id="add">${icon('plus')}Nuovo utente</button></div><div id="list"></div>`;
    let rows = [];
    const form = (u = {}) => `<label>Nome<input name="name" value="${esc(u.name)}" required></label>
      ${u._id ? '' : '<label>Email<input name="email" type="email" required></label>'}
      <label>${u._id ? 'Nuova password (vuoto = invariata)' : 'Password'}<input name="password" type="password" minlength="6" autocomplete="new-password" ${u._id ? '' : 'required'}></label>
      <label>Ruolo<select name="role"><option value="operator" ${u.role !== 'admin' ? 'selected' : ''}>Operatore</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Amministratore</option></select></label>
      ${u._id ? `<label class="chk"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}> Utente attivo</label>` : ''}`;
    const load = async () => {
      rows = await Api.get('/users');
      $('#list').innerHTML = table(['Nome', 'Email', 'Ruolo', 'Stato', ''], rows.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Amministratore' : 'Operatore'}</td>
        <td>${u.active === false ? '<span class="badge-st st-annullato">Disattivato</span>' : '<span class="badge-st st-consegnato">Attivo</span>'}</td>
        <td class="actions"><button class="btn btn-ghost" data-edit="${u._id}">${icon('edit')}Modifica</button></td></tr>`), 'Nessun utente.');
    };
    $('#add').onclick = () => openModal('Nuovo utente', form(), async (fd) => { await Api.post('/users', Object.fromEntries(fd)); toast('Utente creato'); await load(); });
    $('#list').onclick = (e) => {
      const id = e.target.closest('[data-edit]')?.dataset.edit;
      if (id) openModal('Modifica utente', form(rows.find((u) => u._id === id)), async (fd) => {
        await Api.put('/users/' + id, { name: fd.get('name'), role: fd.get('role'), active: fd.has('active'), password: fd.get('password') });
        toast('Utente aggiornato'); await load();
      });
    };
    await load();
  }

  const lineChart = (rev) => {
    const W = 640, H = 230, L = 46, R = 46, T = 36, B = 34, max = Math.max(...rev.map((m) => m.total), 1);
    const pts = rev.map((m, i) => [L + (i * (W - L - R)) / (rev.length - 1), T + (1 - m.total / max) * (H - T - B)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Fatturato per mese"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366F1" stop-opacity=".35"/><stop offset="1" stop-color="#6366F1" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${pts[pts.length - 1][0]} ${H - B} L${pts[0][0]} ${H - B}Z" fill="url(#ga)"/><path d="${line}" fill="none" stroke="#6366F1" stroke-width="3" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 6 : 4}" fill="#fff" stroke="#6366F1" stroke-width="3"/><text x="${p[0]}" y="${p[1] - 12}" text-anchor="middle" class="cv">${Math.round(rev[i].total).toLocaleString('it-IT')} €</text><text x="${p[0]}" y="${H - 10}" text-anchor="middle" class="cl">${new Date(rev[i].year, rev[i].month - 1).toLocaleDateString('it-IT', { month: 'short' })}</text>`).join('')}</svg>`;
  };
  const donut = (by) => {
    const keys = Object.keys(ST), total = keys.reduce((a, k) => a + (by[k] || 0), 0);
    let off = 25;
    const arcs = keys.filter((k) => by[k]).map((k) => { const p = (by[k] / total) * 100; const c = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${SC[k]}" stroke-width="6" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${off}"/>`; off -= p; return c; }).join('');
    return `<div class="donut"><svg viewBox="0 0 42 42" role="img" aria-label="Ordini per stato"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#EEF0FA" stroke-width="6"/>${arcs}<text x="21" y="23.5" text-anchor="middle" class="dt">${total}</text></svg>
      <ul class="legend">${keys.map((k) => `<li><i style="background:${SC[k]}"></i>${ST[k]}<b>${by[k] || 0}</b></li>`).join('')}</ul></div>`;
  };

  async function dashboard(root) {
    const s = await Api.get('/stats');
    const tmax = Math.max(...s.top.map((t) => t.qty), 1);
    const kpi = (c, ic, label, val) => `<div class="kpi"><i class="tile ${c}">${icon(ic)}</i><div><span>${label}</span><b>${val}</b></div></div>`;
    root.innerHTML = `<h1>Dashboard</h1>
      <section class="strip">${kpi('t1', 'trend', 'Fatturato (6 mesi)', money(s.revenue.reduce((a, m) => a + m.total, 0)))}${kpi('t2', 'clock', 'Ordini aperti', s.openOrders)}${kpi('t3', 'users', 'Clienti', s.customers)}${kpi('t4', 'box', 'Prodotti', s.products)}</section>
      <div class="grid2 wide"><section class="panel"><h2>Fatturato per mese</h2>${lineChart(s.revenue)}</section><section class="panel"><h2>Ordini per stato</h2>${donut(s.byStatus)}</section></div>
      <div class="grid2"><section class="panel"><h2>Prodotti più venduti</h2>${s.top.length ? `<ul class="rank">${s.top.map((t, i) => `<li><div class="row"><span>${esc(t._id)}</span><b>${t.qty} pz</b></div><div class="track"><i style="width:${(t.qty / tmax) * 100}%;background:${PAL[i % 5]}"></i></div></li>`).join('')}</ul>` : '<p class="muted">Ancora nessuna vendita.</p>'}</section>
      <section class="panel"><h2>Giacenza bassa</h2>${s.lowStock.length ? `<ul class="rank low">${s.lowStock.map((p) => `<li><span>${esc(p.name)}</span><span class="badge">${p.stock} pz</span></li>`).join('')}</ul>` : '<p class="muted">Tutte le giacenze sono sufficienti.</p>'}</section></div>`;
  }

  const routes = { dashboard, clienti: customers, prodotti: products, ordini: orders, ...(isAdmin && { utenti: users }) };
  async function render() {
    const name = routes[location.hash.slice(2)] ? location.hash.slice(2) : 'dashboard';
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + name));
    const root = $('#view'); root.innerHTML = '<p class="muted">Caricamento…</p>';
    try { await routes[name](root); } catch (e) { root.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  addEventListener('hashchange', render);
  render();
})();
