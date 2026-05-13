import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const SALES_PORTAL_HOST = 'boclifeonline.com/SalesPortal';

const TARGETS = [
  '推廣活動',
  '產品資訊',
  '常用表格',
  '培訓資訊',
  '保險專屬代理公告',
  '承保及理賠公告',
  '客戶服務公告',
  '營運業務公告',
  '其他公告',
  '已過期公告',
  '代理招聘',
  '銷售品質',
  '強積金',
  '業務伙伴',
  '一脈互動',
  '其他資訊',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runAppleScript(source) {
  const result = spawnSync('osascript', [], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim();
    throw new Error(message || 'AppleScript failed');
  }
  return (result.stdout || '').trim();
}

function escapeAppleString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runJSInActiveTab(jsCode) {
  const filePath = path.join(os.tmpdir(), `boc-js-${Date.now()}-${Math.random().toString(16).slice(2)}.js`);
  fs.writeFileSync(filePath, jsCode, 'utf8');
  const escaped = escapeAppleString(filePath);
  const script = `
set jsCode to read POSIX file "${escaped}" as «class utf8»
tell application "Google Chrome"
  return execute active tab of front window javascript jsCode
end tell
`;
  try {
    return runAppleScript(script);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // no-op
    }
  }
}

function focusSalesPortalTab() {
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    set tabIndex to 0
    repeat with t in tabs of w
      set tabIndex to tabIndex + 1
      set u to URL of t
      if u contains "${SALES_PORTAL_HOST}" then
        set active tab index of w to tabIndex
        set index of w to 1
        activate
        return u
      end if
    end repeat
  end repeat
end tell
error "Sales Portal tab not found in Google Chrome"
`;
  return runAppleScript(script);
}

function currentURL() {
  return runAppleScript('tell application "Google Chrome" to return URL of active tab of front window');
}

function clickByTextJS(target) {
  return `
(function(target){
  function norm(s){return (s||'').replace(/\\s+/g,' ').trim();}
  var links=[].slice.call(document.querySelectorAll('a'));
  var candidates=links.filter(function(a){ return norm(a.textContent)===target; });
  if(!candidates.length){ return JSON.stringify({action:'click',target:target,clicked:false,msg:'not_found'}); }
  var a=candidates[candidates.length-1];
  try{ a.click(); return JSON.stringify({action:'click',target:target,clicked:true,count:candidates.length}); }
  catch(e){ return JSON.stringify({action:'click',target:target,clicked:false,error:String(e)}); }
})(${JSON.stringify(target)});
`;
}

const DEEP_COLLECT_JS = `
(function(){
  var href = location.href;
  var title = document.title || '';
  var text = (document.body && document.body.innerText ? document.body.innerText : '');
  var is404 = (text.indexOf('404') >= 0 && text.indexOf('很抱歉') >= 0) || href.indexOf('toTimeout') >= 0;
  if (is404) {
    return JSON.stringify({url: href, title: title, is404: true, expandedSwitches: 0, checkfileTokens: 0, directFileLinks: 0, triggered: 0});
  }

  var expanded = 0;
  for (var loop = 0; loop < 80; loop++) {
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll('button[treenode_switch], .switch, .roots_close, .center_close, .bottom_close')
    ).filter(function(b){
      var c = (b.className || '').toString();
      return c.indexOf('_close') >= 0 || c.indexOf('roots_close') >= 0 || c.indexOf('center_close') >= 0 || c.indexOf('bottom_close') >= 0;
    });
    if (!nodes.length) break;
    var changed = 0;
    for (var i = 0; i < nodes.length; i++) {
      try { nodes[i].click(); changed++; expanded++; } catch (e) {}
    }
    if (!changed) break;
  }

  var checkAnchors = Array.prototype.slice.call(document.querySelectorAll('a[onclick*=checkfile], a[title*=點擊查看相關資料], a[title*=点击我查看相关资料]'));
  var tokenMap = {};
  for (var j = 0; j < checkAnchors.length; j++) {
    var oc = (checkAnchors[j].getAttribute('onclick') || '');
    var m = oc.match(/checkfile\\('([^']+)'\\)/);
    if (m && m[1]) tokenMap[m[1]] = 1;
  }
  var tokens = Object.keys(tokenMap);

  var directAnchors = Array.prototype.slice.call(document.querySelectorAll('a[href]')).filter(function(a){
    var h = (a.getAttribute('href') || '').trim().toLowerCase();
    if (!h) return false;
    if (h.indexOf('javascript:') === 0 || h === '#' || h === '"#"') return false;
    return /\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip)(\\?|$)/.test(h);
  });

  var triggered = 0;
  if (typeof window.checkfile === 'function') {
    for (var t = 0; t < tokens.length; t++) {
      try { window.checkfile(tokens[t]); triggered++; } catch (e) {}
    }
  } else {
    for (var c = 0; c < checkAnchors.length; c++) {
      try { checkAnchors[c].click(); triggered++; } catch (e) {}
    }
  }

  for (var d = 0; d < directAnchors.length; d++) {
    try { directAnchors[d].click(); triggered++; } catch (e) {}
  }

  return JSON.stringify({
    url: href,
    title: title,
    is404: false,
    expandedSwitches: expanded,
    checkfileTokens: tokens.length,
    directFileLinks: directAnchors.length,
    triggered: triggered
  });
})();
`;

function parseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    focusedUrl: '',
    runs: [],
  };

  report.focusedUrl = focusSalesPortalTab();

  for (const target of TARGETS) {
    const clickRaw = runJSInActiveTab(clickByTextJS(target));
    await sleep(2200);
    const collectRaw = runJSInActiveTab(DEEP_COLLECT_JS);
    await sleep(300);
    report.runs.push({
      target,
      urlAfterClick: currentURL(),
      click: parseJSON(clickRaw),
      collect: parseJSON(collectRaw),
    });
  }

  report.finishedAt = new Date().toISOString();
  const outputPath = path.resolve('knowledge-base/boc-portal-round4-download-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outputPath, totalTargets: TARGETS.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
