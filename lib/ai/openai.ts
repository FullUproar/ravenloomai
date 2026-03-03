import OpenAI from 'openai'

// Lazy singleton — avoids instantiation at build time when env vars aren't set
let _openai: OpenAI | null = null
function getClient() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: 'text-embedding-3-large',
    input: text.slice(0, 8000),
    dimensions: 3072,
  })
  return response.data[0].embedding
}

export async function askGPT4o(
  prompt: string,
  context: string,
  systemPrompt: string
): Promise<{ text: string; confidence: number }> {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `KNOWLEDGE CONTEXT:\n${context}\n\nQUESTION: ${prompt}\n\nAnswer based on the knowledge context. End your response with a JSON object on its own line: {"confidence": 0.0-1.0}`,
      },
    ],
  })

  const raw = response.choices[0].message.content ?? ''
  return parseAnswerWithConfidence(raw)
}

export function parseAnswerWithConfidence(raw: string): { text: string; confidence: number } {
  const match = raw.match(/\{"confidence":\s*([\d.]+)\}/)
  if (match) {
    const text = raw.slice(0, raw.lastIndexOf(match[0])).trim()
    const confidence = Math.min(1, Math.max(0, parseFloat(match[1])))
    return { text, confidence }
  }
  return { text: raw, confidence: 0.5 }
}
