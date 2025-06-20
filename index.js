require('dotenv').config(); // Load your .env file
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const supabase = require('./supabase'); // ← Your Supabase client file
const { v4: uuidv4 } = require('uuid');
const { openai } = require('./openai.js');
const { getOrCreateThreadId } = require('./getOrCreateThreadId.js');


const app = express();
app.use(cors());
app.use(express.json());

app.post('/chat', async (req, res) => {
const { message: userMessage, sessionId, propertySlug } = req.body;
console.log('📥 Message received:', message);
console.log('📍 Property slug:', propertySlug);
console.log('🔗 Session ID:', sessionId);

  if (!userMessage || !propertySlug) {
    return res.status(400).json({ error: 'Missing message or propertySlug' });
  }

  try {
    // 🔍 Fetch assistant_id based on propertySlug from Supabase
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('assistant_id')
      .eq('property_slug', propertySlug)
      .single();

    if (propError || !property?.assistant_id) {
      return res.status(404).json({ error: 'Assistant not found for property' });
    }


    const ASSISTANT_ID = property.assistant_id;
const threadId = await getOrCreateThreadId(sessionId);

await openai.beta.threads.messages.create(threadId, {
  role: 'user',
  content: message
});

const run = await openai.beta.threads.runs.create(threadId, {
  assistant_id: ASSISTANT_ID
});


    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      await new Promise(r => setTimeout(r, 1000));
    } while (runStatus.status !== 'completed');

    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0].content[0].text.value;

    // ✅ Log conversation to Supabase
    const { error: logError } = await supabase
      .from('chat_logs')
      .insert([
        {
          session_id: sessionId || uuidv4(),
          user_message: userMessage,
          assistant_response: lastMessage,
          property_slug: propertySlug,
timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
        }
      ]);

    if (logError) {
      console.error('❌ Failed to log chat to Supabase:', logError);
    }

    res.json({ reply: lastMessage });
  } catch (err) {
    console.error('❌ Chat error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Assistant proxy running on port ${PORT}`);
});
