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
  const { message, sessionId, propertySlug } = req.body;
  console.log('📥 Message received:', message);
  console.log('📍 Property slug:', propertySlug);
  console.log('🔗 Session ID:', sessionId);

  if (!message || !propertySlug) {
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

    // 🔍 Check if assistant has already asked for contact info in this session
    const { data: sessionData, error: sessionError } = await supabase
      .from('user_sessions')
      .select('has_asked_for_contact')
      .eq('session_id', sessionId)
      .single();

    if (sessionError) {
      console.error('⚠️ Could not fetch session contact flag:', sessionError);
    }

    const hasAskedForContact = sessionData?.has_asked_for_contact ?? false;

    const contactInstruction = hasAskedForContact
      ? "Do NOT ask the user to leave their contact information again."
      : "Encourage the user once to leave their contact information using the form below. Only do this once per session.";

    const systemInstructions = `
You are a helpful assistant to a commercial realtor. Your job is to provide smart, brief HTML responses about the property at ${propertySlug}.
${contactInstruction}
    `;

    // 📩 Submit the user message to the assistant thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    // 🧠 Run the assistant with context-aware instructions
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      instructions: systemInstructions
    });

    // ⏳ Wait for the run to complete
    let runStatus;
    do {
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      await new Promise(r => setTimeout(r, 1000));
    } while (runStatus.status !== 'completed');

    // 📥 Retrieve the latest message
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0].content[0].text.value;

    // 🧠 Check if assistant included the contact CTA
    const includesCTA = lastMessage.toLowerCase().includes("leave your contact information");

    if (includesCTA && !hasAskedForContact) {
      const { error: updateError } = await supabase
        .from('user_sessions')
        .update({ has_asked_for_contact: true })
        .eq('session_id', sessionId);

      if (updateError) {
        console.error('⚠️ Failed to update contact prompt flag:', updateError);
      } else {
        console.log('✅ Contact prompt flag set to true for session:', sessionId);
      }
    }

    // ✅ Log conversation to Supabase
    const { error: logError } = await supabase
      .from('chat_logs')
      .insert([
        {
          session_id: sessionId || uuidv4(),
          user_message: message,
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
