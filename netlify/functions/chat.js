exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GROQ_API_KEY not set in environment variables' })
      };
    }

    const body = JSON.parse(event.body);
    const messages = body.messages || [];
    const mode = body.mode || 'assistant';

    const SYSTEM_PROMPTS = {
      assistant: "You are NEXUS AI, an advanced all-in-one AI assistant. You are intelligent, helpful, creative, professional, and friendly. Use markdown formatting for clarity. Never mention who created you or volunteer background info about yourself — focus entirely on helping the user. When a user uploads a file, its full text content is embedded directly in the message between triple backticks — you can read, analyze, summarize, edit, debug, or answer questions about it.",
      researcher: "You are NEXUS AI in Research Mode. You specialize in deep research, fact-checking, and comprehensive analysis. Structure responses with clear sections and acknowledge uncertainty. Focus on the research task only.",
      coder: "You are NEXUS AI in Coding Expert Mode. You are a senior software engineer expert in all languages. Write clean, optimized, well-commented code. Focus on the coding task only.",
      teacher: "You are NEXUS AI in Tutor Mode. You are a patient teacher who breaks down complex topics simply with analogies and examples. Focus on teaching clearly.",
      creative: "You are NEXUS AI in Creative Mode. You excel at stories, poems, scripts, and creative content. Bring imagination and originality. Focus on the creative task.",
      analyst: "You are NEXUS AI in Data Analyst Mode. You specialize in data interpretation and business intelligence. Present insights clearly with tables and structured breakdowns.",
      roleplay: "You are NEXUS AI in Roleplay Mode. You are a versatile storytelling companion. Adopt characters and maintain immersive narratives within ethical guidelines.",
      translate: "You are NEXUS AI in Translation Mode. You are a professional linguist fluent in over 100 languages. Provide accurate translations with cultural context and nuances."
    };

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant;

    // Check if current (last) user message has an image
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const hasImageNow = lastUserMsg && Array.isArray(lastUserMsg.content) && lastUserMsg.content.some(c => c.type === 'image_url');
    // Use vision model only when current message has image; fall back to text model otherwise
    const model = hasImageNow ? 'meta-llama/llama-4-maverick-17b-128e-instruct' : 'llama-3.3-70b-versatile';

    // Sanitize messages for Groq:
    // - Only the LAST user message may have image_url blocks
    // - All other messages must be plain strings or text-only arrays
    // - Flatten single-text arrays to plain strings (some models require this)
    const lastUserIdx = messages.reduce((acc, m, i) => m.role === 'user' ? i : acc, -1);

    const safeMessages = messages.map((m, i) => {
      // Flatten assistant messages
      if (m.role === 'assistant') {
        if (Array.isArray(m.content)) return {...m, content: m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n') || ''};
        return m;
      }
      if (m.role !== 'user') return m;

      // User messages
      if (Array.isArray(m.content)) {
        const textParts = m.content.filter(c => c.type === 'text');
        const imgParts = m.content.filter(c => c.type === 'image_url');

        if (i === lastUserIdx && imgParts.length > 0 && hasImageNow) {
          // Current message with image — keep image_url, ensure correct format
          const cleanImgs = imgParts.map(c => ({
            type: 'image_url',
            image_url: { url: c.image_url.url }
          }));
          return {...m, content: [...textParts, ...cleanImgs]};
        } else {
          // Older message or non-image — strip images, flatten to string if only text
          const imgCount = imgParts.length;
          const textStr = textParts.map(c=>c.text).join('\n') + (imgCount > 0 ? '\n['+imgCount+' image(s) in earlier message]' : '');
          return {...m, content: textStr || '[empty message]'};
        }
      }
      // Already a string
      return m;
    });

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1500,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...safeMessages
        ]
      })
    });

    const result = await groqResponse.json();

    if (!groqResponse.ok) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: result.error?.message || 'Groq API returned an error' })
      };
    }

    const reply = result.choices?.[0]?.message?.content;
    if (!reply) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No response from AI model' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: reply })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error: ' + err.message })
    };
  }
};
