/* PCBS Job Board – Screen capture: sharing the game window, grabbing a frame, pasted / dropped screenshots. */
// ================= screen capture =================
let stream = null;
$("#btnShare").onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    stopStream();
    stream = s;
    $("#video").srcObject = stream;
    stream.getVideoTracks()[0].onended = () => {
      stream = null;
      setStatus();
    };
    try {
      await $("#video").play();
    } catch {}
    setStatus();
    warmReader();
  } catch (err) {
    toast("Screen sharing was cancelled or blocked.");
  }
};
function stopStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  $("#video").srcObject = null;
}
$("#btnStop").onclick = () => {
  stopStream();
  setStatus();
  toast("Screen capture stopped");
};
$("#btnChange").onclick = () => $("#btnShare").onclick();
function setStatus() {
  startLive();
  $("#btnShare").hidden = !!stream;
  $("#scrChip").hidden = !stream;
}
async function grabFrame() {
  const track = stream.getVideoTracks()[0];
  let c = null;
  if (window.ImageCapture) {
    try {
      const bmp = await new ImageCapture(track).grabFrame();
      c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      if (isBlack(c)) c = null;
    } catch {
      c = null;
    }
  }
  if (!c) {
    const v = $("#video");
    try {
      await v.play();
    } catch {}
    for (let i = 0; i < 20 && (!v.videoWidth || v.readyState < 2); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => r()) : setTimeout(r, 200)));
    c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
  }
  return { url: c.toDataURL("image/png"), black: isBlack(c) };
}
function isBlack(c) {
  if (!c.width || !c.height) return true;
  const t = document.createElement("canvas");
  t.width = 64;
  t.height = 36;
  const g = t.getContext("2d");
  g.drawImage(c, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  return sum / (d.length / 4) < 12;
}
let liveTimer = null;
function startLive() {
  const cv = $("#live"),
    v = $("#video");
  clearInterval(liveTimer);
  if (!stream) return;
  liveTimer = setInterval(() => {
    if (v.videoWidth) cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height);
  }, 1000);
}
const BLACK_HELP = `The captured image is black. Try, in this order:<br>
1. Click the <b>screen preview</b> in the top bar (change screen) and choose the <b>Entire screen</b> tab → screen 1 (not the “Window” tab).<br>
2. Switch chiaki-ng from fullscreen to a maximised window.<br>
3. Browser Settings → System → turn <b>off “Use graphics/hardware acceleration”</b>, restart the browser.<br>
Meanwhile: press <b>Win+Shift+S</b>, snip screen 1, and <b>Ctrl+V</b> into this page.`;
async function startCapture(forJob) {
  if (!stream) {
    toast("Click “Connect screen” first and pick screen 1 – or paste/drop a screenshot.");
    return;
  }
  const f = await grabFrame();
  openReview(f.url, null, forJob);
  showBlack(f.black);
}
function showBlack(b) {
  $("#blackWarn").innerHTML = BLACK_HELP;
  $("#blackWarn").hidden = !b;
}
$("#btnCapture").onclick = () => startCapture(null);
$("#btnManual").onclick = () => openReview(null, null);
window.addEventListener("paste", e => {
  const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith("image/"));
  if (f) readImg(f);
});
let dragDepth = 0;
window.addEventListener("dragenter", e => {
  if (e.dataTransfer.types.includes("Files")) {
    dragDepth++;
    $("#drop").style.display = "flex";
  }
});
window.addEventListener("dragleave", e => {
  if (e.dataTransfer.types.includes("Files") && --dragDepth <= 0) {
    dragDepth = 0;
    $("#drop").style.display = "none";
  }
});
window.addEventListener("dragover", e => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
window.addEventListener("drop", e => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  dragDepth = 0;
  $("#drop").style.display = "none";
  const f = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
  if (f) readImg(f);
});
function readImg(f) {
  const r = new FileReader();
  r.onload = () => {
    if (typeof flipTakeImage === "function" && flipTakeImage(r.result)) return;
    if ($("#dlgReview").open && rev) addShot(r.result, rev.forJob ? "parts" : "auto");
    else openReview(r.result, null);
  };
  r.readAsDataURL(f);
}
