const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '20mb' }));

const SYSTEM_PROMPT = `Tu es Alya, l'assistante IA experte en chiffrage de travaux de rénovation en France.
Tu as été créée par une équipe d'ingénieurs BTP avec 15 ans d'expérience terrain.

Quand tu reçois une image ou un plan :
- Analyse précisément ce que tu vois (dimensions, état des surfaces, équipements...)
- Identifie les travaux nécessaires
- Donne une estimation chiffrée basée sur ton analyse visuelle
- Signale ce que tu ne peux pas évaluer à distance

Règles :
- Réponds TOUJOURS en français, ton chaleureux et professionnel
- Donne des fourchettes de prix précises en euros
- Île-de-France +22%, grandes villes +10-15%
- Recommande toujours 3 devis minimum
- Mentionne MaPrimeRénov et TVA réduite quand pertinent
- Max 200 mots par réponse sauf si plus demandé
- Ne mentionne jamais Claude ou Anthropic

Prix France 2025 :
Rénovation complète : 800-2500€/m² | Cuisine : 5000-25000€
Salle de bain : 4000-18000€ | Peinture : 15-45€/m²
Carrelage : 40-120€/m² | Isolation : 30-150€/m²
Toiture : 80-300€/m² | Extension : 1200-3500€/m²
Électricité : 50-180€/m² | Plomberie : 60-200€/m²`;

app.get('/', (req, res) => {
  res.json({ status: 'Alya API en ligne', version: '2.0', features: ['chat', 'image-analysis'] });
});

app.post('/chat', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Messages requis' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Clé API manquante' });
  }

  const cleanMessages = messages.map(msg => {
    if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };
    if (Array.isArray(msg.content)) {
      const valid = msg.content.filter(b => {
        if (b.type === 'text') return true;
        if (b.type === 'image' && b.source) {
          return ['image/jpeg','image/png','image/gif','image/webp'].includes(b.source.media_type);
        }
        return false;
      });
      return { role: msg.role, content: valid };
    }
    return { role: msg.role, content: String(msg.content) };
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: system || SYSTEM_PROMPT,
        messages: cleanMessages
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message || 'Erreur API' });
    }

    const data = await response.json();
    const reply = data.content.map(b => b.text || '').join('');
    res.json({ reply });

  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Alya API v2 — port ${PORT}`);
  console.log(`🔑 API Key: ${process.env.ANTHROPIC_API_KEY ? 'OK ✓' : 'MANQUANTE ✗'}`);
});
