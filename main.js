import {FaceLandmarker, FilesetResolver} from "@mediapipe/tasks-vision";
import MarkdownIt from 'markdown-it';
import './style.css';

const md = new MarkdownIt();

// DOM 요소들
const imageInputFront = document.getElementById('imageInputFront');
const imageInputDiag = document.getElementById('imageInputDiag');
const imagePreviewFront = document.getElementById('imagePreviewFront');
const imagePreviewDiag = document.getElementById('imagePreviewDiag');
const canvasFront = document.getElementById('canvasFront');
const canvasDiag = document.getElementById('canvasDiag');
const loadingOverlay = document.getElementById('loadingOverlay');
const finalResult = document.getElementById('finalResult');
const aiAnalysisBtn = document.getElementById('aiAnalysisBtn');
const output = document.querySelector('.output');

let faceLandmarker;
let croppedFrontBlob = null;
let croppedDiagBlob = null;

// 엔진 초기화
async function initEngines() {
  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { 
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU" 
      },
      runningMode: "IMAGE", numFaces: 1
    });
    console.log("✅ 얼굴 인식 엔진 준비 완료");
  } catch (err) { 
    console.error("❌ 엔진 로드 실패:", err);
  }
}
initEngines();

// 진짜 잘라내기(Crop) 함수
const cropFace = async (img) => {
  if (!faceLandmarker) return null;
  const results = faceLandmarker.detect(img);
  if (!results.faceLandmarks || results.faceLandmarks.length === 0) return null;

  const landmarks = results.faceLandmarks[0];
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  landmarks.forEach(p => {
    const x = p.x * w, y = p.y * h;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });

  const faceW = maxX - minX;
  const faceH = maxY - minY;
  const centerX = minX + faceW / 2;
  const centerY = minY + faceH / 2;

  // 증명사진 스타일 (얼굴의 약 2.5배 영역 확보)
  const cropSizeW = faceW * 2.5;
  const cropSizeH = cropSizeW * 1.33; // 3:4 비율

  const startX = centerX - (cropSizeW / 2);
  const startY = centerY - (cropSizeH * 0.4); // 얼굴을 약간 위로

  // 오프스크린 캔버스에서 실제로 잘라냄
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = 600;
  cropCanvas.height = 800;
  const ctx = cropCanvas.getContext('2d');
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 600, 800);
  
  // 원본에서 계산된 영역만 가져와서 600x800에 꽉 채워 그림
  ctx.drawImage(img, startX, startY, cropSizeW, cropSizeH, 0, 0, 600, 800);

  return new Promise(resolve => cropCanvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9));
};

const handleUpload = (input, preview, type) => {
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 업로드 표시용 임시 텍스트
    const placeholder = document.getElementById(`uploadPlaceholder${type.charAt(0).toUpperCase() + type.slice(1)}`);
    placeholder.innerHTML = "<p>얼굴 찾는 중...</p>";

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      const blob = await cropFace(img);
      if (blob) {
        if (type === 'front') croppedFrontBlob = blob;
        else croppedDiagBlob = blob;

        // 화면에 '잘린' 이미지를 즉시 표시
        preview.src = URL.createObjectURL(blob);
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        console.log(`✅ ${type} 잘라내기 성공`);
      } else {
        alert("얼굴을 찾지 못했소. 더 밝은 정면 사진을 올려주시오.");
        placeholder.innerHTML = "<p>다시 시도</p>";
      }
    };
  };
};

handleUpload(imageInputFront, imagePreviewFront, 'front');
handleUpload(imageInputDiag, imagePreviewDiag, 'diag');

// API 연결 확인 버튼
const checkApiBtn = document.getElementById('checkApiBtn');
checkApiBtn.onclick = async () => {
  checkApiBtn.innerText = "확인 중...";
  try {
    const response = await fetch('/api/check-key');
    const result = await response.json();
    
    const modal = document.getElementById('errorModal');
    const msgDiv = document.getElementById('errorMessage');
    
    if (result.success) {
      document.querySelector('#errorModal h3').innerText = "✅ 연결 성공";
      document.querySelector('#errorModal h3').style.color = "#28a745";
      msgDiv.innerText = `${result.message}\n\n키 미리보기: ${result.keyPreview}\n키 길이: ${result.keyLength}자`;
    } else {
      document.querySelector('#errorModal h3').innerText = "❌ 연결 실패";
      document.querySelector('#errorModal h3').style.color = "#ff4d4d";
      msgDiv.innerText = `에러: ${result.error}\n내용: ${result.details}`;
    }
    modal.style.display = 'flex';
  } catch (err) {
    alert("서버와 통신할 수 없소.");
  } finally {
    checkApiBtn.innerText = "API 연결 확인";
  }
};

aiAnalysisBtn.onclick = async () => {
  if (!croppedFrontBlob || !croppedDiagBlob) return alert("사진 2장을 모두 올려주시오.");

  loadingOverlay.style.display = 'flex';
  finalResult.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('front', croppedFrontBlob);
    formData.append('diag', croppedDiagBlob);
    formData.append('model', document.getElementById('modelSelect').value);

    const response = await fetch('/api/analyze', { method: 'POST', body: formData });
    const resData = await response.json();

    if (!response.ok) throw new Error(resData.details || resData.error || "서버 에러");

    // 결과 창에 잘린 사진 박아줌
    canvasFront.width = 600; canvasFront.height = 800;
    canvasFront.getContext('2d').drawImage(await createImageBitmap(croppedFrontBlob), 0, 0);
    canvasDiag.width = 600; canvasDiag.height = 800;
    canvasDiag.getContext('2d').drawImage(await createImageBitmap(croppedDiagBlob), 0, 0);

    output.innerHTML = `<div class="ai-report" style="user-select:text;">${md.render(resData.text)}</div>`;
    loadingOverlay.style.display = 'none';
    finalResult.style.display = 'block';
    window.scrollTo({ top: finalResult.offsetTop, behavior: 'smooth' });

  } catch (err) {
    loadingOverlay.style.display = 'none';
    const modal = document.getElementById('errorModal');
    document.getElementById('errorMessage').innerText = err.message;
    modal.style.display = 'flex';
  }
};
