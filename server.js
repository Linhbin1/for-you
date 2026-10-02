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
const gate = page("Một lời chúc dành riêng cho anh", `
<main class="card"><div class="eyebrow">A little secret, just for you</div><div class="seal">♡</div>
<h1>Em có một điều<br><i>muốn gửi anh</i></h1>
<p class="subtitle">Có một lời chúc nhỏ đang được cất giữ ở đây.<br>Nhập mật mã của riêng anh để mở nhé.</p>
<form class="field" method="post" action="/unlock"><input name="password" type="password" placeholder="Mật mã bí mật…" autocomplete="off" required aria-label="Mật mã bí mật"><button type="submit">Mở thư ♡</button></form>
<div class="hint ${""}">{{ERROR}}</div><div class="small">Made with love, just for your birthday ✦</div></main>`);
app.get("/", (req, res) => {
  const html = validSession(req) ? letterPage : gate.replace("{{ERROR}}", "");
  res.set("Cache-Control", "no-store");
  res.send(html);
});
app.post("/unlock", (req, res) => {
  const attempt = String(req.body.password || "");
  if (attempt !== SITE_PASSWORD) {
    return res.status(401).send(gate.replace("{{ERROR}}", '<span class="error">Mật mã chưa đúng, anh thử lại nhé ♡</span>'));
  }
  const token = makeToken();
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader("Set-Cookie", `birthday_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.redirect(303, "/letter");
});
const letterPage = page("给你的一份生日惊喜 ♡", `
<main class="card"><div class="eyebrow">A little secret, just for you</div><div class="seal">♥</div>
<h1>你猜对啦 ♡</h1>
<p class="letter" style="font-family:'Playfair Display',serif;font-size:clamp(21px,5vw,29px);line-height:1.7;color:#70223f">因为有你在这里，<br>这里的风景才是我见过最美的风景。</p>
<div class="divider">✦ ♡ ✦</div>
<p class="subtitle">还有一句话，想慢慢说给你听……</p>
<div class="movie" aria-label="滚动播放的生日告白">
  <div class="movie-glow"></div>
  <div class="movie-track">
    <span>亲爱的，生日快乐 ♡ 愿你所愿皆所得，所得皆美好。往后的每一年生日，我都希望能陪在你身边。以后还有好多好多年，我们一起过，好不好？♡</span>
  </div>
  <div class="movie-caption">TO MY FAVORITE PERSON · 永远有你</div>
</div>
<button class="replay" onclick="const t=document.querySelector('.movie-track');t.classList.remove('play');void t.offsetWidth;t.classList.add('play')">再看一遍 ♡</button>
<div class="small">愿未来的每一段风景，都有我们一起走过的身影。</div>
</main>
<style>
.movie{position:relative;overflow:hidden;margin:24px -8px 10px;border-radius:18px;min-height:190px;background:linear-gradient(135deg,#48172f,#8f3153 55%,#d78da0);display:flex;flex-direction:column;justify-content:center;color:#fff;box-shadow:inset 0 0 45px #2b0d1b80}
.movie:before,.movie:after{content:"♡  ✦  ♡  ✦  ♡";position:absolute;color:#ffffff35;font-size:25px;letter-spacing:12px;white-space:nowrap;animation:float 12s linear infinite;pointer-events:none}
.movie:before{top:15px;left:-10px}.movie:after{bottom:13px;right:-10px;animation-direction:reverse}
.movie-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,#f9d8e355,transparent 70%)}
.movie-track{position:relative;z-index:1;white-space:normal;padding:20px 18px;animation:appear 2s ease both}
.movie-track span{font-family:'Playfair Display',serif;font-size:clamp(19px,4.6vw,25px);line-height:1.8;display:block;text-shadow:0 2px 12px #351021}
.movie-caption{position:relative;z-index:1;font-size:9px;letter-spacing:2px;color:#ffe3eb;padding:0 10px 17px}
.replay{background:transparent;border:1px solid #d9a3b4;color:#8a3655;padding:10px 18px;font-size:12px}
@keyframes float{from{transform:translateX(0)}to{transform:translateX(30px)}}
@keyframes appear{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
</style>`);
app.get("/letter", (req, res) => {
  if (!validSession(req)) return res.redirect("/");
  res.set("Cache-Control", "no-store");
  res.send(letterPage);
});
app.get("/qr", async (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  try {
    const dataUrl = await QRCode.toDataURL(origin, { width: 700, margin: 2, errorCorrectionLevel: "H", color: { dark: "#70223f", light: "#ffffff" } });
    res.send(page("Mã QR lời chúc bí mật", `<main class="card"><div class="eyebrow">A little secret for him</div><div class="seal">♡</div><h1>Mã QR bí mật</h1><p class="subtitle">Quét mã này để mở trang nhập mật khẩu.</p><img class="qr" src="${dataUrl}" alt="Mã QR mở trang lời chúc"><div class="url">${escapeHtml(origin)}</div><button onclick="window.print()">In / Lưu mã QR</button><p class="small">Mã QR không chứa lời chúc hoặc mật khẩu; nó chỉ dẫn đến trang web.</p></main>`, `<style>@media print{body{background:white;padding:0}.card{box-shadow:none;border:0}.card button{display:none}}</style>`));
  } catch { res.status(500).send("Không thể tạo mã QR."); }
});
app.get("/health", (req,res) => res.json({ok:true}));
app.listen(PORT, () => console.log(`Birthday site running on port ${PORT}`));
