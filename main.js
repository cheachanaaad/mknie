import {HumanMessage} from '@langchain/core/messages';
import {ChatGoogleGenerativeAI} from '@langchain/google-genai';
import {GoogleGenerativeAI} from '@google/generative-ai';
import Base64 from 'base64-js';
import MarkdownIt from 'markdown-it';
import './style.css';

const form = document.querySelector('form');
const output = document.querySelector('.output');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const scrollSound = document.getElementById('scrollSound');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingAnimationImg = document.getElementById('loadingAnimation');
const finalResult = document.getElementById('finalResult');

const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

const EXPERT_PROMPT = `
너는 동양 관상학을 30년 이상 연구한 정통 관상 전문가다.
분석은 반드시 전통 관상 이론 체계를 기반으로 한다. 현대 심리학적 해석이나 과학적 반박은 포함하지 말고, 전통 관상학적 상징과 해석만 제시하라.
한국어로 답변하라.
`;

let isAnimating = false;
let soundTimer = null;

// 애니메이션 프레임 설정 (transparent_frames 폴더 이미지 활용)
const totalFrames = 10;
const frames = Array.from({ length: totalFrames }, (_, i) => `/animation_frames/frame_${String(i).padStart(4, '0')}.png`);
let currentFrame = 0;
let direction = 1;
let animationInterval = null;

// 이미지 프리로드
frames.forEach(src => {
  const img = new Image();
  img.src = src;
});

const startLoadingAnimation = () => {
  if (animationInterval) clearInterval(animationInterval);
  currentFrame = 0;
  direction = 1;
  animationInterval = setInterval(() => {
    // 처음 -> 끝 -> 처음 (Ping-pong) 로직
    currentFrame += direction;
    
    if (currentFrame >= totalFrames - 1) {
      currentFrame = totalFrames - 1;
      direction = -1; // 끝에서 다시 역방향으로
    } else if (currentFrame <= 0) {
      currentFrame = 0;
      direction = 1; // 처음에서 다시 정방향으로
    }
    
    loadingAnimationImg.src = frames[currentFrame];
  }, 100); // 100ms 간격
};

const stopLoadingAnimation = () => {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
};

const playScrollSound = (duration) => {
  if (!scrollSound) return;
  if (soundTimer) clearTimeout(soundTimer);
  scrollSound.currentTime = 0;
  scrollSound.play().catch(() => {});
  soundTimer = setTimeout(() => {
    scrollSound.pause();
    scrollSound.currentTime = 0;
  }, duration);
};

const getAnimationDuration = () => {
  return window.innerWidth <= 768 ? 800 : 1200;
};

imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (file && !isAnimating) {
    isAnimating = true;
    const uploadScroll = imageInput.closest('.scroll-wrapper');
    uploadScroll.classList.remove('open');
    void uploadScroll.offsetWidth;

    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
        uploadPlaceholder.style.display = 'none';
        playScrollSound(getAnimationDuration());
        requestAnimationFrame(() => {
          uploadScroll.classList.add('open');
          isAnimating = false;
        });
      };
      reader.readAsDataURL(file);
    }, 1000); 
  }
};

form.onsubmit = async ev => {
  ev.preventDefault();
  
  if (!imageInput.files[0]) {
    uploadPlaceholder.innerHTML = '<p style="font-size: 1.5rem; color: #ff4d4d;">사진을 먼저 올리시오!</p>';
    return;
  }
  
  if (isAnimating) return;
  
  const uploadScroll = document.querySelector('form .scroll-wrapper');
  uploadScroll.classList.remove('open');
  
  setTimeout(() => {
    loadingOverlay.style.display = 'flex';
    startLoadingAnimation();
    finalResult.style.display = 'none';
    output.innerHTML = '';
  }, 800);

  if (scrollSound) {
    scrollSound.currentTime = 0;
    scrollSound.play().catch(() => {});
  }

  try {
    const file = imageInput.files[0];
    const imageBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result.split(',')[1]);
      reader.readAsDataURL(file);
    });

    const vision = new ChatGoogleGenerativeAI({
      modelName: 'gemini-1.5-flash',
      apiKey: apiKey,
    });

    const contents = [
      new HumanMessage({
        content: [
          { type: 'text', text: EXPERT_PROMPT },
          { type: 'image_url', image_url: `data:image/png;base64,${imageBase64}` },
        ],
      }),
    ];

    const streamRes = await vision.stream(contents);
    const buffer = [];
    const md = new MarkdownIt();

    for await (const chunk of streamRes) {
      buffer.push(chunk.content);
    }

    const fullAnalysis = buffer.join('');
    
    stopLoadingAnimation();
    loadingOverlay.style.display = 'none';
    finalResult.style.display = 'block';
    output.innerHTML = md.render(fullAnalysis);

    await generateNanoBananaImage(fullAnalysis);

  } catch (e) {
    stopLoadingAnimation();
    loadingOverlay.style.display = 'none';
    uploadPlaceholder.innerHTML = `<p style="color: #ff4d4d;">차질이 생겼소: ${e.message}</p>`;
  }
};

async function generateNanoBananaImage(analysisText) {
  const imageSection = document.getElementById('aiImageSection');
  const generatedImg = document.getElementById('generatedImage');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const prompt = `A mystical oriental ink-wash painting illustration representing this destiny: ${analysisText.substring(0, 200)}. Focus on symbolic elements like golden dragons or soaring cranes. Professional digital art, cinematic lighting, 4k.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);
    
    if (imagePart) {
      imageSection.style.display = 'block';
      generatedImg.src = `data:image/png;base64,${imagePart.inlineData.data}`;
    }
  } catch (error) {
    console.error("이미지 생성 오류:", error);
  }
}
