const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

// Inoltra gli errori delle funzioni async al gestore errori di Express
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const login = wrap(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) {
    return res.status(401).json({ message: 'Email o password non corretti' });
  }
  if (user.active === false) return res.status(403).json({ message: 'Utente disattivato: contatta un amministratore' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
});

// Middleware: lascia passare solo chi invia un token valido nell'header Authorization
const protect = wrap(async (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ message: 'Accesso non autorizzato' });
  let payload;
  try { payload = jwt.verify(h.slice(7), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ message: 'Sessione scaduta, accedi di nuovo' }); }
  const user = await User.findById(payload.id).select('-password');
  if (!user || user.active === false) return res.status(401).json({ message: 'Utente non trovato o disattivato' });
  req.user = user;
  next();
});

// Middleware: limita una rotta ad alcuni ruoli (es. solo admin)
const only = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Non hai i permessi per questa azione' });

module.exports = { wrap, login, protect, only };
