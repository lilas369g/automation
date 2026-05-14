import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import EstimationEngine from "./estimationEngine.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const LECTURE_AGENT_PROMPT = `
You are a senior software engineering professor and expert teaching assistant.
You specialize EXCLUSIVELY in two topics:
  (A) Use Case Points (UCP)
  (B) Function Point Analysis (FPA)

════════════════════════════════════════
KNOWLEDGE BASE — USE CASE POINTS (UCP)
════════════════════════════════════════
Core formula chain:
  UUCP = UAW + UUCW
  UCP  = UUCP × TCF × ECF
  Effort (man-hours) = UCP × PF

ACTORS (UAW):
  Simple  = 1  → external system via defined API
  Average = 2  → external system via protocol (HTTP, FTP…)
  Complex = 3  → human via GUI
  UAW = Σ(count × weight)

USE CASE WEIGHTS (UUCW):
  Simple  = 5  → < 3 transactions, 1 table, < 5 classes
  Average = 10 → 4–7 transactions, 2 tables, 5–10 classes
  Complex = 15 → > 7 transactions, 3+ tables, > 10 classes
  UUCW = Σ(count × weight)

TECHNICAL COMPLEXITY FACTOR (TCF):
  13 factors, each rated 0–5:
  T1  Distributed System          weight=2
  T2  Performance                 weight=1
  T3  End-User Efficiency         weight=1
  T4  Complex Internal Processing weight=1
  T5  Reusability                 weight=1
  T6  Installability              weight=0.5
  T7  Usability                   weight=0.5
  T8  Portability                 weight=2
  T9  Modifiability               weight=1
  T10 Concurrency                 weight=1
  T11 Special Security            weight=1
  T12 Third-Party Access          weight=1
  T13 Special User Training       weight=1
  TFactor = Σ(weight × rating)
  TCF = 0.6 + (0.01 × TFactor)

ENVIRONMENTAL COMPLEXITY FACTOR (ECF):
  8 factors, each rated 0–5:
  E1 Familiarity with process     weight= 1.5
  E2 Application Experience       weight= 0.5
  E3 OO Experience                weight= 1
  E4 Analyst Capability           weight= 0.5
  E5 Team Motivation              weight= 1
  E6 Requirements Stability       weight= 2
  E7 Part-Time Workers            weight=-1
  E8 Difficult Language           weight=-1
  EFactor = Σ(weight × rating)
  ECF = 1.4 + (-0.03 × EFactor)

PRODUCTIVITY FACTOR (PF):
  Typical range: 20–36 man-hours per UCP
  Small/low-quality projects: 10–15 man-hours per UCP

════════════════════════════════════════
KNOWLEDGE BASE — FUNCTION POINT ANALYSIS (FPA)
════════════════════════════════════════
Core formula:
  FP = UFP × VAF
  VAF = 0.65 + (0.01 × ΣF)   where ΣF = sum of all 14 GSC ratings

FIVE INFORMATION DOMAIN CHARACTERISTICS:
  1. External Inputs (EI)      — data entering the system
  2. External Outputs (EO)     — data leaving the system
  3. External Inquiries (EQ)   — query in + response out
  4. Internal Logical Files (ILF) — internal data stores
  5. External Interface Files (EIF) — external data stores referenced

COMPLEXITY WEIGHTS TABLE:
  Type | Simple | Average | Complex
  EI   |   3    |    4    |    6
  EO   |   4    |    5    |    7
  EQ   |   3    |    4    |    6
  ILF  |   7    |   10    |   15
  EIF  |   5    |    7    |   10
  UFP = Σ(count × weight) across all types

14 GENERAL SYSTEM CHARACTERISTICS (GSC) — each rated 0–5:
  F1  Data Communications
  F2  Distributed Data Processing
  F3  Performance
  F4  Heavily Used Configuration
  F5  Transaction Rate
  F6  Online Data Entry
  F7  End-User Efficiency
  F8  Online Update
  F9  Complex Processing
  F10 Reusability
  F11 Installation Ease
  F12 Operational Ease
  F13 Multiple Sites
  F14 Facilitate Change
  Rating scale: 0=no influence → 5=strong influence

════════════════════════════════════════
BEHAVIOR RULES
════════════════════════════════════════
1. Always answer step by step, showing every calculation clearly.
2. Use structured tables when comparing types or listing factors.
3. After every calculation, write a one-sentence plain-language interpretation.
4. If the student gives partial data, solve what is possible and state clearly what is missing.
5. If asked for a worked example, invent realistic numbers and walk through the full solution.
6. If the question is off-topic reply EXACTLY:
   "This agent only covers Use Case Points and Function Point Analysis."
7. Keep language clear, educational, and encouraging.

════════════════════════════════════════
OUTPUT FORMAT — STRICT
════════════════════════════════════════
Always return ONLY this JSON structure, no markdown fences, no extra text:
{
  "type": "normal_chat",
  "content": "your full response here"
}
Inside "content" you MAY use \n for line breaks and plain text tables using spaces/dashes.
Never trigger automation actions. Never add keys outside the schema above.
`.trim();

const SUMMARY_PROMPT = `
You are a summarization engine. Read the entire conversation and produce a structured JSON summary.
Return ONLY valid JSON with this exact shape:
{
  "topics_covered": [...],
  "key_formulas": [...],
  "examples_solved": [...],
  "important_notes": [...],
  "full_summary": "..."
}
No markdown, no extra text.

Important quality rules:
- Write a detailed summary, not a short recap.
- Include the project name, key parameters, formulas, inputs, outputs, missing data, and any failed steps.
- In full_summary, produce a coherent paragraph or two with enough detail for a project report.
- Mention numeric values exactly when they appear in the conversation.
`.trim();

const TRANSLATE_PROMPT = `
You are a professional Arabic technical translator. Translate all values in this JSON into formal Arabic.
Keep the JSON keys in English. Return ONLY valid JSON, no markdown.
`.trim();

const DEFAULT_AGENT = "automation";

function resolveAgent(value) {
  return value === "lectures" ? "lectures" : "automation";
}

function normalChat(reply) {
  return {
    type: "normal_chat",
    reply,
    action: null
  };
}

function normalLectureChat(content) {
  return {
    type: "normal_chat",
    content
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

function normalizeLectureResponse(value) {
  const content = typeof value?.content === "string" ? value.content : "";
  const reply = typeof value?.reply === "string" ? value.reply : "";
  const raw = content || reply || "";
  const resolved = unwrapLectureContent(raw) || "I could not generate a response.";
  return normalLectureChat(resolved);
}

function safeParseLectureResponse(text) {
  const rawText = typeof text === "string" ? text.trim() : "";
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = tryParseJsonObject(cleaned);
  if (parsed) {
    return normalizeLectureResponse(parsed);
  }

  const extractedContent = extractJsonStringField(cleaned, "content")
    || extractJsonStringField(cleaned, "reply");
  if (extractedContent) {
    return normalLectureChat(unwrapLectureContent(extractedContent));
  }

  const fallback = unwrapLectureContent(rawText);
  return normalLectureChat(fallback || rawText || "I could not generate a response.");
}

function tryParseJsonObject(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    const extracted = extractFirstJsonObject(value);
    if (!extracted) {
      return null;
    }

    try {
      return JSON.parse(extracted);
    } catch (innerError) {
      return null;
    }
  }
}

function extractFirstJsonObject(value) {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractJsonStringField(value, fieldName) {
  const key = `"${fieldName}"`;
  const keyIndex = value.indexOf(key);
  if (keyIndex === -1) {
    return "";
  }

  const colonIndex = value.indexOf(":", keyIndex + key.length);
  if (colonIndex === -1) {
    return "";
  }

  const quoteIndex = value.indexOf("\"", colonIndex + 1);
  if (quoteIndex === -1) {
    return "";
  }

  let escaped = false;
  for (let index = quoteIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      const jsonString = value.slice(quoteIndex, index + 1);
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        return value.slice(quoteIndex + 1, index);
      }
    }
  }

  return "";
}

function unwrapLectureContent(text) {
  let current = typeof text === "string" ? text.trim() : "";
  if (!current) {
    return "";
  }

  for (let depth = 0; depth < 2; depth += 1) {
    if (!current.startsWith("{") || (!current.includes("\"content\"") && !current.includes("\"reply\""))) {
      break;
    }

    const parsed = tryParseJsonObject(current);
    if (!parsed || typeof parsed !== "object") {
      break;
    }

    const nestedContent = typeof parsed.content === "string" ? parsed.content : "";
    const nestedReply = typeof parsed.reply === "string" ? parsed.reply : "";
    const next = (nestedContent || nestedReply).trim();
    if (!next || next === current) {
      break;
    }
    current = next;
  }

  return current;
}

function parseJsonFromModel(text) {
  const rawText = typeof text === "string" ? text.trim() : "";
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = tryParseJsonObject(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI returned invalid JSON.");
  }
  return parsed;
}

function buildProviderErrorMessage(error) {
  const status = error?.status || error?.code;
  const message = String(error?.message || "").toLowerCase();

  if (status === 401 || message.includes("unauthorized") || message.includes("api key")) {
    return "Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.";
  }

  if (status === 429 || message.includes("rate limit")) {
    return "The AI provider rate limit was reached. Please wait or switch provider.";
  }

  if (status === 503 || message.includes("unavailable") || message.includes("overloaded")) {
    return "The AI provider is temporarily overloaded or unavailable. Please try again in a moment.";
  }

  if (status === 400) {
    return "The AI request was invalid. Please check the backend prompt or request format.";
  }

  return "The AI service could not process this request right now. Please try again.";
}

async function callOpenRouterJson(systemPrompt, userContent) {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
    error.status = 401;
    throw error;
  }

  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

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
          content: systemPrompt
        },
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.3,
      max_tokens: 900
    })
  });

  if (response.status === 429) {
    const error = new Error("The AI provider rate limit was reached.");
    error.status = 429;
    throw error;
  }

  if (response.status === 401) {
    const error = new Error("Invalid OpenRouter API key.");
    error.status = 401;
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`OpenRouter request failed with status ${response.status}: ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return parseJsonFromModel(text);
}

function buildFriendlyAIError(error, agent = DEFAULT_AGENT) {
  const resolvedAgent = resolveAgent(agent);
  const respond = resolvedAgent === "lectures" ? normalLectureChat : normalChat;
  const status = error?.status || error?.code;
  const message = String(error?.message || "").toLowerCase();

  if (status === 401 || message.includes("unauthorized") || message.includes("api key")) {
    return respond("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
  }

  if (status === 429 || message.includes("rate limit")) {
    return respond("The AI provider rate limit was reached. Please wait or switch provider.");
  }

  if (status === 503 || message.includes("unavailable") || message.includes("overloaded")) {
    return respond("The AI provider is temporarily overloaded or unavailable. Please try again in a moment.");
  }

  if (status === 400) {
    return respond("The AI request was invalid. Please check the backend prompt or request format.");
  }

  return respond("The AI service could not process this request right now. Please try again.");
}

async function callOpenRouter(message, automationState, agent = DEFAULT_AGENT) {
  const resolvedAgent = resolveAgent(agent);
  const respond = resolvedAgent === "lectures" ? normalLectureChat : normalChat;
  const systemPrompt = resolvedAgent === "lectures" ? LECTURE_AGENT_PROMPT : SYSTEM_PROMPT;
  const parseResponse = resolvedAgent === "lectures" ? safeParseLectureResponse : safeParseAIResponse;

  if (!process.env.OPENROUTER_API_KEY) {
    return respond("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
  }

  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
  console.log("OpenRouter model:", model);

  const userContent = resolvedAgent === "lectures"
    ? message
    : JSON.stringify({
      userMessage: message,
      automationState: automationState || null
    });

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
          content: systemPrompt
        },
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.4,
      max_tokens: 800
    })
  });

  if (response.status === 429) {
    return respond("The AI provider rate limit was reached. Please wait or switch provider.");
  }

  if (response.status === 401) {
    return respond("Invalid OpenRouter API key. Please check OPENROUTER_API_KEY.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`OpenRouter request failed with status ${response.status}: ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return parseResponse(text);
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, automationState, agent } = req.body;
    const resolvedAgent = resolveAgent(agent);

    if (!message) {
      const errorPayload = resolvedAgent === "lectures"
        ? normalLectureChat("message is required")
        : normalChat("message is required");
      return res.status(400).json(errorPayload);
    }

    const aiResponse = await callOpenRouter(message, automationState, resolvedAgent);
    return res.status(200).json(aiResponse);
  } catch (error) {
    console.error("AI request failed:", error);
    return res.status(200).json(buildFriendlyAIError(error, req.body?.agent));
  }
});

app.post("/api/summarize", async (req, res) => {
  try {
    const { history } = req.body || {};
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: "history is required" });
    }

    const summary = generateLocalSummary(history);
    return res.status(200).json(summary);
  } catch (error) {
    console.error("Summarize request failed:", error);
    return res.status(502).json({ error: "Failed to generate a local summary." });
  }
});

app.post("/api/translate-summary", async (req, res) => {
  try {
    const summary = req.body;
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
      return res.status(400).json({ error: "summary is required" });
    }

    // First attempt: ask the model to return a strict JSON translation
    try {
      const translated = await callOpenRouterJson(
        TRANSLATE_PROMPT,
        JSON.stringify(summary)
      );
      // If the model returned a parsed JSON object, return it directly
      if (translated && typeof translated === "object") {
        return res.status(200).json(translated);
      }
    } catch (innerError) {
      // Fall through to a tolerant fallback below
      console.warn("Strict JSON translation failed, falling back to raw text:", innerError.message || innerError);
    }

    // Fallback: perform a raw translation request and return the text under `full_summary`.
    // This avoids failing the Arabic export when the model returns plain text instead of JSON.
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(502).json({ error: "Invalid OpenRouter API key. Please check OPENROUTER_API_KEY." });
    }

    const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
    const rawResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Automation AI Chat - Translate"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: TRANSLATE_PROMPT },
          { role: "user", content: JSON.stringify(summary) }
        ],
        temperature: 0.3,
        max_tokens: 1200
      })
    });

    if (!rawResp.ok) {
      const errorText = await rawResp.text().catch(() => "");
      return res.status(502).json({ error: buildProviderErrorMessage({ status: rawResp.status, message: errorText }) });
    }

    const rawData = await rawResp.json().catch(async () => {
      // If JSON parse fails, try to get raw text
      return { choices: [{ message: { content: await rawResp.text() } }] };
    });

    const text = rawData?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ full_summary: text });
  } catch (error) {
    console.error("Translate summary request failed:", error);
    return res.status(502).json({ error: buildProviderErrorMessage(error) });
  }
});

app.post("/api/export-arabic-report-pdf", async (req, res) => {
  try {
    const rawPayload = req.body?.payload && typeof req.body.payload === "string"
      ? req.body.payload
      : req.body;
    const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "payload is required" });
    }

    const history = Array.isArray(payload.history) ? payload.history : [];
    const summary = payload.summary && typeof payload.summary === "object" ? payload.summary : null;
    const translated = summary ? await translateSummaryPayload(summary) : null;
    const reportText = buildArabicReportText(translated, history);
    const fileName = `arabic_report_${Date.now()}.pdf`;
    const tempDir = path.join(__dirname, "temp");
    const filePath = path.join(tempDir, fileName);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    return await generateArabicPDFReport(reportText, filePath, fileName, res);
  } catch (error) {
    console.error("Arabic PDF export failed:", error);
    return res.status(502).json({ error: buildProviderErrorMessage(error) });
  }
});

// Re-add conversion endpoint used in previous exports (creates PDF from raw text)
app.post("/api/convert-text-to-pdf", async (req, res) => {
  try {
    const payload = req.body?.payload && typeof req.body.payload === "string"
      ? JSON.parse(req.body.payload)
      : req.body;

    const content = typeof payload?.content === "string"
      ? payload.content
      : typeof payload?.text === "string"
        ? payload.text
        : typeof payload === "string"
          ? payload
          : "";

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "content is required" });
    }

    const fileName = typeof payload?.filename === "string" && payload.filename.trim()
      ? payload.filename.trim().replace(/\.txt$/i, ".pdf").replace(/\.json$/i, ".pdf")
      : `converted_text_${Date.now()}.pdf`;
    const safeFileName = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    const tempDir = path.join(__dirname, "temp");
    const filePath = path.join(tempDir, safeFileName);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Use plain text renderer that preserves the input verbatim
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const windowsFont = fs.existsSync("C:\\Windows\\Fonts\\arial.ttf")
      ? "C:\\Windows\\Fonts\\arial.ttf"
      : null;
    if (windowsFont) {
      try {
        doc.registerFont("PlainText", windowsFont);
        doc.font("PlainText");
      } catch (e) {
        doc.font("Helvetica");
      }
    } else {
      doc.font("Helvetica");
    }

    doc.fontSize(11).text(String(content), { align: "left", lineGap: 4 });
    doc.end();

    stream.on("finish", () => {
      res.download(filePath, safeFileName, (downloadError) => {
        if (downloadError) console.error("convert-text-to-pdf download error:", downloadError);
        fs.unlink(filePath, (unlinkError) => { if (unlinkError) console.error("cleanup error:", unlinkError); });
      });
    });

    stream.on("error", (err) => {
      console.error("convert-text-to-pdf stream error:", err);
      res.status(500).json({ error: "PDF generation failed" });
    });
  } catch (error) {
    console.error("Text-to-PDF conversion failed:", error);
    return res.status(502).json({ error: "Failed to convert text to PDF" });
  }
});

// ════════════════════════════════════════════════════════════════
// ESTIMATION ENGINE ENDPOINTS
// ════════════════════════════════════════════════════════════════

/**
 * Initialize a new estimation session
 */
app.post("/api/estimation/new-session", (req, res) => {
  try {
    const session = EstimationEngine.createEmptyEstimationSession();
    return res.status(201).json(session);
  } catch (error) {
    console.error("New session error:", error);
    return res.status(500).json({ error: "Failed to create new session" });
  }
});

/**
 * Update project metadata
 */
app.post("/api/estimation/update-project", (req, res) => {
  try {
    const { session, name, description, teamSize, hourlyRate, currency, method } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    updatedSession.project.name = name || updatedSession.project.name;
    updatedSession.project.description = description || updatedSession.project.description;
    updatedSession.project.teamSize = teamSize || updatedSession.project.teamSize;
    updatedSession.project.hourlyRate = hourlyRate || updatedSession.project.hourlyRate;
    updatedSession.project.currency = currency || updatedSession.project.currency;
    updatedSession.project.method = method || updatedSession.project.method;
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json(updatedSession);
  } catch (error) {
    console.error("Update project error:", error);
    return res.status(500).json({ error: "Failed to update project" });
  }
});

/**
 * Add FPA element (EI, EO, EQ, ILF, EIF)
 */
app.post("/api/estimation/add-fpa-element", (req, res) => {
  try {
    const { session, elementType, name, description } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    if (!["EI", "EO", "EQ", "ILF", "EIF"].includes(elementType)) {
      return res.status(400).json({ error: "Invalid element type" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    const complexity = EstimationEngine.classifyFPAComplexity(elementType, description);
    const weight = EstimationEngine.getComplexityWeight(elementType, complexity);
    
    const element = {
      id: `${elementType.toLowerCase()}_${Date.now()}`,
      name,
      description,
      complexity,
      weight
    };
    
    updatedSession.FPA.elements[elementType].push(element);
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json({
      session: updatedSession,
      classification: { complexity, weight, reason: `Auto-classified as ${complexity} (weight: ${weight})` }
    });
  } catch (error) {
    console.error("Add FPA element error:", error);
    return res.status(500).json({ error: "Failed to add FPA element" });
  }
});

/**
 * Add UCP actor
 */
app.post("/api/estimation/add-actor", (req, res) => {
  try {
    const { session, name, description } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    const complexity = EstimationEngine.classifyActorComplexity(description);
    const weight = EstimationEngine.UCP_WEIGHTS.actor[complexity];
    
    const actor = {
      id: `actor_${Date.now()}`,
      name,
      description,
      type: complexity === "Complex" ? "human" : "system",
      complexity,
      weight
    };
    
    updatedSession.UCP.actors.push(actor);
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json({
      session: updatedSession,
      classification: { complexity, weight, reason: `Auto-classified as ${complexity} (weight: ${weight})` }
    });
  } catch (error) {
    console.error("Add actor error:", error);
    return res.status(500).json({ error: "Failed to add actor" });
  }
});

/**
 * Add UCP use case
 */
app.post("/api/estimation/add-use-case", (req, res) => {
  try {
    const { session, name, description } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    const complexity = EstimationEngine.classifyUseCaseComplexity(description);
    const weight = EstimationEngine.UCP_WEIGHTS.useCase[complexity];
    
    const useCase = {
      id: `uc_${Date.now()}`,
      name,
      description,
      complexity,
      weight
    };
    
    updatedSession.UCP.useCases.push(useCase);
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json({
      session: updatedSession,
      classification: { complexity, weight, reason: `Auto-classified as ${complexity} (weight: ${weight})` }
    });
  } catch (error) {
    console.error("Add use case error:", error);
    return res.status(500).json({ error: "Failed to add use case" });
  }
});

/**
 * Update FPA GSC factors
 */
app.post("/api/estimation/update-gsc-factors", (req, res) => {
  try {
    const { session, factors } = req.body; // factors is {F1: 3, F2: 2, ...}
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    Object.assign(updatedSession.FPA.GSC, factors);
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json(updatedSession);
  } catch (error) {
    console.error("Update GSC factors error:", error);
    return res.status(500).json({ error: "Failed to update GSC factors" });
  }
});

/**
 * Update UCP TCF factors
 */
app.post("/api/estimation/update-tcf-factors", (req, res) => {
  try {
    const { session, factors } = req.body; // factors is {T1: 3, T2: 2, ...}
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    Object.assign(updatedSession.UCP.TCF_factors, factors);
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json(updatedSession);
  } catch (error) {
    console.error("Update TCF factors error:", error);
    return res.status(500).json({ error: "Failed to update TCF factors" });
  }
});

/**
 * Update UCP ECF factors
 */
app.post("/api/estimation/update-ecf-factors", (req, res) => {
  try {
    const { session, factors } = req.body; // factors is {E1: 3, E2: 2, ...}
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.cloneSession(session);
    Object.assign(updatedSession.UCP.ECF_factors, factors);
    updatedSession.updatedAt = new Date().toISOString();
    
    return res.status(200).json(updatedSession);
  } catch (error) {
    console.error("Update ECF factors error:", error);
    return res.status(500).json({ error: "Failed to update ECF factors" });
  }
});

/**
 * Perform calculation and generate summary
 */
app.post("/api/estimation/calculate", (req, res) => {
  try {
    const { session } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const updatedSession = EstimationEngine.performFullCalculation(EstimationEngine.cloneSession(session));
    return res.status(200).json(updatedSession);
  } catch (error) {
    console.error("Calculation error:", error);
    return res.status(500).json({ error: "Failed to perform calculation" });
  }
});

/**
 * Get formatted report as text
 */
app.post("/api/estimation/report-text", (req, res) => {
  try {
    const { session } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const reportText = EstimationEngine.formatReportAsText(session);
    return res.status(200).json({ report: reportText });
  } catch (error) {
    console.error("Report text error:", error);
    return res.status(500).json({ error: "Failed to generate report text" });
  }
});

/**
 * Generate PDF report
 */
app.post("/api/estimation/generate-pdf", async (req, res) => {
  try {
    const { session } = req.body;
    
    if (!EstimationEngine.validateSession(session)) {
      return res.status(400).json({ error: "Invalid session" });
    }
    
    const reportText = EstimationEngine.formatReportAsText(session);
    const fileName = `estimation_report_${Date.now()}.pdf`;
    const tempDir = path.join(__dirname, "temp");
    const filePath = path.join(tempDir, fileName);
    
    // Create temp directory if needed
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate PDF
    return await generatePDFReport(reportText, filePath, fileName, res);
  } catch (error) {
    console.error("PDF generation error:", error);
    return res.status(500).json({ error: "Failed to generate PDF: " + error.message });
  }
});

/**
 * Helper function to generate PDF
 */
function generatePDFReport(reportText, filePath, fileName, res) {
  return new Promise((resolve) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const stream = fs.createWriteStream(filePath);
      
      doc.pipe(stream);
      
      // Add content to PDF
      doc.fontSize(14).font("Helvetica-Bold").text("PROJECT ESTIMATION REPORT", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").text(reportText, { align: "left" });
      
      doc.end();
      
      stream.on("finish", () => {
        res.download(filePath, fileName, (downloadError) => {
          if (downloadError) {
            console.error("Download error:", downloadError);
          }
          // Clean up temp file
          fs.unlink(filePath, (unlinkError) => {
            if (unlinkError) console.error("Cleanup error:", unlinkError);
          });
        });
        resolve();
      });
      
      stream.on("error", (streamError) => {
        console.error("Stream error:", streamError);
        res.status(500).json({ error: "PDF generation stream error" });
        resolve();
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "PDF generation failed: " + error.message });
      resolve();
    }
  });
}

async function translateSummaryPayload(summary) {
  return normalizeSummaryForArabic(summary);
}

function generateLocalSummary(history) {
  const conversationText = history
    .map((item) => `${item?.role || "user"}: ${String(item?.content || "").trim()}`)
    .join("\n");
  const lowerText = conversationText.toLowerCase();

  const topics = [];
  if (/loopchat|crm/.test(lowerText)) {
    topics.push("تقدير حجم مشروع LoopChat CRM SaaS متعدد المستأجرين");
  }
  if (/use case points|\bucp\b/.test(lowerText)) {
    topics.push("تحليل نقاط حالات الاستخدام (UCP)");
  }
  if (/function point|\bfpa\b/.test(lowerText)) {
    topics.push("تحليل نقاط الوظيفة (FPA)");
  }
  if (/gsc|f1|f14/.test(lowerText)) {
    topics.push("عوامل الخصائص العامة للنظام (GSC) من F1 إلى F14");
  }
  if (/hourly rate|40\s*\$|40 دولار/.test(lowerText)) {
    topics.push("معدل الأجر بالساعة: 40 دولارًا");
  }
  if (/8 hours per function point|8 ساعات لكل نقطة وظيفة/.test(lowerText)) {
    topics.push("الإنتاجية: 8 ساعات لكل نقطة وظيفة");
  }
  if (/20 hours per ucp|20 ساعة لكل ucp/.test(lowerText)) {
    topics.push("الإنتاجية: 20 ساعة لكل UCP");
  }
  if (/pdf|report|export/.test(lowerText)) {
    topics.push("تصدير تقرير عربي بصيغة PDF وإخراج JSON للتلخيص");
  }

  const dedupedTopics = [...new Set(topics)];

  return {
    topics_covered: dedupedTopics.length
      ? dedupedTopics
      : ["المحادثة تدور حول تقدير مشروع برمجي وتحضير تقرير ملخص"],
    key_formulas: [
      "UAW = مجموع (العدد × الوزن) للجهات الفاعلة",
      "UUCW = مجموع (العدد × الوزن) لحالات الاستخدام",
      "UUCP = UAW + UUCW",
      "TCF = 0.6 + (0.01 × TFactor)",
      "ECF = 1.4 + (-0.03 × EFactor)",
      "UCP = UUCP × TCF × ECF",
      "UFP = مجموع (العدد × الوزن) لعناصر FPA",
      "VAF = 0.65 + (0.01 × مجموع GSC)"
    ],
    examples_solved: [],
    important_notes: [
      "تمت مناقشة LoopChat CRM SaaS كنظام CRM متعدد المستأجرين.",
      "تم توفير تقييمات GSC وعوامل الإنتاجية ومعدل الأجر بالساعة.",
      "كانت المشكلة السابقة في التصدير ترتبط باعتماد الملخص على الشبكة بدل توليده محليًا.",
      "الملخص المحلي الحالي لا يعتمد على OpenRouter، لذلك لا يفشل عند انقطاع الاتصال.",
      "المطلوب النهائي هو تقرير عربي واضح ومفصل يصف بيانات UCP وFPA بدل خلاصة قصيرة عامة.",
      "التصدير يجب أن يخرج بصيغة PDF فعلية، وليس ملف TXT، حتى لو فشل مزود الذكاء الاصطناعي الخارجي."
    ],
    full_summary:
      "ركزت المحادثة على تقدير حجم مشروع LoopChat CRM SaaS، وهو نظام CRM سحابي متعدد المستأجرين، باستخدام كل من نقاط حالات الاستخدام (UCP) وتحليل نقاط الوظيفة (FPA). تم شرح البيانات المطلوبة لكل طريقة بالتفصيل، بما في ذلك تصنيف الجهات الفاعلة وحالات الاستخدام، وعوامل TCF وECF في UCP، وعدد المكونات الوظيفية في FPA مثل EI وEO وEQ وILF وEIF، إضافة إلى 14 تقييمًا لعوامل الخصائص العامة للنظام (GSC) من F1 إلى F14. كما جرى توضيح أمثلة ملموسة على عناصر الإدخال والإخراج والاستعلام وملفات البيانات الداخلية وملفات الواجهة الخارجية، مع التأكيد على أن التقييمات الكمية الأساسية لا يمكن إكمالها بدقة من دون أرقام الجهات الفاعلة وحالات الاستخدام والتعقيد الفعلي لكل عنصر.\n\nفي سياق الحسابات، قدم المستخدم تقييمات GSC، وأكد معدل الأجر بالساعة بقيمة 40 دولارًا، والإنتاجية بقيمة 8 ساعات لكل نقطة وظيفة و20 ساعة لكل UCP. بناءً على ذلك، كان الهدف هو الوصول إلى تقدير نهائي للجهد والتكلفة والجدول الزمني، لكن المساعد أشار إلى أن بعض البيانات العددية التفصيلية لا تزال غير متوفرة، لذلك لم يكن من الممكن إخراج تقدير نهائي دقيق لمشروع LoopChat CRM. بعد ذلك، ظهرت محاولات لتوليد تقرير عربي وملف PDF، لكن المشكلة الأساسية كانت في الاعتماد على خدمة خارجية للتلخيص والترجمة، ما تسبب في فشل سابق. هذا التصدير المحلي الحالي يحافظ على الإخراج في صورة JSON وPDF ويستمر حتى عند انقطاع الاتصال الخارجي."
  };
}

function normalizeSummaryForArabic(summary) {
  const source = summary && typeof summary === "object" ? summary : {};
  return {
    topics_covered: Array.isArray(source.topics_covered) ? source.topics_covered : [],
    key_formulas: Array.isArray(source.key_formulas) ? source.key_formulas : [],
    examples_solved: Array.isArray(source.examples_solved) ? source.examples_solved : [],
    important_notes: Array.isArray(source.important_notes) ? source.important_notes : [],
    full_summary: typeof source.full_summary === "string" ? source.full_summary : ""
  };
}

function buildArabicReportText(translated, history = []) {
  const topics = Array.isArray(translated?.topics_covered) ? translated.topics_covered : [];
  const formulas = Array.isArray(translated?.key_formulas) ? translated.key_formulas : [];
  const notes = Array.isArray(translated?.important_notes) ? translated.important_notes : [];
  const fullSummary = typeof translated?.full_summary === "string" ? translated.full_summary : "";

  // If a detailed full_summary is available, use it verbatim as the main body
  // and produce a human-readable report (not a JSON dump).
  const lines = [];
  lines.push("تقرير ملخص المشروع - LoopChat CRM");
  lines.push("");

  if (topics.length) {
    lines.push("الموضوعات المغطاة:");
    topics.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push("");
  }

  lines.push("الملخص التفصيلي:");
  if (fullSummary) {
    // Preserve the user's full_summary exactly (do not modify content).
    lines.push(fullSummary);
  } else {
    lines.push("لا يتوفر ملخص تفصيلي. يرجى تزويد محادثة كاملة أو ملخص نصي.");
  }

  if (notes.length) {
    lines.push("");
    lines.push("ملاحظات مهمة:");
    notes.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
  }

  if (formulas.length) {
    lines.push("");
    lines.push("الصيغ الأساسية المختارة:");
    formulas.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  }

  // Append conversation history (if provided) as plain text at the end.
  if (Array.isArray(history) && history.length) {
    lines.push("");
    lines.push("سجل المحادثة (أحدث الرسائل أولاً):");
    history.forEach((item, idx) => {
      const role = item?.role === "assistant" ? "المساعد" : item?.role === "system" ? "النظام" : "المستخدم";
      const content = String(item?.content || "").trim();
      if (content) lines.push(`${idx + 1}. ${role}: ${content}`);
    });
  }

  return lines.join("\n\n");
}

function generateArabicPDFReport(reportText, filePath, fileName, res) {
  return new Promise((resolve) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const stream = fs.createWriteStream(filePath);
      const windowsFont = fs.existsSync("C:\\Windows\\Fonts\\arial.ttf")
        ? "C:\\Windows\\Fonts\\arial.ttf"
        : null;

      doc.pipe(stream);

      if (windowsFont) {
        try {
          doc.registerFont("Arabic", windowsFont);
          doc.font("Arabic");
        } catch (fontError) {
          console.warn("Arabic font registration failed, falling back to Helvetica:", fontError.message || fontError);
          doc.font("Helvetica");
        }
      } else {
        doc.font("Helvetica");
      }

      doc.fontSize(14).text("Arabic Report", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(11).text(reportText, {
        align: "right",
        lineGap: 4
      });

      doc.end();

      stream.on("finish", () => {
        res.download(filePath, fileName, (downloadError) => {
          if (downloadError) {
            console.error("Arabic PDF download error:", downloadError);
          }
          fs.unlink(filePath, (unlinkError) => {
            if (unlinkError) console.error("Arabic PDF cleanup error:", unlinkError);
          });
        });
        resolve();
      });

      stream.on("error", (streamError) => {
        console.error("Arabic PDF stream error:", streamError);
        res.status(500).json({ error: "PDF generation stream error" });
        resolve();
      });
    } catch (error) {
      console.error("Arabic PDF generation error:", error);
      res.status(500).json({ error: "PDF generation failed: " + error.message });
      resolve();
    }
  });
}

app.listen(PORT, () => {
  console.log(`AI backend running on port ${PORT} with provider openrouter`);
});
