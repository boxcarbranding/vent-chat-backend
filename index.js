require('dotenv').config(); // Load your .env file
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const supabase = require('./supabase'); // ← Your Supabase client file
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/chat', async (req, res) => {
  const { message: userMessage, sessionId } = req.body;
  if (!userMessage) return res.status(400).json({ error: 'No message provided' });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ASSISTANT_ID = process.env.ASSISTANT_ID;

    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessage
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
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
    const { error } = await supabase
      .from('chat_logs')
      .insert([
        {
          session_id: sessionId || uuidv4(),
          user_message: userMessage,
          assistant_response: lastMessage,
          timestamp: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('❌ Failed to log chat to Supabase:', error);
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
