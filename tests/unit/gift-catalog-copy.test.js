import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const app=fs.readFileSync(path.join(root,"public/gifts.js"),"utf8");
const requirements=fs.readFileSync(path.join(root,"public/gift-system-requirements.md"),"utf8");
const html=fs.readFileSync(path.join(root,"public/index.html"),"utf8");
const worker=fs.readFileSync(path.join(root,"public/sw.js"),"utf8");

test("Gift Studio copies the complete selected canonical gift record",()=>{
  assert.ok(app.includes("async function copySelectedGiftRecord()"));
  assert.ok(app.includes("JSON.stringify(gift,null,2)"));
  assert.ok(app.includes('id=\'minglora-gift-copy-selected\''));
  assert.ok(app.includes('addEventListener("click",copySelectedGiftRecord)'));
  assert.ok(app.includes("copySelected.disabled=!g"));
});
test("Gift Studio exports every actual catalogue record and its available metadata",()=>{
  assert.ok(app.includes("async function copyAllGiftRecords()"));
  assert.ok(app.includes("gift_count:state.gifts.length,gifts:state.gifts"));
  assert.ok(app.includes("JSON.stringify(payload,null,2)"));
  assert.ok(app.includes('id=\'minglora-gift-copy-all\''));
  assert.ok(app.includes('addEventListener("click",copyAllGiftRecords)'));
});
test("Gift Studio can copy the saved gift requirements and uses a clipboard fallback",()=>{
  assert.ok(app.includes('fetch("/gift-system-requirements.md"'));
  assert.ok(app.includes("async function copyGiftRequirements()"));
  assert.ok(app.includes('addEventListener("click",copyGiftRequirements)'));
  assert.ok(app.includes("navigator.clipboard?.writeText"));
  assert.ok(app.includes('document.execCommand?.("copy")'));
  for(const phrase of ["Original uploaded artwork","Preserve gift information","Duplicate prevention","Copy and export","Final quality assurance"]){
    assert.ok(requirements.toLowerCase().includes(phrase.toLowerCase()),"missing requirements section "+phrase);
  }
});

test("the copied gift tools and requirements are cache-versioned for live clients",()=>{
  assert.ok(html.includes("/gifts.js?v=20261113-live-reward-art-icons-1"));
  assert.ok(worker.includes("/gifts.js?v=20261113-live-reward-art-icons-1"));
  assert.ok(worker.includes("SHELL.push('/gift-system-requirements.md')"));
  assert.ok(worker.includes("minglora-shell-v308-self-updating-1"));
});
