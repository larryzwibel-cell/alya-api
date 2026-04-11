const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '20mb' }));

// Stockage temporaire des leads (en prod : remplacer par une vraie DB)
const leads = [];

const SYSTEM_PROMPT = `Tu es Alya, experte IA en chiffrage travaux France.
RÈGLE ABSOLUE : Réponds en MAX 60 mots. Sois ultra directe et chaleureuse.
Format idéal : 1 phrase + fourchette en gras + 1 conseil court.
Exemple : "Pour une salle de bain 8m² à Lyon : **6 000€ – 12 000€**. Prévoyez 3 devis et 10% d'imprévus."
Prix 2025 : SDB 4000-18000€, Cuisine 5000-25000€, Rénovation 800-2500€/m², Peinture 15-45€/m², Carrelage 40-120€/m², Isolation 30-150€/m², Toiture 80-300€/m², Extension 1200-3500€/m². IDF +22%, grandes villes +10-15%.
Ne mentionne jamais Claude ou Anthropic.`;

// ============ CHAT ============
app.get('/', (req, res) => {
  res.json({ status: 'Alya API v3 en ligne', leads: leads.length });
});

app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'Messages requis' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Clé API manquante' });

  const cleanMessages = messages.map(msg => {
    if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };
    if (Array.isArray(msg.content)) {
      return { role: msg.role, content: msg.content.filter(b =>
        b.type === 'text' || (b.type === 'image' && ['image/jpeg','image/png','image/gif','image/webp'].includes(b.source?.media_type))
      )};
    }
    return { role: msg.role, content: String(msg.content) };
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, system: SYSTEM_PROMPT, messages: cleanMessages })
    });
    if (!response.ok) { const e = await response.json(); return res.status(500).json({ error: e.error?.message }); }
    const data = await response.json();
    res.json({ reply: data.content.map(b => b.text || '').join('') });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============ LEADS ============
app.post('/lead', (req, res) => {
  const { nom, email, telephone, projet, estimation, montant_libre } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const lead = {
    id: Date.now(),
    date: new Date().toISOString(),
    nom: nom || 'Anonyme',
    email,
    telephone: telephone || '',
    projet: projet || '',
    estimation: estimation || '',
    montant_libre: montant_libre || 0,
    source: 'alya-ia.fr'
  };
  leads.push(lead);
  console.log('🎯 Nouveau lead:', email, '| Projet:', projet, '| Don:', montant_libre + '€');
  res.json({ success: true, message: 'Merci ! Votre estimation complète arrive par email.' });
});

// Voir les leads (protégé par clé)
app.get('/leads', (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Non autorisé' });
  res.json({ total: leads.length, total_dons: leads.reduce((s,l)=>s+(l.montant_libre||0),0), leads });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Alya API v3 — port ${PORT}`);
  console.log(`🔑 API Key: ${process.env.ANTHROPIC_API_KEY ? 'OK ✓' : 'MANQUANTE ✗'}`);
});
