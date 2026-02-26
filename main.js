import {FaceLandmarker, FilesetResolver} from "@mediapipe/tasks-vision";
import MarkdownIt from 'markdown-it';
import './style.css';

const form = document.getElementById('physiognomyForm');
const output = document.querySelector('.output');
const imageInputFront = document.getElementById('imageInputFront');
const imageInputDiag = document.getElementById('imageInputDiag');
const imagePreviewFront = document.getElementById('imagePreviewFront');
const imagePreviewDiag = document.getElementById('imagePreviewDiag');
const uploadPlaceholderFront = document.getElementById('uploadPlaceholderFront');
const uploadPlaceholderDiag = document.getElementById('uploadPlaceholderDiag');
const hiddenCanvasFront = document.getElementById('hiddenCanvasFront');
const hiddenCanvasDiag = document.getElementById('hiddenCanvasDiag');
const canvasFront = document.getElementById('canvasFront');
const canvasDiag = document.getElementById('canvasDiag');
const scrollSound = document.getElementById('scrollSound');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingAnimationImg = document.getElementById('loadingAnimation');
const finalResult = document.getElementById('finalResult');

let faceLandmarker;
let isAnimating = false;
let soundTimer = null;

const totalFrames = 60;
const frames = Array.from({ length: totalFrames }, (_, i) => `/animation_frames/frame_${String(i).padStart(4, '0')}.jpg`);
let currentFrame = 0; let direction = 1; let animationInterval = null;

const startLoadingAnimation = () => {
  animationInterval = setInterval(() => {
    currentFrame += direction;
    if (currentFrame >= totalFrames - 1) { currentFrame = totalFrames - 1; direction = -1; }
    else if (currentFrame <= 0) { currentFrame = 0; direction = 1; }
    loadingAnimationImg.src = frames[currentFrame];
  }, 50);
};
const stopLoadingAnimation = () => { clearInterval(animationInterval); animationInterval = null; };

const playScrollSound = (duration) => {
  if (!scrollSound) return;
  if (soundTimer) clearTimeout(soundTimer);
  scrollSound.currentTime = 0; scrollSound.play().catch(() => {});
  soundTimer = setTimeout(() => { scrollSound.pause(); scrollSound.currentTime = 0; }, duration);
};

async function initEngines() {
  try {
    // 1. MediaPipe 초기화 (랜드마크 및 관상 분석용)
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
      runningMode: "IMAGE", numFaces: 1
    });

    // 2. face-api.js 초기화 (모바일 최적화: TinyFaceDetector 사용)
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
    
    console.log("모든 분석 엔진 초기화 완료");
  } catch (err) {
    console.error("엔진 초기화 실패:", err);
  }
}
initEngines();

const handleImageChange = (input, preview, placeholder, canvas) => {
  const file = input.files[0];
  if (file && !isAnimating) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        preview.src = e.target.result; preview.style.display = 'block'; placeholder.style.display = 'none';
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
};

imageInputFront.onchange = () => handleImageChange(imageInputFront, imagePreviewFront, uploadPlaceholderFront, hiddenCanvasFront);
imageInputDiag.onchange = () => handleImageChange(imageInputDiag, imagePreviewDiag, uploadPlaceholderDiag, hiddenCanvasDiag);

const clip = (x) => Math.min(1, Math.max(0, x));
// 이미지 비율(ar)을 적용한 실제 거리 계산 함수 (나이 165세 오류 해결 핵심)
const getDist = (p1, p2, ar = 1) => Math.sqrt(Math.pow((p2.x - p1.x) * ar, 2) + Math.pow(p2.y - p1.y, 2));

/**
 * face-api.js와 MediaPipe를 조합한 정밀 분석 엔진
 */
async function analyzeIdentity(canvasFront, lms) {
  const ar = canvasFront.width / canvasFront.height;
  const D = getDist(lms[133], lms[362], ar);
  
  // 1. face-api.js를 이용한 나이/성별 측정 (모바일 최적화 탐지기 사용)
  let age = null, gender = null;
  try {
    const result = await faceapi.detectSingleFace(canvasFront, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
    if (result) {
      age = Math.round(result.age);
      gender = result.gender === 'male' ? '남성' : '여성';
    }
  } catch (e) { console.error("face-api 분석 실패:", e); }

  // 2. AI 실패 시 또는 데이터 보정을 위한 휴리스틱 분석 (나이 165세 방지 로직 포함)
  if (!age || !gender) {
    const faceLen = getDist(lms[10], lms[152], ar) / D;
    const eyeH = Math.abs(lms[159].y - lms[145].y), eyeW = getDist(lms[33], lms[133], ar);
    const eyeRatio = eyeH / eyeW;
    
    age = Math.round(25 + (faceLen - 3.1) * 25 + (0.3 - eyeRatio) * 60);
    age = Math.max(15, Math.min(85, age)); // 현실적인 범위로 제한

    const browDist = (getDist(lms[105], lms[33], ar) + getDist(lms[334], lms[263], ar)) / 2 / D;
    const jawWidth = getDist(lms[172], lms[397], ar) / D;
    gender = (browDist * 0.3 + jawWidth * 0.7) > 1.2 ? "남성" : "여성";
  }

  // 3. 살집(육질) 분석 (MediaPipe 랜드마크 활용)
  const cheekDist = getDist(lms[234], lms[454], ar) / D;
  const jawDist = getDist(lms[172], lms[397], ar) / D;
  const fullnessRatio = cheekDist / jawDist;
  
  let meatText = fullnessRatio < 1.05 ? "살집이 풍만하고 재복이 넘치는 상" : (fullnessRatio < 1.15 ? "살과 뼈가 조화로운 귀한 상" : "골격이 뚜렷하고 기개가 높은 상");

  return { age, gender, fullness: meatText };
}

function drawLandmarks(lms, src, target) {
  target.width = src.width; target.height = src.height;
  const ctx = target.getContext('2d'); ctx.drawImage(src, 0, 0);
  ctx.fillStyle = "#00ff00";
  lms.forEach(p => { ctx.beginPath(); ctx.arc(p.x * target.width, p.y * target.height, 1.2, 0, 2*Math.PI); ctx.fill(); });
}

function runMasterScoringEngine(fLms, dLms, canvas) {
  const ar = canvas.width / canvas.height;
  const D = getDist(fLms[133], fLms[362], ar);
  const res = {};

  const EyeH = Math.abs(fLms[145].y - fLms[159].y), EyeW = getDist(fLms[33], fLms[133], ar);
  const Aspect = EyeW / EyeH, S_up = Math.max(0, fLms[468].y - fLms[159].y) / EyeH, S_low = Math.max(0, fLms[145].y - fLms[468].y) / EyeH;
  const Tilt = Math.atan2(fLms[133].y - fLms[33].y, (fLms[133].x - fLms[33].x) * ar) * (180 / Math.PI);

  const s_low3 = clip(((S_low - S_up) - 0.01)/0.08) * clip((S_low - 0.08)/0.05);
  const s_up3 = clip(((S_up - S_low) - 0.01)/0.08) * clip((S_up - 0.08)/0.05);
  
  if (s_low3 >= 0.05) { res.eye = "하삼백안: 냉철하고 야망이 큰 상"; }
  else if (s_up3 >= 0.05) { res.eye = "상삼백안: 집념과 고집이 강한 상"; }
  else {
    const s_bong = clip((Aspect - 2.7)/0.8) * clip((Tilt - 2)/8) * (1 - clip((Math.max(S_up, S_low) - 0.10)/0.10));
    const s_se = clip((Aspect - 3.1)/0.8) * (1 - clip((EyeH/D - 0.23)/0.08));
    const s_woo = clip((2.7 - Aspect)/0.8) * clip((EyeH/D - 0.22)/0.12) * (1 - clip((Math.abs(Tilt)-6)/8));
    const scores = { "봉안": s_bong, "세안": s_se, "우안": s_woo };
    res.eye = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  }

  const BridgeProj = Math.abs(dLms[1].z - dLms[168].z) / (D / ar);
  res.nose = clip((BridgeProj - 0.24)/0.10) > clip((0.22 - BridgeProj)/0.08) ? "곧고 높은 콧대" : "낮은 코";
  const MW = getDist(fLms[61], fLms[291], ar) / D;
  res.mouth = (MW > 0.42 ? "큰 입" : "작은 입");
  const cheekW = getDist(fLms[234], fLms[454], ar) / D, faceH = getDist(fLms[10], fLms[152], ar) / D;
  const JawCheek = (getDist(fLms[172], fLms[397], ar) / D) / cheekW, WH = cheekW / faceH;
  const s_round = 0.6*clip((WH - 0.76)/0.10) + 0.4*clip((0.96 - JawCheek)/0.10);
  const s_square = 0.7*clip((JawCheek - 0.96)/0.08) + 0.3*clip((WH - 0.70)/0.10);
  res.faceShape = s_round > s_square ? (s_round > 0.5 ? "둥근형" : "계란형") : (s_square > 0.5 ? "사각형" : "계란형");

  return res;
}

form.onsubmit = async ev => {
  ev.preventDefault();
  if (!imageInputFront.files[0] || !imageInputDiag.files[0]) return alert("사진 2장을 모두 올려주시오.");
  const scroll = document.querySelector('.scroll-wrapper');
  scroll.classList.remove('open');
  setTimeout(() => { loadingOverlay.style.display = 'flex'; startLoadingAnimation(); finalResult.style.display = 'none'; }, 800);
  if (scrollSound) playScrollSound(800);

  try {
    const fRes = faceLandmarker.detect(hiddenCanvasFront), dRes = faceLandmarker.detect(hiddenCanvasDiag);
    if (!fRes.faceLandmarks[0] || !dRes.faceLandmarks[0]) throw new Error("인식 실패");
    
    drawLandmarks(fRes.faceLandmarks[0], hiddenCanvasFront, canvasFront);
    drawLandmarks(dRes.faceLandmarks[0], hiddenCanvasDiag, canvasDiag);
    
    // face-api.js와 MediaPipe를 조합한 정밀 분석 실행
    const identity = await analyzeIdentity(hiddenCanvasFront, fRes.faceLandmarks[0]);
    const analysis = runMasterScoringEngine(fRes.faceLandmarks[0], dRes.faceLandmarks[0], hiddenCanvasFront);

    let html = `<h2 style="color:#c5a059; text-align:center; border-bottom:2px solid #c5a059; padding-bottom:15px;">觀상 精밀 診단 결과서</h2>`;
    html += `<div style="margin:20px 0; display:grid; gap:12px;">`;
    html += `<div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; border-left:4px solid #c5a059;">
              <span style="color:#c5a059; font-weight:bold; font-size:0.85rem;">기본 정보</span>
              <p style="color:#fff; font-size:1.05rem; margin:4px 0 0 0;">나이: ${identity.age}세 전후 / 성별: ${identity.gender}</p>
            </div>`;
    html += `<div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; border-left:4px solid #c5a059;">
              <span style="color:#c5a059; font-weight:bold; font-size:0.85rem;">육질(살집)</span>
              <p style="color:#fff; font-size:1.05rem; margin:4px 0 0 0;">${identity.fullness}</p>
            </div>`;
    for (const [key, val] of Object.entries(analysis)) {
      html += `<div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; border-left:4px solid #c5a059;">
                <span style="color:#c5a059; font-weight:bold; font-size:0.85rem;">${key.toUpperCase()}</span>
                <p style="color:#fff; font-size:1.05rem; margin:4px 0 0 0;">${val}</p>
              </div>`;
    }
    html += `</div>`;
    
    setTimeout(() => { stopLoadingAnimation(); loadingOverlay.style.display = 'none'; finalResult.style.display = 'block'; output.innerHTML = html; }, 3500);
  } catch (e) { stopLoadingAnimation(); loadingOverlay.style.display = 'none'; alert(e.message); }
};
