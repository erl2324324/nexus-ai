export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

    const { messages = [], mode = 'assistant' } = req.body;

    const SYSTEM_PROMPTS = {
      assistant: "You are NEXUS AI, an advanced all-in-one AI assistant. You are intelligent, helpful, creative, professional, and friendly. Use markdown formatting for clarity.",
      researcher: "You are NEXUS AI in Research Mode. You specialize in deep research and analysis.",
      coder: "You are NEXUS AI in Coding Expert Mode. You are a senior software engineer.",
      teacher: "You are NEXUS AI in Tutor Mode. You are a patient teacher.",
      creative: "You are NEXUS AI in Creative Mode. You excel at stories and creative content.",
      analyst: "You are NEXUS AI in Data Analyst Mode.",
      roleplay: "You are NEXUS AI in Roleplay Mode.",
      translate: "You are NEXUS AI in Translation Mode. Fluent in 100+ languages."
    };

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const hasImage = lastUserMsg && Array.isArray(lastUserMsg.content) && lastUserMsg.content.some(c => c.type === 'image_url');
    const model = hasImage ? 'meta-llama/llama-4-maverick-17b-128e-instruct' : 'llama-3.3-70b-versatile';

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: 1500, temperature: 0.7, messages: [{ role: 'system', content: systemPrompt }, ...messages] })
    });

    const result = await groqResponse.json();
    const reply = result.choices?.[0]?.message?.content;
    if (!reply) return res.status(200).json({ error: 'No response from AI' });
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
