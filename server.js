const express = require("express");
const QRCode = require("qrcode");
const path = require("path");

const app = express();
app.set('trust proxy', 1);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;
const SITE_PASSWORD = process.env.SITE_PASSWORD || "郝汇斌";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function page(title, body, extraHead = "") {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#6f203d"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&display=swap" rel="stylesheet">
${extraHead}
<style>
:root{--wine:#70223f;--rose:#d98da0;--cream:#fff8f3;--ink:#4b2634}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at top,#fff4f0 0,#f8e6e8 42%,#ead0d7 100%);color:var(--ink);font-family:'Be Vietnam Pro',sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;overflow-x:hidden}
body:before{content:"♡  ✦  ♡  ✦  ♡";position:fixed;top:5%;left:0;width:100%;text-align:center;letter-spacing:18px;color:#c2768c55;font-size:25px;pointer-events:none}
.card{position:relative;width:min(100%,560px);background:rgba(255,250,247,.93);border:1px solid #fff;box-shadow:0 24px 80px #76294520;border-radius:28px;padding:clamp(26px,6vw,48px);text-align:center}
.eyebrow{text-transform:uppercase;letter-spacing:3px;font-size:10px;color:#a55b73;font-weight:600}.seal{width:70px;height:70px;border-radius:50%;margin:20px auto;display:grid;place-items:center;background:linear-gradient(145deg,#8f2d50,#5e1934);color:#fff;font-size:30px;box-shadow:0 8px 20px #76294530}
h1{font-family:'Playfair Display',serif;font-weight:500;font-size:clamp(30px,7vw,45px);line-height:1.16;color:var(--wine);margin:12px 0}
.subtitle{font-size:14px;line-height:1.8;color:#946678}.field{display:flex;gap:9px;margin-top:25px}
input{min-width:0;flex:1;border:1px solid #e6c7d0;border-radius:13px;background:#fff;padding:15px 14px;font:inherit;color:var(--ink);outline:none}input:focus{border-color:#a34d6b;box-shadow:0 0 0 3px #a34d6b18}
button,.button{border:0;border-radius:13px;background:var(--wine);color:#fff;padding:14px 20px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}button:hover,.button:hover{background:#8c3152}.hint{font-size:12px;color:#b06d82;margin-top:15px;min-height:18px}.letter{font-size:15px;line-height:2.05;white-space:pre-line;margin:25px 0;color:#623347}.signature{font-family:'Playfair Display',serif;font-style:italic;color:#9b526d;font-size:22px}.divider{color:#c78297;letter-spacing:8px;margin:18px 0}.small{font-size:12px;color:#a77b8b;margin-top:24px}.error{color:#b52b4b}.qr{width:min(100%,290px);border:10px solid white;border-radius:12px;box-shadow:0 6px 25px #76294515;margin:16px auto}.url{overflow-wrap:anywhere;font-size:12px;color:#8f6473;margin:12px 0}.hidden{display:none}
@media(max-width:430px){.field{flex-direction:column}button{width:100%}}
</style></head><body>${body}</body></html>`;
}

function makeToken() {
  return require("crypto").randomBytes(32).toString("hex");
}
function validSession(req) {
  const token = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("birthday_session="))?.split("=")[1];
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) { sessions.delete(token); return false; }
  return true;
}
const questionGate = page("一个小问题 ♡", `
<main class="card"><div class="eyebrow">Before opening your birthday letter</div><div class="seal">♡</div>
<h1>先回答我一个<br><i>小问题</i></h1>
<p class="question">你觉得北江最美的是什么呢？</p>
<form class="field" method="post" action="/question"><input name="answer" type="text" placeholder="你的答案是……" autocomplete="off" required aria-label="答案"><button type="submit">回答 ♡</button></form>
<div class="hint">{{ERROR}}</div><div class="small">答对了，才能继续往下哦 ✦</div></main>`);

const gate = page("一个秘密 ♡", `
<main class="card"><div class="eyebrow">A little secret, just for you</div><div class="seal">♡</div>
<h1>你猜对啦 ♡</h1>
<p class="subtitle">那现在，输入只属于你的密码吧。<br>里面藏着一份生日惊喜。</p>
<form class="field" method="post" action="/unlock"><input name="password" type="password" placeholder="Mật mã bí mật…" autocomplete="off" required aria-label="Mật mã bí mật"><button type="submit">打开信 ♡</button></form>
<div class="hint">{{ERROR}}</div><div class="small">Made with love, just for your birthday ✦</div></main>`);

app.get("/", (req, res) => {
  const html = validSession(req) ? letterPage : questionGate.replace("{{ERROR}}", "");
  res.set("Cache-Control", "no-store");
  res.send(html);
});
app.post("/question", (req, res) => {
  const answer = String(req.body.answer || "").trim().toLowerCase().replace(/[\s，。！？!?,.]/g, "");
  const accepted = ["你", "有你", "是你", "你呀", "你啊"];
  if (!accepted.includes(answer)) {
    return res.status(401).send(questionGate.replace("{{ERROR}}", '<span class="error">不对哦，再想想看 ♡</span>'));
  }
  res.setHeader("Set-Cookie", "question_passed=1; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800");
  res.redirect(303, "/password");
});
app.get("/password", (req, res) => {
  const passed = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x === "question_passed=1");
  if (!passed) return res.redirect("/");
  res.set("Cache-Control", "no-store");
  res.send(gate.replace("{{ERROR}}", ""));
});
app.post("/unlock", (req, res) => {
  const attempt = String(req.body.password || "");
  if (attempt !== SITE_PASSWORD) {
    return res.status(401).send(gate.replace("{{ERROR}}", '<span class="error">密码不对哦，再试一次 ♡</span>'));
  }
  const token = makeToken();
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader("Set-Cookie", `birthday_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.redirect(303, "/letter");
});
app.get("/letter", (req, res) => {
  if (!validSession(req)) return res.redirect("/");
  res.set("Cache-Control", "no-store");
  res.send(letterPage);
});

const letterPage = page("给你的一份生日惊喜 ♡", `
<div class="particle-intro" id="particleIntro" aria-hidden="true">
  <canvas id="heartCanvas"></canvas>
  <div class="intro-text" id="introText">
    <div>你猜对啦 ♡</div>
    <span>因为有你在这里，<br>这里的风景才是我见过最美的风景。</span>
  </div>
</div>
<main class="card letter-card" id="letterCard">
<div class="eyebrow">A little secret, just for you</div><div class="seal">♥</div>
<h1>你猜对啦 ♡</h1>
<p class="letter" style="font-family:'Playfair Display',serif;font-size:clamp(21px,5vw,29px);line-height:1.7;color:#70223f">因为有你在这里，<br>这里的风景才是我见过最美的风景。</p>
<div class="divider">✦ ♡ ✦</div>
<p class="subtitle">还有一句话，想慢慢说给你听……</p>
<div class="movie" aria-label="滚动播放的生日告白">
  <div class="movie-glow"></div>
  <div class="movie-track"><span>亲爱的，生日快乐 ♡ 愿你所愿皆所得，所得皆美好。往后的每一年生日，我都希望能陪在你身边。以后还有好多好多年，我们一起过，好不好？♡</span></div>
  <div class="movie-caption">TO MY FAVORITE PERSON · 永远有你</div>
</div>
<button class="replay" onclick="const t=document.querySelector('.movie-track');t.classList.remove('play');void t.offsetWidth;t.classList.add('play')">再看一遍 ♡</button>
<div class="small">愿未来的每一段风景，都有我们一起走过的身影。</div>
</main>
<style>
.letter-card{opacity:0;transform:translateY(10px);animation:cardIn .9s ease 5.2s forwards}.particle-intro{position:fixed;inset:0;z-index:50;background:radial-gradient(circle at center,#fff7f8 0,#f8e4e9 45%,#ead0d7 100%);display:grid;place-items:center;pointer-events:none;animation:introOut .9s ease 5.05s forwards}.particle-intro canvas{position:absolute;inset:0;width:100%;height:100%}.intro-text{position:relative;z-index:2;text-align:center;color:#70223f;font-family:'Playfair Display',serif;opacity:0;transform:scale(.92);text-shadow:0 2px 20px #fff;animation:textIn 1.25s ease 4.05s forwards}.intro-text div{font-size:clamp(35px,9vw,62px);margin-bottom:20px}.intro-text span{font-size:clamp(19px,4.8vw,29px);line-height:1.75}.movie{position:relative;overflow:hidden;margin:24px -8px 10px;border-radius:18px;min-height:190px;background:linear-gradient(135deg,#48172f,#8f3153 55%,#d78da0);display:flex;flex-direction:column;justify-content:center;color:#fff;box-shadow:inset 0 0 45px #2b0d1b80}.movie:before,.movie:after{content:"♡  ✦  ♡  ✦  ♡";position:absolute;color:#ffffff35;font-size:25px;letter-spacing:12px;white-space:nowrap;animation:float 12s linear infinite;pointer-events:none}.movie:before{top:15px;left:-10px}.movie:after{bottom:13px;right:-10px;animation-direction:reverse}.movie-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,#f9d8e355,transparent 70%)}.movie-track{position:relative;z-index:1;white-space:normal;padding:20px 18px;animation:appear 2s ease both}.movie-track span{font-family:'Playfair Display',serif;font-size:clamp(19px,4.6vw,25px);line-height:1.8;display:block;text-shadow:0 2px 12px #351021}.movie-caption{position:relative;z-index:1;font-size:9px;letter-spacing:2px;color:#ffe3eb;padding:0 10px 17px}.replay{background:transparent;border:1px solid #d9a3b4;color:#8a3655;padding:10px 18px;font-size:12px}@keyframes float{from{transform:translateX(0)}to{transform:translateX(30px)}}@keyframes appear{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}@keyframes textIn{to{opacity:1;transform:scale(1)}}@keyframes cardIn{to{opacity:1;transform:translateY(0)}}@keyframes introOut{to{opacity:0;visibility:hidden}} 
</style>
<script>
(() => {
 const canvas=document.getElementById('heartCanvas'),ctx=canvas.getContext('2d'),intro=document.getElementById('particleIntro');
 let w,h,dpr,particles=[],phase='form',start=performance.now();
 function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
 resize();addEventListener('resize',resize);
 function heart(t){const x=16*Math.pow(Math.sin(t),3),y=-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t));return{x:x*10,y:y*10}}
 const N=Math.min(1500,Math.max(650,Math.floor(innerWidth*1.5)));
 for(let i=0;i<N;i++){const a=Math.random()*Math.PI*2, r=30+Math.random()*Math.min(w,h)*.42; particles.push({x:w/2+Math.cos(a)*r,y:h/2+Math.sin(a)*r,vx:(Math.random()-.5)*1.8,vy:(Math.random()-.5)*1.8,s:.7+Math.random()*1.8,alpha:.35+Math.random()*.65,t:Math.random()*Math.PI*2,delay:Math.random()*1100})}
 function frame(now){const elapsed=now-start;ctx.clearRect(0,0,w,h);let cx=w/2,cy=h/2,scale=Math.min(w,h)/31;
  for(const p of particles){let target=heart(p.t);target.x=cx+target.x*scale;target.y=cy+target.y*scale;let f=1;
   if(elapsed<2600){if(elapsed>p.delay){p.x+=(target.x-p.x)*.045;p.y+=(target.y-p.y)*.045}}
   else if(elapsed<4300){p.x+=(target.x-p.x)*.025;p.y+=(target.y-p.y)*.025}
   else {p.x+=p.vx*2.8;p.y+=p.vy*2.8;f=Math.max(0,1-(elapsed-4300)/900)}
   ctx.globalAlpha=p.alpha*f;ctx.fillStyle='#d98da0';ctx.beginPath();ctx.arc(p.x,p.y,p.s,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;if(elapsed<5400)requestAnimationFrame(frame);else intro.style.display='none';
 }
 requestAnimationFrame(frame);
})();
</script>`);
app.get("/qr", async (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  try {
    const dataUrl = await QRCode.toDataURL(origin, { width: 700, margin: 2, errorCorrectionLevel: "H", color: { dark: "#70223f", light: "#ffffff" } });
    res.send(page("Mã QR lời chúc bí mật", `<main class="card"><div class="eyebrow">A little secret for him</div><div class="seal">♡</div><h1>Mã QR bí mật</h1><p class="subtitle">Quét mã này để mở trang nhập mật khẩu.</p><img class="qr" src="${dataUrl}" alt="Mã QR mở trang lời chúc"><div class="url">${escapeHtml(origin)}</div><button onclick="window.print()">In / Lưu mã QR</button><p class="small">Mã QR không chứa lời chúc hoặc mật khẩu; nó chỉ dẫn đến trang web.</p></main>`, `<style>@media print{body{background:white;padding:0}.card{box-shadow:none;border:0}.card button{display:none}}</style>`));
  } catch { res.status(500).send("Không thể tạo mã QR."); }
});
app.get("/health", (req,res) => res.json({ok:true}));
app.listen(PORT, () => console.log(`Birthday site running on port ${PORT}`));
