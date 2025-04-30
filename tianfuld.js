/*
------------------------------------------
Name：天府绿道签到
Author：@Levi (Fixed by Claude)
Date: 2025-04-30
Description: 支持多平台（Surge、Loon、Stash、QX）运行的天府绿道签到脚本，
⚠️【免责声明】
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/

/*
[rewrite_local]
^https://app-cdc\.tfgreenroad\.com/vip/member/v1/api/memberBaseInfo url script-request-header https://raw.githubusercontent.com/czy13724/T-Tiol/refs/heads/Levi/tianfuld.js

[task_local]
0 8 * * * https://raw.githubusercontent.com/czy13724/T-Tiol/refs/heads/Levi/tianfuld.js, tag=天府绿道签到, enabled=true

[MITM]
hostname = app-cdc.tfgreenroad.com
*/

// 初始化脚本环境对象
const $ = new Env("天府绿道");
const ckName = "tianfuld_data";
let userCookie = $.getdata(ckName) ? JSON.parse($.getdata(ckName)) : [];
if ($.isNode()) {
  if (process.env[ckName]) {
    try {
      userCookie = JSON.parse(process.env[ckName]);
    } catch (e) {
      console.log('环境变量格式不正确');
      userCookie = [];
    }
  }
}

$.userIdx = 0;
$.userList = [];
$.notifyMsg = [];
$.succCount = 0;
$.is_debug = ($.isNode() ? process.env.IS_DEBUG : $.getdata('is_debug')) || 'false';

// 随机评论内容
const commentList = [
  "真是太棒了", 
  "很有意义啊", 
  "绿道很漂亮", 
  "期待更多活动", 
  "下次一定参加"
];

// 主程序入口（自动判断运行环境：抓Cookie or 执行任务）
!(async () => {
  if (typeof $request !== "undefined") {
    await getCookie();
  } else {
    await checkEnv();
    for (let i = 0; i < $.userList.length; i++) {
      const user = $.userList[i];
      try {
        // 获取初始积分
        const startPoints = await user.getPoint();
        // 执行签到
        await user.signin();
        // 获取文章列表并执行分享和评论
        await user.getArticles();
        // 获取最新积分
        const endPoints = await user.getPoint();
        
        $.notifyMsg.push(`[${user.userName}] 积分: ${startPoints} → ${endPoints}`);
        $.succCount++;
      } catch (e) {
        $.notifyMsg.push(`[${user.userName}] 执行失败：${e.message || e}`);
      }
    }
    $.title = `共${$.userList.length}账号，成功${$.succCount}个`;
    await sendMsg($.notifyMsg.join("\n"));
  }
})()
  .catch((e) => { 
    $.logErr(e);
    $.msg($.name, `⛔️ 异常`, e.message || e);
  })
  .finally(() => $.done());

// 用户信息类（封装签到、评论、积分操作）
function UserInfo(user) {
  this.index = ++$.userIdx;
  this.ckStatus = true;
  this.wxa_session_id = user.wxa_session_id;
  this.uid = user.uid;
  this.w_open_id = user.w_open_id;
  this.userName = user.userName || `账号${this.index}`;
  this.baseUrl = `https://app-cdc.tfgreenroad.com`;
  this.headers = {
    "Host": "app-cdc.tfgreenroad.com",
    "apptype": "miniprogram",
    "user-agent": "Mozilla/5.0 MicroMessenger MiniProgram",
    "content-type": "application/x-www-form-urlencoded",
    "wxa_session_id": this.wxa_session_id,
    "uid": this.uid,
    "accept": "*/*",
    "cookie": `w_uid=${this.uid}; w_open_id=${this.w_open_id};`
  };
  
  // 获取当前积分
  this.getPoint = async function() {
    try {
      const url = `/vip/member/v1/api/myPoints?tradeType=2`;
      const res = await this.fetch(url);
      if (res?.data?.pointsNum) {
        $.info(`[${this.userName}] 当前积分：${res.data.pointsNum}`);
        return res.data.pointsNum;
      }
      return 0;
    } catch (e) {
      $.error(`[${this.userName}] 获取积分失败: ${e.message || e}`);
      return 0;
    }
  };
  
  // 执行签到任务
  this.signin = async function() {
    try {
      const url = `/vip/points/v1/api/sign`;
      const res = await this.fetch({ 
        url, 
        method: "POST", 
        body: ""
      });
      
      if (res?.ret === 0) {
        const days = res.data?.days || 0;
        const value = res.data?.value || 0;
        $.info(`[${this.userName}] 签到成功，连续签到${days}天，获得${value}积分`);
        return true;
      } else {
        throw new Error(res?.msg || "签到失败");
      }
    } catch (e) {
      $.error(`[${this.userName}] 签到异常: ${e.message || e}`);
      throw e;
    }
  };
  
  // 获取文章列表并执行分享评论
  this.getArticles = async function() {
    try {
      const url = `/appserver/v1/mustPlay/list?pageSize=10&pageIndex=1&scenicId=1&contentType=`;
      const res = await this.fetch(url);
      
      if (res?.ret === 0 && res.data?.mustPlayList?.length > 0) {
        // 获取前3篇文章
        const articles = res.data.mustPlayList.slice(0, 3).map(item => ({
          contentId: item.contentId,
          name: item.name
        }));
        
        $.info(`[${this.userName}] 获取到${articles.length}篇文章`);
        
        // 执行分享和评论
        for (const article of articles) {
          await this.shareArticle(article);
          await this.commentArticle(article);
          // 等待一小段时间避免请求过快
          await $.wait(1000);
        }
        
        // 执行骑行专区签到和分享
        await this.cyclingLogin();
        await this.cyclingShare();
        
        return true;
      } else {
        throw new Error("获取文章列表失败");
      }
    } catch (e) {
      $.error(`[${this.userName}] 文章处理异常: ${e.message || e}`);
      throw e;
    }
  };
  
  // 分享文章
  this.shareArticle = async function(article) {
    try {
      const url = `/vip/points/v1/api/inner/benefits/order/share/submit`;
      const payload = `orginId=${article.contentId}`;
      
      const res = await this.fetch({
        url,
        method: "POST",
        body: payload
      });
      
      if (res?.ret === 0) {
        $.info(`[${this.userName}] 文章【${article.name}】分享成功`);
        return true;
      } else {
        $.info(`[${this.userName}] 文章【${article.name}】分享失败: ${res?.msg || "未知错误"}`);
        return false;
      }
    } catch (e) {
      $.error(`[${this.userName}] 文章分享异常: ${e.message || e}`);
      return false;
    }
  };
  
  // 评论文章
  this.commentArticle = async function(article) {
    try {
      const url = `/appserver/v1/comment/addComment`;
      // 随机选择一条评论
      const comment = commentList[Math.floor(Math.random() * commentList.length)];
      
      const payload = `cid=${article.contentId}&type=travel_notes&uid=${this.uid}&ctitle=${encodeURIComponent(article.name)}&content=${encodeURIComponent(comment)}&image=&parent_id=&source_type=wxapp`;
      
      const res = await this.fetch({
        url,
        method: "POST",
        body: payload
      });
      
      if (res?.ret === 0) {
        $.info(`[${this.userName}] 文章【${article.name}】评论成功`);
        return true;
      } else {
        $.info(`[${this.userName}] 文章【${article.name}】评论失败: ${res?.msg || "未知错误"}`);
        return false;
      }
    } catch (e) {
      $.error(`[${this.userName}] 文章评论异常: ${e.message || e}`);
      return false;
    }
  };
  
  // 骑行专区签到
  this.cyclingLogin = async function() {
    try {
      const url = `/cycling/credit/login`;
      const res = await this.fetch({
        url,
        method: "POST",
        body: ""
      });
      
      if (res?.ret === 0) {
        const value = res.data?.value || 0;
        $.info(`[${this.userName}] 骑行专区签到成功，获得${value}积分`);
        return true;
      } else {
        $.info(`[${this.userName}] 骑行专区签到失败: ${res?.msg || "未知错误"}`);
        return false;
      }
    } catch (e) {
      $.error(`[${this.userName}] 骑行专区签到异常: ${e.message || e}`);
      return false;
    }
  };
  
  // 骑行专区分享
  this.cyclingShare = async function() {
    try {
      const url = `/cycling/credit/share`;
      const res = await this.fetch({
        url,
        method: "POST",
        body: ""
      });
      
      if (res?.ret === 0) {
        const value = res.data?.value || 0;
        $.info(`[${this.userName}] 骑行专区分享成功，获得${value}积分`);
        return true;
      } else {
        $.info(`[${this.userName}] 骑行专区分享失败: ${res?.msg || "未知错误"}`);
        return false;
      }
    } catch (e) {
      $.error(`[${this.userName}] 骑行专区分享异常: ${e.message || e}`);
      return false;
    }
  };
  
  // 通用请求方法
  this.fetch = async function(options) {
    if (typeof options === 'string') {
      options = { url: options };
    }
    
    const url = options.url.startsWith('http') ? options.url : this.baseUrl + options.url;
    const method = options.method || 'GET';
    const headers = { ...this.headers };
    
    let body = options.body || '';
    if (method === 'POST' && body && headers["content-type"] === "application/x-www-form-urlencoded") {
      headers["Content-Length"] = body.length.toString();
    }
    
    const requestOptions = {
      url,
      headers,
      method,
      body
    };
    
    try {
      const response = await httpRequest(requestOptions);
      debug(response, url.split("/").pop());
      return response;
    } catch (e) {
      throw e;
    }
  };
}

// Cookie 捕获逻辑（拦截 memberBaseInfo 请求并提取必要字段）
async function getCookie() {
  try {
    if ($request && $request.method === 'OPTIONS') return;
    
    const url = $request.url || "";
    if (!url.includes("app-cdc.tfgreenroad.com") || !url.includes("memberBaseInfo")) {
      console.log("⛔️ 非目标地址，跳过");
      return;
    }
    
    const headers = objectToLowerCase($request.headers || {});
    const cookieRaw = headers["cookie"] || "";
    
    console.log("🌐 请求 URL: " + url);
    
    const wxa_session_id = headers["wxa_session_id"];
    const uid = headers["uid"];
    const w_open_id = cookieRaw.match(/w_open_id=([^;]+)/)?.[1];
    
    if (!wxa_session_id || !uid || !w_open_id) {
      throw new Error(`抓取失败: wxa_session_id=${wxa_session_id}, uid=${uid}, w_open_id=${w_open_id}`);
    }
    
    const newData = {
      wxa_session_id,
      uid,
      w_open_id: w_open_id.replace(/;$/, ""),
      userName: uid
    };
    
    // 读取现有数据
    let existingData = [];
    try {
      const dataStr = $.getdata(ckName);
      if (dataStr) {
        existingData = JSON.parse(dataStr);
      }
    } catch (e) {
      existingData = [];
    }
    
    // 查找是否已存在相同账号
    const index = existingData.findIndex(e => e.uid === newData.uid);
    if (index !== -1) {
      existingData[index] = newData;
    } else {
      existingData.push(newData);
    }
    
    $.setdata(JSON.stringify(existingData), ckName);
    $.msg($.name, `✅ 成功获取账号: [${uid}]`, ``);
  } catch (e) {
    $.msg($.name, `❌ 获取失败`, e.message);
  }
}

// 将对象的键名转换为小写
function objectToLowerCase(obj) {
  const result = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key.toLowerCase()] = obj[key];
    }
  }
  return result;
}

// 环境检查，构建用户列表
async function checkEnv() {
  try {
    if (!userCookie || !userCookie.length) {
      throw new Error("未找到有效账号");
    }
    
    $.log(`\n[INFO] 检测到 ${userCookie.length} 个账号\n`);
    
    userCookie.forEach(account => {
      if (account.wxa_session_id && account.uid && account.w_open_id) {
        $.userList.push(new UserInfo(account));
      }
    });
    
    if ($.userList.length === 0) {
      throw new Error("没有有效的账号信息");
    }
  } catch (e) {
    throw e;
  }
}

// HTTP请求工具函数
async function httpRequest(options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method ? options.method.toUpperCase() : 'GET';
    const timeout = options.timeout || 10000;
    
    let { url, headers = {}, body = '' } = options;
    
    if (method === 'GET' && options.params) {
      const queryString = Object.keys(options.params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(options.params[key])}`)
        .join('&');
      url += url.includes('?') ? `&${queryString}` : `?${queryString}`;
    }
    
    const requestOptions = { url, headers, timeout };
    
    if (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
      requestOptions.body = body;
    }
    
    const httpMethod = $[method.toLowerCase()] || $.get;
    
    httpMethod(requestOptions, (err, resp, data) => {
      if (err) {
        reject(err);
        return;
      }
      
      try {
        // 尝试解析 JSON
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        resolve(result);
      } catch (e) {
        resolve(data);
      }
    });
  });
}

// 调试输出函数
function debug(data, title = "debug") {
  if ($.is_debug === 'true') {
    if (typeof data === 'string') {
      $.log(`\n-----------${title}------------\n${data}\n-----------${title}------------\n`);
    } else {
      $.log(`\n-----------${title}------------\n${JSON.stringify(data)}\n-----------${title}------------\n`);
    }
  }
}

// 发送通知消息
async function sendMsg(msg, opts = {}) {
  if (!msg) return;
  
  if ($.isNode()) {
    const notify = require('./sendNotify');
    await notify.sendNotify($.name, msg);
  } else {
    $.msg($.name, $.title || "", msg, opts);
  }
}

// Env.js - 兼容多平台的环境工具
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, i) => { s.call(this, t, ((t, s, o) => { t ? i(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 }, this.logLevelPrefixs = { debug: "[DEBUG] ", info: "[INFO] ", warn: "[WARN] ", error: "[ERROR] " }, this.logLevel = "info", this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null, ...s) { try { return JSON.stringify(t, ...s) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, i) => e(i))) })) } runScript(t, e) { return new Promise((s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let o = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); o = o ? 1 * o : 20, o = e && e.timeout ? e.timeout : o; const [r, a] = i.split("@"), n = { url: `http://${a}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: o }, headers: { "X-Key": r, Accept: "*/*" }, timeout: o }; this.post(n, ((t, e, i) => s(i))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), o = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, o) : i ? this.fs.writeFileSync(e, o) : this.fs.writeFileSync(t, o) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (const t of i) if (o = Object(o)[t], void 0 === o) return s; return o } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), o = s ? this.getval(s) : ""; if (o) try { const t = JSON.parse(o); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, o] = /^@(.*?)\.(.*?)$/.exec(e), r = this.getval(i), a = i ? "null" === r ? null : r || "{}" : "{}"; try { const e = JSON.parse(a); this.lodash_set(e, o, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const r = {}; this.lodash_set(r, o, t), s = this.setval(JSON.stringify(r), i) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.cookie && void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: i, statusCode: o, headers: r, rawBody: a } = t, n = s.decode(a, this.encoding); e(null, { status: i, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: i, response: o } = t; e(i, o, o && s.decode(o.rawBody, this.encoding)) })); break } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let i = require("iconv-lite"); this.initGotEnv(t); const { url: o, ...r } = t; this.got[s](o, r).then((t => { const { statusCode: s, statusCode: o, headers: r, rawBody: a } = t, n = i.decode(a, this.encoding); e(null, { status: s, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: s, response: o } = t; e(s, o, o && i.decode(o.rawBody, this.encoding)) })); break } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let i = t[s]; null != i && "" !== i && ("object" == typeof i && (i = JSON.stringify(i)), e += `${s}=${i}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", i = "", o = {}) { const r = t => { const { $open: e, $copy: s, $media: i, $mediaMime: o } = t; switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { const r = {}; let a = t.openUrl || t.url || t["open-url"] || e; a && Object.assign(r, { action: "open-url", url: a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; if (n && Object.assign(r, { action: "clipboard", text: n }), i) { let t, e, s; if (i.startsWith("http")) t = i; else if (i.startsWith("data:")) { const [t] = i.split(";"), [, o] = i.split(","); e = o, s = t.replace("data:", "") } else { e = i, s = (t => { const e = { JVBERi0: "application/pdf", R0lGODdh: "image/gif", R0lGODlh: "image/gif", iVBORw0KGgo: "image/png", "/9j/": "image/jpg" }; for (var s in e) if (0 === t.indexOf(s)) return e[s]; return null })(i) } Object.assign(r, { "media-url": t, "media-base64": e, "media-base64-mime": o ?? s }) } return Object.assign(r, { "auto-dismiss": t["auto-dismiss"], sound: t.sound }), r } case "Loon": { const s = {}; let o = t.openUrl || t.url || t["open-url"] || e; o && Object.assign(s, { openUrl: o }); let r = t.mediaUrl || t["media-url"]; return i?.startsWith("http") && (r = i), r && Object.assign(s, { mediaUrl: r }), console.log(JSON.stringify(s)), s } case "Quantumult X": { const o = {}; let r = t["open-url"] || t.url || t.openUrl || e; r && Object.assign(o, { "open-url": r }); let a = t["media-url"] || t.mediaUrl; i?.startsWith("http") && (a = i), a && Object.assign(o, { "media-url": a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; return n && Object.assign(o, { "update-pasteboard": n }), console.log(JSON.stringify(o)), o } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, i, r(o)); break; case "Quantumult X": $notify(e, s, i, r(o)); break; case "Node.js": break }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } debug(...t) { this.logLevels[this.logLevel] <= this.logLevels.debug && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.debug}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } info(...t) { this.logLevels[this.logLevel] <= this.logLevels.info && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.info}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } warn(...t) { this.logLevels[this.logLevel] <= this.logLevels.warn && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.warn}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } error(...t) { this.logLevels[this.logLevel] <= this.logLevels.error && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.error}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.map((t => t ?? String(t))).join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, e, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, e, void 0 !== t.message ? t.message : t, t.stack); break } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
