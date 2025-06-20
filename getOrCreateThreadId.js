import { supabase } from './supabase.js';
import { openai } from './openai.js';

export async function getOrCreateThreadId(sessionId) {
  const { data, error } = await supabase
    .from('user_sessions')
    .select('thread_id')
    .eq('session_id', sessionId)
    .single();

  if (data?.thread_id) {
    return data.thread_id;
  }

  const thread = await openai.beta.threads.create();

  await supabase.from('user_sessions').insert([
    { session_id: sessionId, thread_id: thread.id }
  ]);

  return thread.id;
}
