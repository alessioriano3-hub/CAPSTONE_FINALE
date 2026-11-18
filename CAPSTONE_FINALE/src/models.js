const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: [true, 'Il nome è obbligatorio'], trim: true },
  email: { type: String, required: [true, "L'email è obbligatoria"], unique: true, lowercase: true, trim: true },
  password: { type: String, required: [true, 'La password è obbligatoria'], minlength: [6, 'La password deve avere almeno 6 caratteri'] },
  role: { type: String, enum: ['admin', 'operator'], default: 'operator' },
  active: { type: Boolean, default: true },
}, { timestamps: true });
// La password non viene mai salvata in chiaro: prima del salvataggio ne calcoliamo l'hash
userSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});

const customerSchema = new Schema({
  name: { type: String, required: [true, 'Il nome del cliente è obbligatorio'], trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  city: { type: String, trim: true },
}, { timestamps: true });

const productSchema = new Schema({
  name: { type: String, required: [true, 'Il nome del prodotto è obbligatorio'], trim: true },
  sku: { type: String, required: [true, 'Il codice è obbligatorio'], unique: true, trim: true },
  price: { type: Number, required: [true, 'Il prezzo è obbligatorio'], min: [0, 'Il prezzo non può essere negativo'] },
  stock: { type: Number, default: 0, min: [0, 'La giacenza non può essere negativa'] },
}, { timestamps: true });

// Ogni riga dell'ordine conserva nome e prezzo del momento: se il listino cambia, gli ordini passati restano corretti
const orderSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: [{ _id: false, product: { type: Schema.Types.ObjectId, ref: 'Product' }, name: String, price: Number, qty: Number }],
  total: { type: Number, required: true },
  status: { type: String, enum: ['nuovo', 'lavorazione', 'spedito', 'consegnato', 'annullato'], default: 'nuovo' },
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Customer: mongoose.model('Customer', customerSchema),
  Product: mongoose.model('Product', productSchema),
  Order: mongoose.model('Order', orderSchema),
};
