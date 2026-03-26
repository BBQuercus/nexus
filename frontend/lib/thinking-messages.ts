/**
 * Progressive thinking messages shown while waiting for the model to respond.
 * Messages are grouped by time phase and randomly selected within each phase.
 * The progression creates a sense of purposeful, deepening work.
 */

const PHASE_MESSAGES: { maxMs: number; messages: string[] }[] = [
  {
    // 0–1.5s: Immediate acknowledgment — the system received your input
    maxMs: 1500,
    messages: [
      'Reading your message...',
      'Processing your request...',
      'Understanding the context...',
      'Parsing your input...',
      'Analyzing what you need...',
      'Taking this in...',
      'Looking at your prompt...',
    ],
  },
  {
    // 1.5–4s: Active reasoning — the model is working
    maxMs: 4000,
    messages: [
      'Thinking through this...',
      'Reasoning about the best approach...',
      'Considering different angles...',
      'Connecting the pieces...',
      'Working through the logic...',
      'Evaluating possible responses...',
      'Building a thoughtful answer...',
      'Weighing the options...',
      'Forming an approach...',
      'Putting together a response...',
      'Mapping out the answer...',
      'Synthesizing ideas...',
    ],
  },
  {
    // 4–8s: Deeper work — this is complex
    maxMs: 8000,
    messages: [
      'This needs some careful thought...',
      'Working on a detailed response...',
      'Digging into the details...',
      'Exploring this thoroughly...',
      'Crafting a comprehensive answer...',
      'Taking a deeper look...',
      'Running through the specifics...',
      'Assembling the full picture...',
      'Getting the details right...',
      'Working through the nuances...',
      'Thinking more carefully about this...',
      'Piecing everything together...',
    ],
  },
  {
    // 8–15s: Extended reasoning — complex problem
    maxMs: 15000,
    messages: [
      'This is a complex one — still working...',
      'Almost there, refining the response...',
      'Making sure this is thorough...',
      'Polishing up the details...',
      'Working through the remaining parts...',
      'Finalizing my thinking...',
      'Just a bit more...',
      'Finishing up a detailed answer...',
      'Tying everything together...',
      'Wrapping up a thorough response...',
    ],
  },
  {
    // 15s+: Long-running — keep the user engaged
    maxMs: Infinity,
    messages: [
      'Still working on this — it\'s a big one...',
      'Taking extra care with this response...',
      'Generating a thorough answer...',
      'Complex reasoning in progress...',
      'Working through a detailed analysis...',
      'This one takes a moment — worth the wait...',
      'Deep thinking in progress...',
      'Still going — this is substantial...',
    ],
  },
];

// Tool-aware messages shown when the model has started calling tools
export const TOOL_MESSAGES: Record<string, string[]> = {
  execute_code: [
    'Running your code...',
    'Executing in the sandbox...',
    'Processing the code...',
  ],
  web_search: [
    'Searching the web...',
    'Looking this up...',
    'Researching online...',
  ],
  web_browse: [
    'Browsing the page...',
    'Reading the content...',
    'Fetching the page...',
  ],
  search_knowledge_base: [
    'Searching the knowledge base...',
    'Looking through your documents...',
    'Retrieving relevant context...',
  ],
  create_chart: [
    'Generating a visualization...',
    'Building the chart...',
    'Preparing the data view...',
  ],
  create_ui: [
    'Building the interface...',
    'Assembling the form...',
    'Generating the UI...',
  ],
};

/**
 * Returns a thinking message appropriate for the given elapsed time.
 * Uses a seeded pick per phase so the message stays stable within a phase
 * but changes when transitioning to the next phase.
 */
export function getThinkingMessage(elapsedMs: number, seed: number): string {
  for (const phase of PHASE_MESSAGES) {
    if (elapsedMs < phase.maxMs) {
      const idx = seed % phase.messages.length;
      return phase.messages[idx];
    }
  }
  // Fallback (shouldn't reach here due to Infinity)
  const last = PHASE_MESSAGES[PHASE_MESSAGES.length - 1];
  return last.messages[seed % last.messages.length];
}

/**
 * Returns a tool-specific message if available, otherwise null.
 */
export function getToolMessage(toolName: string, seed: number): string | null {
  const messages = TOOL_MESSAGES[toolName];
  if (!messages) return null;
  return messages[seed % messages.length];
}
