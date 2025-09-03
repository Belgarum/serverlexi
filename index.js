import express from 'express'
import cors from 'cors'
import WordPOS from 'wordpos'

// Node 18+ has global fetch — no node-fetch needed

const wordpos = new WordPOS()

// Simple rule-based semantic categories
const CATEGORY_RULES = [
  { cat: 'Physical', regex: /\b(grab|hold|touch|object|hand|surface|edge|weight|move|body|material|seize|grip)\b/i },
  { cat: 'Mental',   regex: /\b(think|understand|idea|concept|intellect|imagine|know|believe|plan|comprehend|grasp)\b/i },
  { cat: 'Finance',  regex: /\b(money|cost|charge|price|debt|credit|bank|pay|fee)\b/i },
  { cat: 'Place',    regex: /\b(river|bank|shore|coast|location|place|site|ground)\b/i },
  { cat: 'Sound',    regex: /\b(sound|tone|sharp|flat|loud|pitch|noise)\b/i },
  { cat: 'Value',    regex: /\b(good|bad|moral|nice|awful|worthy|just)\b/i },
  { cat: 'Action',   regex: /\b(run|charge|attack|act|do|perform|execute|proceed|go|move)\b/i },
]

function categorizeSense(gloss) {
  const hits = CATEGORY_RULES.filter(r => r.regex.test(gloss)).map(r => r.cat)
  return Array.from(new Set(hits)).slice(0, 3)
}

async function datamuse(word, rel) {
  const url = `https://api.datamuse.com/words?${rel}=${encodeURIComponent(word)}`
  const r = await fetch(url)
  if (!r.ok) return []
  const j = await r.json()
  return j.map(d => (d.word || '').toLowerCase()).filter(Boolean)
}

async function buildLexeme(word) {
  const w = String(word || '').toLowerCase()

  // WordPOS lookup -> array of { synsetOffset, pos, lemma, synonyms, gloss }
  const lookup = await new Promise(resolve => {
    wordpos.lookup(w, results => resolve(results || []))
  })

  const seen = new Set()
  const senses = []
  for (const [i, s] of lookup.entries()) {
    const gloss = String(s.gloss || '').replace(/\s+/g, ' ').trim()
    if (!gloss || seen.has(gloss)) continue
    seen.add(gloss)
    senses.push({
      id: `s${i}`,
      gloss,
      categories: categorizeSense(gloss),
      conf: 0.9
    })
  }
  if (senses.length === 0) {
    senses.push({
      id: 's0',
      gloss: `No definition found for “${w}”`,
      categories: [],
      conf: 0
    })
  }

  const [synonyms, antonyms] = await Promise.all([
    datamuse(w, 'rel_syn'),
    datamuse(w, 'rel_ant'),
  ])

  return { id: w, language: 'en', senses, synonyms, antonyms }
}

const app = express()
app.use(cors())

app.get('/lexeme/:word', async (req, res) => {
  try {
    const word = req.params.word || ''
    if (!word) return res.status(400).json({ error: 'Missing word' })
    const lex = await buildLexeme(word)
    res.json(lex)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  console.log(`LexiMap API listening on http://localhost:${PORT}`)
})
