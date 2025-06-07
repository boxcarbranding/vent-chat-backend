const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: 'No message provided' });

    try {
        const thread = await openai.beta.threads.create();

        await openai.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: userMessage
        });

        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: ASSISTANT_ID,
        });

        let runStatus;
        do {
            runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            await new Promise(r => setTimeout(r, 1000));
        } while (runStatus.status !== 'completed');

        const messages = await openai.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0].content[0].text.value;

        res.json({ reply: lastMessage });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Assistant proxy running on port ${PORT}`);
});
