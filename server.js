const express = require("express");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;
const SITE_PASSWORD = process.env.SITE_PASSWORD || "郝汇斌";
const QUESTION_ANSWER = "是你";
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function makeToken() { return crypto.randomBytes(32).toString("hex"); }
function cookieToken(req) {
  return req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("birthday_session="))?.split("=")[1];
}
function getSession(req) {
  const token = cookieToken(req);
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}
function setSession(res, data) {
  const token = makeToken();
  sessions.set(token, { ...data, expires: Date.now() + SESSION_TTL_MS });
  res.setHeader("Set-Cookie", `birthday_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
function updateSession(req, patch) {
  const token = cookieToken(req), s = token && sessions.get(token);
  if (s) { Object.assign(s, patch); s.expires = Date.now() + SESSION_TTL_MS; }
}
function page(title, body, extraHead = "") {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#6f203d"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">${extraHead}
<style>
:root{--wine:#70223f;--rose:#d98da0;--cream:#fff8f3;--ink:#4b2634}*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(ellipse at top,#fff4f0 0,#f8e6e8 42%,#ead0d7 100%);color:var(--ink);font-family:'Be Vietnam Pro',sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;overflow-x:hidden}
body:before{content:"♡  ✦  ♡  ✦  ♡";position:fixed;top:5%;left:0;width:100%;text-align:center;letter-spacing:18px;color:#c2768c55;font-size:25px;pointer-events:none}
.card{position:relative;width:min(100%,560px);background:rgba(255,250,247,.93);border:1px solid #fff;box-shadow:0 24px 80px #76294520;border-radius:28px;padding:clamp(26px,6vw,48px);text-align:center}
.eyebrow{text-transform:uppercase;letter-spacing:3px;font-size:10px;color:#a55b73;font-weight:600}.seal{width:70px;height:70px;border-radius:50%;margin:20px auto;display:grid;place-items:center;background:linear-gradient(145deg,#8f2d50,#5e1934);color:#fff;font-size:30px;box-shadow:0 8px 20px #76294530}
h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(30px,7vw,45px);line-height:1.16;color:var(--wine);margin:12px 0}.subtitle{font-size:14px;line-height:1.8;color:#946678}
.field{display:flex;gap:9px;margin-top:25px}input{min-width:0;flex:1;border:1px solid #e6c7d0;border-radius:13px;background:#fff;padding:15px 14px;font:inherit;color:var(--ink);outline:none}input:focus{border-color:#a34d6b;box-shadow:0 0 0 3px #a34d6b18}
button,.button{border:0;border-radius:13px;background:var(--wine);color:#fff;padding:14px 20px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}button:hover,.button:hover{background:#8c3152}.hint{font-size:12px;color:#b06d82;margin-top:15px;min-height:18px}.small{font-size:12px;color:#a77b8b;margin-top:24px}.error{color:#b52b4b}
.hidden{display:none!important}@media(max-width:430px){.field{flex-direction:column}button{width:100%}}
</style></head><body>${body}</body></html>`;
}

const questionPage = (error = "") => page("一个只给你的秘密 ♡", `
<main class="card"><div class="eyebrow">A little secret, just for you</div><div class="seal">♡</div>
<h1>先回答我一个<br><i>小问题</i></h1>
<p class="subtitle">你觉得北江最美的是什么呢？</p>
<form class="field" method="post" action="/question"><input name="answer" type="text" placeholder="请输入你的答案…" autocomplete="off" required aria-label="问题答案"><button type="submit">回答 ♡</button></form>
<div class="hint">${error}</div><div class="small">答对了才可以继续哦 ✦</div></main>`);

const passwordPage = (error = "") => page("一个只给你的秘密 ♡", `
<main class="card"><div class="eyebrow">A little secret, just for you</div><div class="seal">♡</div>
<h1>你答对啦 ♡</h1>
<p class="subtitle">现在输入属于你的秘密密码吧。</p>
<form class="field" method="post" action="/unlock"><input name="password" type="password" placeholder="Mật mã bí mật…" autocomplete="off" required aria-label="Mật mã bí mật"><button type="submit">打开 ♡</button></form>
<div class="hint">${error}</div><div class="small">Made with love, just for your birthday ✦</div></main>`);

function letterPage() {
  return page("给你的一份生日惊喜 ♡", `
<main class="card reveal-card">
  <canvas id="dust" aria-hidden="true"></canvas>
  <div class="eyebrow">A little secret, just for you</div>
  <div class="hero-space">
    <div class="heart-word">♥</div>
    <div class="phase" id="phase">♡</div>
  </div>
  <section class="letter-content" id="letterContent">
    <div class="seal">♥</div>
    <h1>你猜对啦 ♡</h1>
    <p class="main-line">因为有你在这里，<br>这里的风景才是我见过最美的风景。</p>
    <div class="divider">✦ ♡ ✦</div>
    <p class="subtitle intro">还有一句话，想慢慢说给你听……</p>
    <div class="message" id="message">
      <div class="line">亲爱的，生日快乐 ♡</div>
      <div class="line">愿你所愿皆所得，所得皆美好。</div>
      <div class="line">往后的每一年生日，</div>
      <div class="line">我都希望能陪在你身边。</div>
      <div class="line">以后还有好多好多年，</div>
      <div class="line">我们一起过，好不好？♡</div>
    </div>
    <div class="caption">TO MY FAVORITE PERSON · 永远有你</div>
    <div class="small">愿未来的每一段风景，都有我们一起走过的身影。</div>
  </section>
</main>
<style>
.reveal-card{min-height:min(780px,calc(100vh - 48px));overflow:hidden;background:rgba(255,250,247,.88)}
#dust{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
.reveal-card>*:not(#dust){position:relative;z-index:2}.hero-space{height:230px;display:grid;place-items:center;position:relative}.heart-word{font-size:115px;color:#b31e4b;opacity:.06;transform:scale(.72);filter:blur(1px)}
.phase{position:absolute;top:12px;font-size:11px;letter-spacing:3px;color:#a55b73;opacity:.8}
.letter-content{opacity:0;visibility:hidden;transform:translateY(16px);transition:opacity 1.5s ease,transform 1.5s ease;pointer-events:none}.letter-content.show{opacity:1;visibility:visible;transform:none;pointer-events:auto}
.letter-content .seal{margin:4px auto 16px}.main-line{font-family:'Playfair Display',serif;font-size:clamp(21px,5vw,29px);line-height:1.7;color:#70223f;margin:15px 0}.divider{color:#c78297;letter-spacing:8px;margin:18px 0}.intro{margin-bottom:20px}
.message{font-family:'Playfair Display',serif;font-size:clamp(19px,4.6vw,25px);line-height:1.9;color:#623347;text-shadow:0 1px 8px #fff}.message .line{opacity:0;transform:translateY(12px);filter:blur(4px);transition:opacity 1.2s ease,transform 1.2s ease,filter 1.2s ease;margin:2px 0}.message .line.visible{opacity:1;transform:none;filter:none}.caption{font-size:9px;letter-spacing:2px;color:#a55b73;margin-top:24px}.letter-content .small{margin-top:18px}
</style>
<script>
(() => {
  const canvas=document.getElementById('dust'), ctx=canvas.getContext('2d'), phase=document.getElementById('phase');
  const card=document.querySelector('.reveal-card'); let W=0,H=0,dpr=1, particles=[];
  const COUNT=1050, FORM_MS=60000, HOLD_MS=3500, DISSOLVE_MS=9000;
  function resize(){dpr=Math.min(devicePixelRatio||1,2);W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);buildParticles();}
  function heartPoint(t){const a=Math.PI*2*t;const x=16*Math.pow(Math.sin(a),3);const y=-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a));return{x:x/17.5,y:y/17.5};}
  function buildParticles(){particles=[];const cx=W/2,cy=Math.min(250,H*.34),scale=Math.min(W*.34,135);for(let i=0;i<COUNT;i++){const hp=heartPoint(Math.random()), angle=Math.random()*Math.PI*2, r=Math.max(W,H)*(.32+.55*Math.random());particles.push({x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r*.72,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,hx:cx+hp.x*scale,hy:cy+hp.y*scale,phase:Math.random()*Math.PI*2,size:.7+Math.random()*1.8,alpha:.2+.7*Math.random(),drift:Math.random()*1.5});}}
  function draw(now,start){const elapsed=now-start;ctx.clearRect(0,0,W,H);let form=Math.min(1,Math.max(0,(elapsed-500)/FORM_MS));form=form*form*(3-2*form);let dissolve=Math.max(0,Math.min(1,(elapsed-FORM_MS-HOLD_MS)/DISSOLVE_MS));
    for(const p of particles){let tx=p.x,ty=p.y;
      if(elapsed<FORM_MS+HOLD_MS+DISSOLVE_MS){const wander=Math.sin(now/900+p.phase)*7+Math.sin(now/1700+p.phase*2)*5;tx=p.x*(1-form)+p.hx*form;ty=p.y*(1-form)+p.hy*form; if(dissolve>0){tx=p.hx+(p.x-p.hx)*dissolve+wander*dissolve;ty=p.hy+(p.y-p.hy)*dissolve+wander*.6*dissolve;}}
      else {tx=p.x+Math.sin(now/900+p.phase)*18;ty=p.y+Math.cos(now/1100+p.phase)*12;}
      const moving=elapsed<FORM_MS+HOLD_MS?1:dissolve<1?.8:.55; const tw=.72+.28*Math.sin(now/500+p.phase);
      ctx.beginPath();ctx.fillStyle='rgba(183,25,72,'+(p.alpha*tw*moving)+')';ctx.arc(tx,ty,p.size,0,Math.PI*2);ctx.fill();
    }
    if(elapsed<FORM_MS) phase.textContent='慢慢靠近你 ♡'; else if(elapsed<FORM_MS+HOLD_MS) phase.textContent='♥'; else if(elapsed<FORM_MS+HOLD_MS+DISSOLVE_MS) phase.textContent='散成星星 ✦'; else phase.textContent='给你的一封生日祝福 ♡';
    if(elapsed<FORM_MS+HOLD_MS+DISSOLVE_MS+1000) requestAnimationFrame(n=>draw(n,start));
  }
  function start(){const start=performance.now();resize();requestAnimationFrame(n=>draw(n,start));setTimeout(()=>{document.getElementById('letterContent').classList.add('show');const lines=[...document.querySelectorAll('.message .line')];lines.forEach((line,i)=>setTimeout(()=>line.classList.add('visible'),800+i*1150));},FORM_MS+HOLD_MS+DISSOLVE_MS-900);}
  window.addEventListener('resize',resize);start();
})();
</script>`, "");
}

app.get("/", (req,res) => {
  const s=getSession(req);
  res.set("Cache-Control","no-store");
  if(s?.unlocked) return res.send(letterPage());
  if(s?.questionOk) return res.send(passwordPage());
  res.send(questionPage());
});
app.post("/question", (req,res) => {
  const answer=String(req.body.answer||"").trim();
  if(answer!==QUESTION_ANSWER){return res.status(401).send(questionPage('<span class="error">不是这个答案哦，再想想 ♡</span>'));}
  setSession(res,{questionOk:true,unlocked:false});
  res.redirect(303,"/");
});
app.post("/unlock", (req,res) => {
  const s=getSession(req);
  if(!s?.questionOk) return res.redirect("/");
  if(String(req.body.password||"")!==SITE_PASSWORD) return res.status(401).send(passwordPage('<span class="error">Mật mã chưa đúng, anh thử lại nhé ♡</span>'));
  updateSession(req,{unlocked:true});
  res.redirect(303,"/");
});
app.get("/letter", (req,res)=>{res.redirect(303,"/");});
app.get("/qr", async (req,res)=>{const origin=`${req.protocol}://${req.get("host")}`;try{const dataUrl=await QRCode.toDataURL(origin,{width:700,margin:2,errorCorrectionLevel:"H",color:{dark:"#70223f",light:"#ffffff"}});res.send(page("Mã QR lời chúc bí mật",`<main class="card"><div class="eyebrow">A little secret for him</div><div class="seal">♡</div><h1>Mã QR bí mật</h1><p class="subtitle">Quét mã này để mở trang nhập câu hỏi.</p><img class="qr" src="${dataUrl}" alt="Mã QR mở trang lời chúc"><div class="url">${escapeHtml(origin)}</div><button onclick="window.print()">In / Lưu mã QR</button><p class="small">Mã QR chỉ dẫn đến trang web.</p></main>`,`<style>.qr{width:min(100%,290px);border:10px solid white;border-radius:12px;box-shadow:0 6px 25px #76294515;margin:16px auto}.url{overflow-wrap:anywhere;font-size:12px;color:#8f6473;margin:12px 0}@media print{body{background:white;padding:0}.card{box-shadow:none;border:0}.card button{display:none}}</style>`));}catch{res.status(500).send("Không thể tạo mã QR.");}});
app.get("/health",(req,res)=>res.json({ok:true}));
app.listen(PORT,()=>console.log(`Birthday site running on port ${PORT}`));
