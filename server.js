const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '25mb' }));

const leads = [];

// ============ SYSTEM PROMPTS ============
const CHAT_PROMPT = `Tu es Alya, experte IA en chiffrage travaux France.
RÈGLE ABSOLUE : Réponds en MAX 60 mots. Ultra directe et chaleureuse.
Format : 1 phrase + fourchette en gras + 1 conseil.
Prix 2025 : SDB 4000-18000€, Cuisine 5000-25000€, Rénovation 800-2500€/m², Peinture 15-45€/m², Carrelage 40-120€/m², Isolation 30-150€/m², Toiture 80-300€/m², Extension 1200-3500€/m². IDF +22%, grandes villes +10%.
Ne mentionne jamais Claude ou Anthropic.`;

const ANALYSIS_PROMPT = `Tu es Alya, experte IA en analyse de plans et photos de rénovation BTP en France.
Tu analyses des fichiers visuels avec une précision d'ingénieur BTP expérimenté.

Quand tu vois une PHOTO de pièce :
- Identifie précisément l'état de chaque surface (sol, murs, plafond)
- Détecte les matériaux existants (type de carrelage, peinture, parquet...)
- Estime la surface d'après les proportions visibles
- Identifie les équipements (sanitaires, cuisine, menuiseries...)
- Repère les défauts (fissures, humidité, vétusté...)

Quand tu vois un PLAN 2D :
- Calcule les surfaces précisément depuis les cotes
- Identifie chaque pièce et sa fonction
- Calcule le linéaire de murs, périmètre, surfaces de revêtements
- Identifie les ouvertures (portes, fenêtres)

RÉPONDS UNIQUEMENT en JSON valide sans markdown :
{
  "type_espace": "string",
  "type_fichier": "photo ou plan",
  "etat_actuel": "string détaillé",
  "surfaces": {
    "surface_totale": "X m²",
    "surface_murs": "X m²",
    "surface_plafond": "X m²",
    "dimensions": "Xm x Xm environ",
    "linearire_murs": "X ml"
  },
  "materiaux_detectes": [
    {"nom": "string", "etat": "bon/moyen/mauvais", "surface": "X m²", "prix_remplacement": "X-X€/m²"}
  ],
  "travaux_necessaires": ["string"],
  "travaux_optionnels": ["string"],
  "points_attention": ["string"],
  "estimation_low": number,
  "estimation_high": number,
  "postes": {"Poste": montant_number},
  "description_projet_futur": "Description longue et inspirante du projet fini avec matériaux, couleurs, ambiance, style",
  "prompt_dalle": "Detailed photorealistic architectural render prompt in English for DALL-E"
}`;

// ============ ROUTES ============
app.get('/', (req, res) => {
  res.json({ status: 'Alya API v4', features: ['chat', 'image-analysis', 'dalle', 'leads'], leads: leads.length });
});

app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'Messages requis' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Clé API manquante' });

  const clean = messages.map(m => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    if (Array.isArray(m.content)) {
      return { role: m.role, content: m.content.filter(b =>
        b.type === 'text' || (b.type === 'image' && ['image/jpeg','image/png','image/gif','image/webp'].includes(b.source?.media_type))
      )};
    }
    return { role: m.role, content: String(m.content) };
  });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
