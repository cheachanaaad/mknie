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

// 애니메이션 설정
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

// MediaPipe 초기화 (로컬 구동)
async function initMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
    runningMode: "IMAGE", numFaces: 1
  });
}
initMediaPipe();

// 이미지 핸들러
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
 * 제공된 30개 수치 분류 로직 구현
 */
function runClassification(landmarks) {
  const getDist = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  
  // 기준 거리 D (내안각 거리)
  const D = getDist(landmarks[133], landmarks[362]);
  
  // 눈 지표
  const EyeH = Math.abs(landmarks[145].y - landmarks[159].y);
  const EyeW = getDist(landmarks[33], landmarks[133]);
  const S_up = Math.max(0, landmarks[468].y - landmarks[159].y) / EyeH;
  const S_low = Math.max(0, landmarks[145].y - landmarks[468].y) / EyeH;
  const aspect = EyeW / EyeH;
  const tilt = Math.atan2(landmarks[133].y - landmarks[33].y, landmarks[133].x - landmarks[33].x) * (180 / Math.PI);

  const results = [];
  
  // 판정 로직
  if (S_low - S_up >= 0.18 && S_low >= 0.28) results.push("하삼백안: 도전적이고 냉철한 기운");
  if (S_up - S_low >= 0.18 && S_up >= 0.28) results.push("상삼백안: 고집과 신념이 강한 상");
  if (aspect >= 3.0 && Math.abs(tilt) <= 10) results.push("봉안: 지혜롭고 귀한 신분을 얻을 상");
  if (aspect >= 3.2 && (EyeH/D) <= 0.22) results.push("세안: 신중하고 치밀한 성정");
  if (aspect <= 2.6 && (EyeH/D) >= 0.24) results.push("우안: 성품이 착하고 인덕이 많은 상");

  return {
    metrics: { 
      "기준거리(D)": D.toFixed(4), 
      "눈가로세로비": aspect.toFixed(3), 
      "흰자노출(상)": S_up.toFixed(3), 
      "흰자노출(하)": S_low.toFixed(3) 
    },
    types: results
  };
}

form.onsubmit = async ev => {
  ev.preventDefault();
  if (!imageInputFront.files[0]) return alert("사진을 올려주시오.");
  
  const scroll = document.querySelector('.scroll-wrapper');
  scroll.classList.remove('open');
  
  setTimeout(() => { loadingOverlay.style.display = 'flex'; startLoadingAnimation(); finalResult.style.display = 'none'; }, 800);
  if (scrollSound) playScrollSound(800);

  try {
    // MediaPipe 로컬 분석
    const fRes = faceLandmarker.detect(hiddenCanvasFront);
    if (!fRes.faceLandmarks[0]) throw new Error("얼굴을 인식할 수 없소.");

    const analysis = runClassification(fRes.faceLandmarks[0]);

    // 결과 HTML 생성 (API 없이 직접 작성)
    let resultHtml = `<h3>[ 정밀 분석 결과 ]</h3><ul style="list-style:none; padding:0;">`;
    analysis.types.forEach(t => {
      resultHtml += `<li style="margin-bottom:10px; color:#c5a059; font-weight:bold;">• ${t}</li>`;
    });
    resultHtml += `</ul><hr style="border:0; border-top:1px solid #c5a059; margin:20px 0;">`;
    resultHtml += `<h4>[ 추출 수치 데이터 ]</h4><pre style="font-size:0.8rem; line-height:1.6;">`;
    for (const [k, v] of Object.entries(analysis.metrics)) {
      resultHtml += `${k}: ${v}\n`;
    }
    resultHtml += `</pre>`;

    setTimeout(() => {
      stopLoadingAnimation();
      loadingOverlay.style.display = 'none';
      finalResult.style.display = 'block';
      output.innerHTML = resultHtml;
    }, 2000);

  } catch (e) {
    stopLoadingAnimation(); loadingOverlay.style.display = 'none';
    alert(e.message);
  }
};
