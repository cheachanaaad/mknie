import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// 1. 정적 파일 서비스
app.use(express.static(path.join(__dirname, 'dist')));

const upload = multer();

const SYSTEM_PROMPT = `너는 30년 경력의 동양 관상학 전문가다.
반드시 전통 관상학 체계로만 분석하라. (현대 심리학/과학 배제)
[분석기준: 눈, 이마, 눈썹, 코, 입, 턱, 귀, 얼굴형]
[출력형식: 7단계 종합 분석 및 종합 등급]
답변은 명확하고 간결하게 하라.`;

// API: 연결 확인
app.get('/api/check-key', async (req, res) => {
  try {
    const key = (process.env.GOOGLE_API_KEY || "").replace(/["']/g, "").trim();
    if (!key) return res.status(400).json({ error: "API 키가 설정되지 않았소." });
    
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    await model.generateContent("test");
    res.json({ success: true, message: "연결 성공!" });
  } catch (e) {
    res.status(500).json({ error: "연결 실패", details: e.message });
  }
});

// API: 분석 실행
app.post('/api/analyze', upload.fields([{ name: 'front' }, { name: 'diag' }]), async (req, res) => {
  try {
    const key = (process.env.GOOGLE_API_KEY || "").replace(/["']/g, "").trim();
    if (!key) throw new Error("API 키가 없소.");
    
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    if (!req.files || !req.files['front'] || !req.files['diag']) {
      throw new Error("사진 두 장이 모두 필요하오.");
    }

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { inlineData: { data: req.files['front'][0].buffer.toString('base64'), mimeType: req.files['front'][0].mimetype } },
      { inlineData: { data: req.files['diag'][0].buffer.toString('base64'), mimeType: req.files['diag'][0].mimetype } }
    ]);
    res.json({ text: (await result.response).text() });
  } catch (e) {
    res.status(500).json({ error: "분석 에러", details: e.message });
  }
});

// 2. SPA 라우팅 대응 (모든 GET 요청 중 API가 아닌 경우 index.html 반환)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !path.extname(req.path)) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  next();
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 서버 구동 완료: http://localhost:${port}`);
});
