import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const parser = require("../parser.js");
const testDir = path.dirname(fileURLToPath(import.meta.url));
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function decodeEntities(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

class MiniText {
  constructor(value) {
    this.nodeType = 3;
    this.textContent = decodeEntities(value);
    this.parentNode = null;
  }
}

class MiniElement {
  constructor(tagName, attributes = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentNode = null;
  }
  get classList() { return (this.attributes.class || "").split(/\s+/).filter(Boolean); }
  get textContent() { return this.children.map((child) => child.textContent || "").join(""); }
  get innerText() { return this.textContent; }
  getAttribute(name) {
    const key = String(name).toLowerCase();
    return Object.hasOwn(this.attributes, key) ? this.attributes[key] : null;
  }
  matches(selector) {
    return splitSelectorGroups(selector).some((group) => {
      const tokens = splitDescendants(group);
      return tokens.length === 1 && matchesCompound(this, tokens[0]);
    });
  }
  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) {
    const all = descendants(this).filter((node) => node.nodeType === 1);
    const found = [];
    for (const group of splitSelectorGroups(selector)) {
      const tokens = splitDescendants(group);
      let matched = all.filter((node) => matchesCompound(node, tokens[0]));
      for (let index = 1; index < tokens.length; index += 1) {
        matched = all.filter((node) => matchesCompound(node, tokens[index]) && matched.some((parent) => isAncestor(parent, node)));
      }
      for (const node of matched) if (!found.includes(node)) found.push(node);
    }
    return found.sort((left, right) => all.indexOf(left) - all.indexOf(right));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class MiniDocument extends MiniElement {
  constructor() {
    super("#document");
    this.nodeType = 9;
  }
}

function splitSelectorGroups(selector) {
  return String(selector).split(",").map((value) => value.trim()).filter(Boolean);
}

function splitDescendants(selector) {
  const tokens = [];
  let current = "", quote = "", bracketDepth = 0;
  for (const char of selector.trim()) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === "[") {
      bracketDepth += 1;
      current += char;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
    } else if (/\s/.test(char) && bracketDepth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function matchesCompound(node, compound) {
  if (!node || node.nodeType !== 1) return false;
  const tag = compound.match(/^[A-Za-z][A-Za-z0-9-]*/);
  if (tag && node.localName !== tag[0].toLowerCase()) return false;
  const classes = [...compound.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  if (classes.some((className) => !node.classList.includes(className))) return false;
  const ids = [...compound.matchAll(/#([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  if (ids.some((id) => node.getAttribute("id") !== id)) return false;
  const attributes = [...compound.matchAll(/\[([^\]=~|^$*]+)([*^$~|]?=)?(?:"([^"]*)"|'([^']*)'|([^\]]+))?\]/g)];
  for (const match of attributes) {
    const name = match[1].trim().toLowerCase(), operator = match[2] || "";
    const expected = (match[3] ?? match[4] ?? match[5] ?? "").trim(), actual = node.getAttribute(name);
    if (actual == null) return false;
    if (!operator && expected) return false;
    if (operator === "=" && actual !== expected) return false;
    if (operator === "*=" && !actual.includes(expected)) return false;
    if (operator === "^=" && !actual.startsWith(expected)) return false;
    if (operator === "$=" && !actual.endsWith(expected)) return false;
    if (operator === "~=" && !actual.split(/\s+/).includes(expected)) return false;
  }
  return true;
}

function isAncestor(ancestor, node) {
  let current = node.parentNode;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
}

function descendants(root) {
  const result = [];
  const visit = (node) => {
    for (const child of node.children || []) {
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function parseHtml(html) {
  const document = new MiniDocument(), stack = [document];
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>/g;
  let cursor = 0;
  const appendText = (value) => {
    if (!value) return;
    const node = new MiniText(value);
    node.parentNode = stack.at(-1);
    stack.at(-1).children.push(node);
  };
  for (const match of html.matchAll(tokenPattern)) {
    appendText(html.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const token = match[0];
    if (token.startsWith("<!--") || /^<!doctype/i.test(token)) continue;
    if (token.startsWith("</")) {
      const tag = token.match(/^<\s*\/\s*([A-Za-z0-9:-]+)/)?.[1].toLowerCase();
      while (stack.length > 1) if (stack.pop().localName === tag) break;
      continue;
    }
    const start = token.match(/^<\s*([A-Za-z0-9:-]+)([\s\S]*?)\/?>$/);
    if (!start) continue;
    const tag = start[1].toLowerCase(), attributes = {};
    for (const attribute of start[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g)) {
      attributes[attribute[1].toLowerCase()] = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    }
    const element = new MiniElement(tag, attributes);
    element.parentNode = stack.at(-1);
    stack.at(-1).children.push(element);
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(token)) stack.push(element);
  }
  appendText(html.slice(cursor));
  return document;
}

async function fixture(name) {
  return parseHtml(await readFile(path.join(testDir, "fixtures", name), "utf8"));
}

const EXPECTED_FIELDS = ["company", "description", "education", "experience", "fetched_at", "location", "recruiter_name", "recruiter_title", "salary", "source_job_id", "source_url", "tags", "title"];
const listResult = parser.extractPage(await fixture("list.html"), "https://www.zhipin.com/web/geek/job?query=Python");
assert.equal(listResult.ok, true);
assert.equal(listResult.jobs.length, 2, "列表页应只解析两张真实职位卡，排除脚本和聊天节点");
assert.deepEqual(Object.keys(listResult.jobs[0]).sort(), EXPECTED_FIELDS);
assert.equal(listResult.jobs[0].source_job_id, "jobA123");
assert.equal(listResult.jobs[0].company, "星河科技");
assert.equal(listResult.jobs[0].title, "Python 后端工程师");
assert.equal(listResult.jobs[0].location, "上海·浦东新区");
assert.equal(listResult.jobs[0].salary, "20-35K·14薪");
assert.equal(listResult.jobs[0].experience, "3-5年");
assert.equal(listResult.jobs[0].education, "本科");
assert.match(listResult.jobs[0].description, /交易系统后端服务/);
assert.equal(listResult.jobs[0].recruiter_name, "陈先生");
assert.equal(listResult.jobs[0].recruiter_title, "技术负责人");
assert.deepEqual(listResult.jobs[0].tags, ["Python", "FastAPI", "SQL", "PostgreSQL"]);
assert.equal(listResult.jobs[1].source_job_id, "jobB456");
assert.equal(listResult.jobs[1].description, "");
assert.match(listResult.jobs[0].fetched_at, /^\d{4}-\d{2}-\d{2}T/);

const detailResult = parser.extractPage(await fixture("detail.html"), "https://www.zhipin.com/job_detail/detailC789.html?securityId=fixture");
assert.equal(detailResult.ok, true);
assert.equal(detailResult.jobs.length, 1);
assert.equal(detailResult.jobs[0].source_job_id, "detailC789");
assert.equal(detailResult.jobs[0].title, "AI 应用开发工程师");
assert.equal(detailResult.jobs[0].company, "远山智能");
assert.equal(detailResult.jobs[0].location, "杭州·余杭区");
assert.equal(detailResult.jobs[0].experience, "5-10年");
assert.equal(detailResult.jobs[0].education, "本科");
assert.equal(detailResult.jobs[0].recruiter_name, "周女士");
assert.equal(detailResult.jobs[0].recruiter_title, "招聘经理");
assert.doesNotMatch(detailResult.jobs[0].description, /聊天中的无关文本/);
assert.deepEqual(detailResult.jobs[0].tags, ["Python", "FastAPI", "RAG", "LangGraph"]);

const emptyResult = parser.extractPage(parseHtml('<main><div class="chat-panel"><div class="job-sec-text">聊天内容</div></div></main>'), "https://www.zhipin.com/web/geek/job");
assert.equal(emptyResult.ok, false);
assert.deepEqual(emptyResult.jobs, []);
assert.match(emptyResult.reason, /没有检测到可靠的可见职位/);

const detailWithoutContainer = parser.extractPage(
  parseHtml('<main><section class="chat-panel"><div class="job-name">聊天里的职位名</div><div class="company-name">聊天里的公司名</div><div class="job-sec-text">聊天内容</div></section></main>'),
  "https://www.zhipin.com/job_detail/no-container.html"
);
assert.equal(detailWithoutContainer.ok, false, "详情 URL 没有可靠详情容器时不应扫描整份 document");
assert.deepEqual(detailWithoutContainer.jobs, [], "不能把可见聊天内容当作职位详情");
assert.match(detailWithoutContainer.reason, /详情容器|详情内容/);

console.log("parser tests passed: list=2, detail=1, empty handled, detail chat excluded");
