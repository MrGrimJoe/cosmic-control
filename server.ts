import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

dotenv.config();

// Initialize Firebase Admin
// Note: In this environment, service account credentials are often pre-configured 
// or can be initialized with default credentials if running in Cloud Run.
// However, since we have firebase-applet-config.json, we can use that to get some info.
// For admin SDK, we usually need a service account key. 
// If not provided, we might have to rely on ADC (Application Default Credentials).
initializeApp();

const db = getFirestore();
const auth = getAuth();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  
  // Management Layer Resolver (Phase 2 hybrid)
  app.post('/api/management/resolve', async (req, res) => {
    try {
      const { request_type, org_context, payload } = req.body;
      
      const SYSTEM_PROMPT = `
You are the management engine for a recursive organisational system.
You receive an org schema (dept → lead → roles, infinitely nested) and a
management request. You return a JSON decision only — no explanation,
no preamble, no markdown.

Rules:
- A lead has authority over all roles and sub-leads in their dept and below
- A user holding multiple roles has the union of all their permissions
- Help requests route to the direct lead of the dept the task belongs to
- If the requesting user holds roles in multiple depts, resolve by task dept
- Never grant authority upward — a role cannot affect its own lead
- Return { "error": "insufficient_context" } if the schema is incomplete

Always return valid JSON. Never return anything else.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: JSON.stringify({
          request_type,
          org_context,
          payload
        }),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              decision: { type: Type.STRING },
              target_user_id: { type: Type.STRING },
              reason: { type: Type.STRING },
              confidence: { type: Type.STRING },
              error: { type: Type.STRING }
            }
          }
        }
      });

      const decision = JSON.parse(response.text || '{}');
      res.json(decision);
    } catch (error) {
      console.error('Management Layer Error:', error);
      res.status(500).json({ error: 'internal_server_error' });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
