// GÉNIOS Backend — server.js
// Déployé sur Railway.app

const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || 'https://thisbeatzz.github.io/genios';

// ── CORS : autoriser GitHub Pages et localhost ──
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parser (raw pour webhook, json pour le reste) ──
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ══════════════════════════════════════
// ROUTE : Health check
// ══════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'GÉNIOS Backend v1.0',
    message: 'Stripe backend opérationnel ✅'
  });
});

// ══════════════════════════════════════
// ROUTE : Créer session paiement unique (packs crédits)
// POST /create-checkout
// Body: { packId: 'starter' | 'pro' | 'elite' }
// ══════════════════════════════════════
const PACKS = {
  starter: { credits: 10,  amount: 199,  label: 'GÉNIOS — Pack Starter (10 crédits)'  },
  pro:     { credits: 50,  amount: 799,  label: 'GÉNIOS — Pack Pro (50 crédits)'      },
  elite:   { credits: 200, amount: 1999, label: 'GÉNIOS — Pack Elite (200 crédits)'   },
};

app.post('/create-checkout', async (req, res) => {
  try {
    const { packId } = req.body;
    const pack = PACKS[packId];

    if (!pack) {
      return res.status(400).json({ error: 'Pack invalide' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      locale: 'fr',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: pack.label,
            description: `${pack.credits} crédits de génération IA pour GÉNIOS`,
          },
          unit_amount: pack.amount,
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}/?payment=success&credits=${pack.credits}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/?payment=cancelled`,
      metadata: {
        packId,
        credits: pack.credits.toString(),
      },
      customer_creation: 'always',
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    res.json({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// ROUTE : Créer abonnement PRO (9,99€/mois)
// POST /create-subscription
// ══════════════════════════════════════
app.post('/create-subscription', async (req, res) => {
  try {
    const priceId = process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({
        error: 'STRIPE_PRO_PRICE_ID manquant dans les variables Railway'
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      locale: 'fr',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
      },
      allow_promotion_codes: true,
      success_url: `${APP_URL}/?payment=pro_success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/?payment=cancelled`,
    });

    res.json({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error('Subscription error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// ROUTE : Webhook Stripe
// POST /webhook
// ══════════════════════════════════════
app.post('/webhook', (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'payment') {
        console.log(`✅ Pack acheté : ${session.metadata?.packId} — ${session.metadata?.credits} crédits — ${session.customer_details?.email}`);
      }
      if (session.mode === 'subscription') {
        console.log(`✅ PRO activé : ${session.customer_details?.email}`);
      }
      break;
    }
    case 'invoice.payment_succeeded':
      console.log(`🔄 Abonnement renouvelé : ${event.data.object.customer_email}`);
      break;
    case 'customer.subscription.deleted':
      console.log(`❌ Abonnement annulé : ${event.data.object.customer}`);
      break;
    default:
      break;
  }

  res.json({ received: true });
});

// ── Démarrage ──
app.listen(PORT, () => {
  console.log(`✅ GÉNIOS Backend démarré sur le port ${PORT}`);
  console.log(`   APP_URL   : ${APP_URL}`);
  console.log(`   Stripe    : ${process.env.STRIPE_SECRET_KEY ? 'Clé configurée ✅' : '⚠ Clé manquante'}`);
  console.log(`   Price ID  : ${process.env.STRIPE_PRO_PRICE_ID || '⚠ Manquant'}`);
});
