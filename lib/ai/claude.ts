import Anthropic from '@anthropic-ai/sdk'
import { askGPT4o, parseAnswerWithConfidence } from './openai'

let _anthropic: Anthropic | null = null
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

const RAVEN_SYSTEM = `You are Raven, the institutional knowledge assistant for this organization.

Your role:
- Answer questions using ONLY the provided knowledge context
- Be precise and cite specific facts when possible
- Acknowledge uncertainty when the context is insufficient
- Never invent information not present in the context

Communication style:
- Concise and direct — no fluff
- Reference specific stored facts
- Indicate confidence level honestly

Always end your response with a JSON confidence score on its own line:
{"confidence": 0.0-1.0}

Where 1.0 = this context fully answers the question, 0.0 = no relevant context found.`

export async function askClaude(
  query: string,
  context: string
): Promise<{ text: string; confidence: number }> {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: RAVEN_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `KNOWLEDGE CONTEXT:\n${context}\n\nQUESTION: ${query}`,
      },
    ],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseAnswerWithConfidence(raw)
}

/**
 * Primary entry point — tries Claude first, falls back to GPT-4o.
 */
export async function askWithFallback(
  query: string,
  context: string
): Promise<{ text: string; confidence: number }> {
  try {
    return await askClaude(query, context)
  } catch (err) {
    console.warn('[AI] Claude failed, falling back to GPT-4o:', err)
    return askGPT4o(query, context, RAVEN_SYSTEM)
  }
}

/**
 * Extract entities and relationships from raw text.
 */
export async function extractEntitiesAndRelationships(text: string): Promise<{
  entities: Array<{ name: string; type: string; description?: string }>
  relationships: Array<{
    source: string
    target: string
    relationship: string
    contextConditions?: Array<{ tag: string }>
  }>
  facts: Array<{ content: string; category?: string; contextTags?: string[] }>
}> {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a knowledge extraction engine. Extract structured knowledge from text.

Return ONLY a JSON object with this exact structure:
{
  "entities": [{"name": "...", "type": "PERSON|PRODUCT|COMPANY|CONCEPT|RULE|DECISION|PROCESS|EVENT|LOCATION|CUSTOM", "description": "..."}],
  "relationships": [{"source": "entity_name", "target": "entity_name", "relationship": "IS_A|HAS|WORKS_FOR|CREATED_BY|RELATED_TO|PART_OF|HAPPENS_ON|LOCATED_IN|DEPENDS_ON|CONTRADICTS|CUSTOM", "contextConditions": [{"tag": "condition"}]}],
  "facts": [{"content": "atomic fact statement", "category": "general|product|manufacturing|marketing|sales", "contextTags": ["tag1"]}]
}

Context conditions are ONLY included when the relationship is conditional (e.g. only true in specific circumstances).
Keep entities focused and named precisely. Extract only what is explicitly stated.`,
    messages: [{ role: 'user', content: `Extract knowledge from this text:\n\n${text}` }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0])
  } catch {
    return { entities: [], relationships: [], facts: [] }
  }
}

/**
 * Generate a concise summary of a scope's content.
 */
export async function generateScopeSummary(
  scopeName: string,
  recentFacts: string[]
): Promise<string> {
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Summarize the scope "${scopeName}" in 1-2 sentences based on these facts:\n${recentFacts.slice(0, 10).join('\n')}`,
      },
    ],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}
