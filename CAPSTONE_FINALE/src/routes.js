const router = require('express').Router();
const { User, Customer, Product, Order } = require('./models');
const { wrap, protect, only } = require('./auth');

router.use(protect);
const fail = (status, message) => Object.assign(new Error(message), { status });
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Con "?page=" risponde a pagine {items,total,page,pages} (con ordinamento); senza, restituisce l'elenco completo
async function sendList(req, res, Model, filter, sortable, populate) {
  const build = () => (populate ? Model.find(filter).populate(...populate) : Model.find(filter));
  if (!req.query.page) return res.json(await build().sort({ createdAt: -1 }));
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const field = sortable.includes(req.query.sort) ? req.query.sort : 'createdAt'; // solo campi ammessi
  const sort = { [field]: req.query.dir === 'asc' ? 1 : -1, _id: -1 };
  const [items, total] = await Promise.all([build().sort(sort).skip((page - 1) * limit).limit(limit), Model.countDocuments(filter)]);
  res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}

// Genera le 4 operazioni CRUD (elenco+ricerca, crea, modifica, elimina) per una collezione
function crud(path, Model, searchFields, sortable, guardDelete) {
  router.get(path, wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: searchFields.map((f) => ({ [f]: new RegExp(escapeRx(q), 'i') })) } : {};
    await sendList(req, res, Model, filter, sortable);
  }));
  router.post(path, wrap(async (req, res) => res.status(201).json(await Model.create(req.body))));
  router.put(path + '/:id', wrap(async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) throw fail(404, 'Elemento non trovato');
    res.json(doc);
  }));
  router.delete(path + '/:id', only('admin'), wrap(async (req, res) => {
    if (guardDelete) await guardDelete(req.params.id);
    if (!(await Model.findByIdAndDelete(req.params.id))) throw fail(404, 'Elemento non trovato');
    res.json({ message: 'Eliminato' });
  }));
}

crud('/customers', Customer, ['name', 'email', 'city'], ['name', 'city', 'createdAt'], async (id) => {
  if (await Order.exists({ customer: id })) throw fail(409, 'Il cliente ha ordini collegati e non può essere eliminato');
});
crud('/products', Product, ['name', 'sku'], ['name', 'price', 'stock', 'createdAt']);

// ---- Ordini ----
router.get('/orders', wrap(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  const range = {};
  const from = new Date(req.query.from + 'T00:00:00'), to = new Date(req.query.to + 'T23:59:59.999');
  if (req.query.from && !isNaN(from)) range.$gte = from;
  if (req.query.to && !isNaN(to)) range.$lte = to;
  if (Object.keys(range).length) filter.createdAt = range;
  await sendList(req, res, Order, filter, ['createdAt', 'total'], ['customer', 'name']);
}));

router.get('/orders/:id', wrap(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('customer', 'name email phone city');
  if (!order) throw fail(404, 'Ordine non trovato');
  res.json(order);
}));

router.post('/orders', wrap(async (req, res) => {
  const { customer, items } = req.body;
  if (!customer || !Array.isArray(items) || !items.length) throw fail(400, 'Scegli un cliente e almeno un prodotto');
  if (!(await Customer.exists({ _id: customer }))) throw fail(400, 'Cliente non trovato');

  const qtyById = new Map(); // unisce eventuali righe con lo stesso prodotto
  for (const i of items) {
    const q = Number(i.qty);
    if (!Number.isInteger(q) || q < 1) throw fail(400, 'Quantità non valida');
    qtyById.set(String(i.product), (qtyById.get(String(i.product)) || 0) + q);
  }
  const products = await Product.find({ _id: { $in: [...qtyById.keys()] } });
  if (products.length !== qtyById.size) throw fail(400, 'Prodotto non trovato');

  // Scala la giacenza con un aggiornamento atomico; se un prodotto non basta, annulla le modifiche già fatte
  const done = [];
  try {
    for (const p of products) {
      const qty = qtyById.get(String(p._id));
      const r = await Product.updateOne({ _id: p._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
      if (!r.modifiedCount) throw fail(409, `Giacenza insufficiente per ${p.name}`);
      done.push([p._id, qty]);
    }
  } catch (e) {
    await Promise.all(done.map(([id, q]) => Product.updateOne({ _id: id }, { $inc: { stock: q } })));
    throw e;
  }
  const lines = products.map((p) => ({ product: p._id, name: p.name, price: p.price, qty: qtyById.get(String(p._id)) }));
  const total = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100;
  res.status(201).json(await Order.create({ customer, items: lines, total }));
}));

router.put('/orders/:id/status', wrap(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw fail(404, 'Ordine non trovato');
  const { status } = req.body;
  if (!Order.schema.path('status').enumValues.includes(status)) throw fail(400, 'Stato non valido');
  if (order.status === 'annullato') throw fail(409, 'Un ordine annullato non può essere riaperto');
  if (status === 'annullato') { // restituisce la merce al magazzino
    await Promise.all(order.items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.qty } })));
  }
  order.status = status;
  await order.save();
  res.json(order);
}));

router.delete('/orders/:id', only('admin'), wrap(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw fail(404, 'Ordine non trovato');
  if (order.status !== 'annullato') throw fail(409, "Annulla l'ordine prima di eliminarlo");
  await order.deleteOne();
  res.json({ message: 'Eliminato' });
}));

// ---- Utenti (solo admin): si disattivano invece di eliminarli, per conservare lo storico ----
const safe = (u) => { const o = u.toObject(); delete o.password; return o; };
router.get('/users', only('admin'), wrap(async (req, res) => res.json(await User.find().select('-password').sort({ createdAt: 1 }))));
router.post('/users', only('admin'), wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  res.status(201).json(safe(await User.create({ name, email, password, role })));
}));
router.put('/users/:id', only('admin'), wrap(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw fail(404, 'Utente non trovato');
  const { name, role, active, password } = req.body;
  if (String(user._id) === String(req.user._id) && ((role && role !== 'admin') || active === false)) {
    throw fail(409, 'Non puoi disattivare te stesso né toglierti il ruolo di admin');
  }
  if (name !== undefined) user.name = name;
  if (role) user.role = role;
  if (typeof active === 'boolean') user.active = active;
  if (password) user.password = password; // viene cifrata dal modello al salvataggio
  await user.save();
  res.json(safe(user));
}));

// ---- Statistiche per la dashboard (aggregation pipeline di MongoDB) ----
router.get('/stats', wrap(async (req, res) => {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const valid = { status: { $ne: 'annullato' } };
  const [raw, byStatus, top, customers, products, lowStock] = await Promise.all([
    Order.aggregate([
      { $match: { ...valid, createdAt: { $gte: since } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, total: { $sum: '$total' } } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: valid }, { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' } } },
      { $sort: { qty: -1 } }, { $limit: 5 },
    ]),
    Customer.countDocuments(), Product.countDocuments(),
    Product.find({ stock: { $lte: 5 } }).select('name stock').sort({ stock: 1 }).limit(5),
  ]);
  const revenue = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenue.push({ year: d.getFullYear(), month: d.getMonth() + 1, total: 0 });
  }
  raw.forEach((r) => { const m = revenue.find((x) => x.year === r._id.y && x.month === r._id.m); if (m) m.total = r.total; });
  const count = (s) => (byStatus.find((x) => x._id === s) || { count: 0 }).count;
  res.json({ revenue, openOrders: count('nuovo') + count('lavorazione'), byStatus: Object.fromEntries(byStatus.map((b) => [b._id, b.count])), customers, products, top, lowStock });
}));

module.exports = router;
