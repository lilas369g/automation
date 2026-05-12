import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SUPPORTED_ACTIONS = new Set([
  "create_node",
  "add_node_to_workspace",
  "set_workspace_text",
  "run_linked_flow",
  "run_node",
  "update_node",
  "delete_node",
  "explain_current_flow",
  "ask_clarification"
]);

const SYSTEM_PROMPT = `
You are an assistant inside a custom Automation Tool web app.

The app supports automation nodes:
- Log
- Color
- Uppercase
- Copy
- Alert

If the user asks a general software/knowledge question, answer normally.

If the user asks to control this app, return an automation action JSON.
Do NOT answer app commands as if they are about n8n, Node-RED, Zapier, Make, Figma, or other platforms.

Important Arabic meanings:
- "عقدة الطباعة", "نود طباعة", "print node" means Log node.
- "الفلو", "مساحة التفعيل", "الوورك سبيس" means Activation Workspace / active flow.
- "ضيف عقدة الطباعة للفلو" means add/create a Log node in the current app flow.

The user message may be provided as JSON. Treat userMessage as the actual user text.

Always return ONLY valid JSON:
{
  "type": "normal_chat" | "automation_action",
  "reply": "text to show user",
  "action": null | {
    "name": "create_node" | "add_node_to_workspace" | "set_workspace_text" | "run_linked_flow" | "run_node" | "update_node" | "delete_node" | "explain_current_flow" | "ask_clarification",
    "args": {}
  }
}

For general questions:
{
  "type": "normal_chat",
  "reply": "answer",
  "action": null
}

For automation commands:
Return automation_action.

Backend examples:
User:
"ضفلي عقدة الطباعة للفلو"

Return:
{
  "type": "automation_action",
  "reply": "سأضيف عقدة طباعة إلى الفلو.",
  "action": {
    "name": "create_node",
    "args": {
      "type": "Log",
      "title": "Log Node",
      "addToWorkspace": true
    }
  }
}

User:
"احكيلي عن umbrella activities in software engineering"

Return:
{
  "type": "normal_chat",
  "reply": "full useful answer...",
  "action": null
}
`.trim();

function normalChat(reply) {
  return {
    type: "normal_chat",
    reply,
    action: null
  };
}

function normalizeAIResponse(value) {
  const reply = typeof value?.reply === "string" ? value.reply : "";
  const type = value?.type === "automation_action" ? "automation_action" : "normal_chat";
  const action = value?.action && typeof value.action === "object"
    ? {
      name: typeof value.action.name === "string" ? value.action.name : "",
      args: value.action.args && typeof value.action.args === "object" ? value.action.args : {}
    }
    : null;

  if (type !== "automation_action" || !action) {
    return normalChat(reply || "I could not generate a response.");
  }

  if (!SUPPORTED_ACTIONS.has(action.name)) {
    return normalChat(reply || "The AI returned an unsupported automation action.");
  }

  return {
    type: "automation_action",
    reply,
    action
  };
}

function safeParseAIResponse(text) {
  const rawText = typeof text === "string" ? text.trim() : "";
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return normalizeAIResponse(JSON.parse(cleaned));
  } catch (error) {
    return normalChat(rawText || "I could not generate a response.");
  }
}

function buildFriendlyAIError(error) {
  const status = error?.status || error?.code;
  const message = String(error?.message || "").toLowerCase();

  if (status === 401 || message.includes("unauthorized") || message.includes("api key")) {
    return normalChat("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
  }

  if (status === 429 || message.includes("rate limit")) {
    return normalChat("The AI provider rate limit was reached. Please wait or switch provider.");
  }

  if (status === 503 || message.includes("unavailable") || message.includes("overloaded")) {
    return normalChat("The AI provider is temporarily overloaded or unavailable. Please try again in a moment.");
  }

  if (status === 400) {
    return normalChat("The AI request was invalid. Please check the backend prompt or request format.");
  }

  return normalChat("The AI service could not process this request right now. Please try again.");
}

async function callOpenRouter(message, automationState) {
  if (!process.env.OPENROUTER_API_KEY) {
    return normalChat("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
  }

  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
  console.log("OpenRouter model:", model);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Automation AI Chatbot"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify({
            userMessage: message,
            automationState: automationState || null
          })
        }
      ],
      temperature: 0.4,
      max_tokens: 800
    })
  });

  if (response.status === 429) {
    return normalChat("The AI provider rate limit was reached. Please wait or switch provider.");
  }

  if (response.status === 401) {
    return normalChat("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`OpenRouter request failed with status ${response.status}: ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return safeParseAIResponse(text);
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, automationState } = req.body;

    if (!message) {
      return res.status(400).json(normalChat("message is required"));
    }

    const aiResponse = await callOpenRouter(message, automationState);
    return res.status(200).json(aiResponse);
  } catch (error) {
    console.error("AI request failed:", error);
    return res.status(200).json(buildFriendlyAIError(error));
  }
});

app.listen(PORT, () => {
  console.log(`AI backend running on port ${PORT} with provider openrouter`);
});
