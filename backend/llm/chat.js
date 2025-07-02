import OpenAI from 'openai';

export class ChatLLM {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async getResponse(plan, message) {
    const systemPrompt = `You are RavenLoom, an AI assistant.
Here is the user’s business data:
${JSON.stringify(plan, null, 2)}

Help them with business planning, growth, and insight.`;

    const chat = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    return chat.choices[0].message.content;
  }
}
