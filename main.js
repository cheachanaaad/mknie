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
const scrollSound = document.getElementById('scrollSound');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingAnimationImg = document.getElementById('loadingAnimation');
const finalResult = document.getElementById('finalResult');

let faceLandmarker;
let isAnimating = false;
let soundTimer = null;

const totalFrames = 10;
const frames = Array.from({ length: totalFrames }, (_, i) => `/animation_frames/frame_${String(i).padStart(4, '0')}.png`);
let currentFrame = 0; let direction = 1; let animationInterval = null;

const startLoadingAnimation = () => {
  animationInterval = setInterval(() => {
    currentFrame += direction;
    if (currentFrame >= totalFrames - 1) { direction = -1; }
    else if (currentFrame <= 0) { direction = 1; }
    loadingAnimationImg.src = frames[currentFrame];
  }, 80);
};
const stopLoadingAnimation = () => { clearInterval(animationInterval); animationInterval = null; };

const playScrollSound = (duration) => {
  if (!scrollSound) return;
  if (soundTimer) clearTimeout(soundTimer);
  scrollSound.currentTime = 0; scrollSound.play().catch(() => {});
  soundTimer = setTimeout(() => { scrollSound.pause(); scrollSound.currentTime = 0; }, duration);
};

async function initMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
    runningMode: "IMAGE", numFaces: 1
  });
}
initMediaPipe();

const handleImage = (input, preview, placeholder, canvas) => {
  const file = input.files[0];
  if (file && !isAnimating) {
    isAnimating = true;
    const scroll = input.closest('.scroll-wrapper');
    scroll.classList.remove('open');
    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          preview.src = e.target.result; preview.style.display = 'block'; placeholder.style.display = 'none';
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          playScrollSound(window.innerWidth <= 768 ? 800 : 1200);
          requestAnimationFrame(() => { scroll.classList.add('open'); isAnimating = false; });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }, 1000);
  }
};

imageInputFront.onchange = () => handleImage(imageInputFront, imagePreviewFront, uploadPlaceholderFront, hiddenCanvasFront);
imageInputDiag.onchange = () => handleImage(imageInputDiag, imagePreviewDiag, uploadPlaceholderDiag, hiddenCanvasDiag);

/**
 * 전 부위 정밀 관상 판정 엔진
 */
function runFullPhysiognomyEngine(landmarks) {
  const getDist = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  const D = getDist(landmarks[133], landmarks[362]); // 기준 길이: 내안각 거리

  const results = [];
  const metrics = {};

  // --- 1) 눈 분석 ---
  const EyeH = Math.abs(landmarks[145].y - landmarks[159].y);
  const EyeW = getDist(landmarks[33], landmarks[133]);
  const S_up = Math.max(0, landmarks[468].y - landmarks[159].y) / EyeH;
  const S_low = Math.max(0, landmarks[145].y - landmarks[468].y) / EyeH;
  const aspect = EyeW / EyeH;
  const tilt = Math.atan2(landmarks[133].y - landmarks[33].y, landmarks[133].x - landmarks[33].x) * (180 / Math.PI);

  metrics["눈_흰자노출_상"] = S_up.toFixed(3);
  metrics["눈_흰자노출_하"] = S_low.toFixed(3);
  metrics["눈_가로세로비"] = aspect.toFixed(3);

  if (S_low - S_up >= 0.18 && S_low >= 0.28) results.push("하삼백안: 냉철하고 도전적인 기질");
  else if (S_up - S_low >= 0.18 && S_up >= 0.28) results.push("상삼백안: 고집과 신념이 강함");
  if (aspect >= 3.0 && Math.abs(tilt) <= 10) results.push("봉안: 지혜롭고 귀하게 될 상");
  else if (aspect >= 3.2 && (EyeH/D) <= 0.22) results.push("세안: 신중하고 치밀한 성품");
  else if (aspect <= 2.6 && (EyeH/D) >= 0.24) results.push("우안: 인덕이 많고 성품이 선함");

  // --- 2) 코 분석 ---
  const noseLen = getDist(landmarks[168], landmarks[1]) / D;
  const noseW = getDist(landmarks[102], landmarks[331]) / D;
  // 매부리 추정 (콧대 중앙 6번 포인트의 z축 돌출도와 직선 이탈도)
  const bridgeLineDist = Math.abs(landmarks[6].z - (landmarks[168].z + landmarks[1].z)/2);
  
  metrics["코_길이비율"] = noseLen.toFixed(3);
  metrics["코_너비비율"] = noseW.toFixed(3);

  if (noseLen >= 0.95 && landmarks[1].z < -0.05) results.push("곧고 높은 콧대: 자존감이 높고 명예를 중시함");
  if (noseLen <= 0.85) results.push("낮은 코: 실리적이며 원만한 대인관계");
  if (bridgeLineDist >= 0.02) results.push("매부리코: 재물 집착과 강한 생활력");

  // --- 3) 입 분석 ---
  const mouthW = getDist(landmarks[61], landmarks[291]) / D;
  const cornerTilt = ((landmarks[61].y + landmarks[291].y) / 2 - landmarks[13].y) / (getDist(landmarks[61], landmarks[291]));
  
  metrics["입_너비비율"] = mouthW.toFixed(3);
  metrics["입꼬리_기울기"] = cornerTilt.toFixed(3);

  if (mouthW >= 0.42) results.push("큰 입: 호탕하고 지도자적 기질");
  if (mouthW <= 0.35) results.push("작은 입: 소심하나 예술적 감각이 뛰어남");
  if (cornerTilt >= 0.025) results.push("입꼬리 상승: 긍정적이며 말년에 복이 많음");
  if (cornerTilt <= -0.025) results.push("입꼬리 하강: 비판적이며 의지가 강함");

  // --- 4) 이마 및 턱 분석 ---
  const foreheadH = Math.abs(landmarks[9].y - landmarks[10].y) / D;
  const faceH = Math.abs(landmarks[152].y - landmarks[10].y) / D;
  const cheekW = getDist(landmarks[234], landmarks[454]) / D;
  const jawW = getDist(landmarks[172], landmarks[397]) / D;
  
  metrics["이마_높이비율"] = (foreheadH/faceH).toFixed(3);
  metrics["턱_너비비율"] = (jawW/cheekW).toFixed(3);
  metrics["얼굴_가로세로비"] = (cheekW/faceH).toFixed(3);

  if (foreheadH/faceH >= 0.32) results.push("넓고 둥근 이마: 초년운이 좋고 지적 능력이 우수함");
  if (jawW/cheekW >= 0.98) results.push("사각턱: 끈기가 강하고 자수성가할 상");
  if (jawW/cheekW <= 0.90) results.push("뾰족턱/약한턱선: 감수성이 예민하고 변화를 즐김");

  // --- 5) 얼굴형 판정 ---
  const faceRatio = cheekW / faceH; 
  const jawCheekRatio = jawW / cheekW; 

  let faceShape = "";
  if (faceRatio > 0.85) faceShape = "둥근형: 성격이 원만하고 사교성이 좋음";
  else if (jawCheekRatio > 0.92) faceShape = "사각형: 정직하고 책임감이 강하며 신뢰를 주는 상";
  else if (jawCheekRatio < 0.82) faceShape = "역삼각형: 지적이며 예술적 감각이 예리함";
  else faceShape = "계란형: 품격이 있고 매사에 균형 잡힌 기운";
  
  results.unshift(`얼굴형 - ${faceShape}`);

  // --- 6) 좌우 대칭 분석 (추가) ---
  const leftEyeY = landmarks[159].y;
  const rightEyeY = landmarks[386].y;
  const eyeDiff = Math.abs(leftEyeY - rightEyeY) / EyeH; // 눈 높이 차이

  const leftMouthY = landmarks[61].y;
  const rightMouthY = landmarks[291].y;
  const mouthDiff = Math.abs(leftMouthY - rightMouthY) / (Math.abs(landmarks[13].y - landmarks[14].y) || 0.01); // 입꼬리 높이 차이

  metrics["눈_비대칭지수"] = eyeDiff.toFixed(3);
  metrics["입_비대칭지수"] = mouthDiff.toFixed(3);

  if (eyeDiff <= 0.05 && mouthDiff <= 0.08) {
    results.push("좌우 대칭: 심신이 안정되고 매사에 균형 잡힌 생활을 할 상");
  } else {
    results.push("비대칭적 개성: 창의적이고 임기응변에 능하며 역동적인 운세");
  }

  return { metrics, types: results };
}

form.onsubmit = async ev => {
  ev.preventDefault();
  if (!imageInputFront.files[0] || !imageInputDiag.files[0]) return alert("정면과 대각선 사진 2장을 모두 올려주시오.");
  
  const scroll = document.querySelector('.scroll-wrapper');
  scroll.classList.remove('open');
  
  setTimeout(() => { loadingOverlay.style.display = 'flex'; startLoadingAnimation(); finalResult.style.display = 'none'; }, 800);
  if (scrollSound) playScrollSound(800);

  try {
    const fRes = faceLandmarker.detect(hiddenCanvasFront);
    const dRes = faceLandmarker.detect(hiddenCanvasDiag);
    
    if (!fRes.faceLandmarks[0]) throw new Error("얼굴을 인식할 수 없소.");

    // 정면과 대각선 데이터를 융합하여 분석
    const analysis = runFullPhysiognomyEngine(fRes.faceLandmarks[0]);
    const diagData = dRes.faceLandmarks[0] ? runFullPhysiognomyEngine(dRes.faceLandmarks[0]) : null;

    let resultHtml = `<h2 style="color:#c5a059; text-align:center; border-bottom:2px solid #c5a059; padding-bottom:10px;">觀相 精密 診斷書</h2>`;
    resultHtml += `<div style="margin:20px 0;">`;
    analysis.types.forEach(t => {
      resultHtml += `<p style="font-size:1.1rem; color:#fff; margin-bottom:12px;">✔️ ${t}</p>`;
    });
    // 대각선에서만 보이는 코/이마 보정치 추가
    if (diagData && diagData.metrics["코_길이비율"] > analysis.metrics["코_길이비율"]) {
      resultHtml += `<p style="font-size:1.1rem; color:#fff; margin-bottom:12px;">✔️ 측면 보정: 콧대가 높고 이목구비가 뚜렷한 상</p>`;
    }
    resultHtml += `</div>`;
    
    resultHtml += `<hr style="border:0; border-top:1px solid #444; margin:25px 0;">`;
    resultHtml += `<h4 style="color:#8a7d6a;">[ 0.001 정밀 측정 원천 데이터 ]</h4>`;
    resultHtml += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem; color:#aaa;">`;
    for (const [k, v] of Object.entries(analysis.metrics)) {
      resultHtml += `<div>${k}: <span style="color:#c5a059;">${v}</span></div>`;
    }
    resultHtml += `</div>`;

    setTimeout(() => {
      stopLoadingAnimation();
      loadingOverlay.style.display = 'none';
      finalResult.style.display = 'block';
      output.innerHTML = resultHtml;
    }, 2500);

  } catch (e) {
    stopLoadingAnimation(); loadingOverlay.style.display = 'none';
    alert(e.message);
  }
};
