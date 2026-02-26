import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

  const prompt = "A mystical oriental ink-wash painting of a golden dragon emerging from clouds, representing a king's destiny, cinematic lighting, 4k, professional digital art.";

  try {
    console.log("나노바나나 모델로 이미지 생성 중...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);

    if (imagePart) {
      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      fs.writeFileSync('public/generated_sample.png', buffer);
      console.log("이미지 생성 완료: public/generated_sample.png");
    } else {
      console.log("이미지 데이터를 받지 못했습니다. 모델 응답 확인 필요.");
    }
  } catch (error) {
    console.error("오류 발생:", error.message);
  }
}

run();
