// Run: npm test  (Node 22.18+ strips the TypeScript types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIngredients, summarize, validBarcode } from "../src/lib/halal.ts";

const words = (t) => summarize(checkIngredients(t).hits).map((h) => h.word);

test("pork in the allergen note is caught", () => {
  const r = checkIngredients("小麦粉、砂糖、植物油脂／乳化剤、(一部に小麦・乳成分・大豆・豚肉を含む)");
  assert.equal(r.status, "contains");
  assert.deepEqual(words("…(一部に小麦・豚肉を含む)"), ["豚肉"]);
});

test("longest word wins, no double count", () => {
  assert.deepEqual(words("醸造アルコール"), ["醸造アルコール"]);
  assert.deepEqual(words("豚骨スープ"), ["豚骨"]);
  assert.deepEqual(words("みりん風調味料"), ["みりん風調味料"]);
});

test("alcohol as preservative makes it contains", () => {
  assert.equal(checkIngredients("ごはん、鮭、塩、酒精").status, "contains");
});

test("false friends are not flagged", () => {
  assert.equal(checkIngredients("酒石酸、砂糖").status, "clear");
  assert.equal(checkIngredients("内容量 120グラム").status, "clear");
  assert.equal(checkIngredients("ハムスター").status, "clear");
});

test("doubtful only gives check", () => {
  const r = checkIngredients("小麦粉、ショートニング、乳化剤、香料");
  assert.equal(r.status, "check");
  assert.deepEqual(words("小麦粉、ショートニング、乳化剤、香料"), ["ショートニング", "乳化剤", "香料"]);
});

test("soy sauce and flavouring are info only", () => {
  assert.equal(checkIngredients("醤油、砂糖、香料").status, "clear");
});

test("half-width kana and full-width letters are folded", () => {
  assert.equal(checkIngredients("ｾﾞﾗﾁﾝ").status, "contains");
  assert.equal(checkIngredients("Ｌ－システイン").status, "check");
});

test("empty is unknown", () => {
  assert.equal(checkIngredients("").status, "unknown");
  assert.equal(checkIngredients(null).status, "unknown");
});

test("hit positions point at the word", () => {
  const r = checkIngredients("砂糖、ラード、塩");
  assert.equal(r.text.slice(r.hits[0].start, r.hits[0].end), "ラード");
});

test("barcode check digit", () => {
  assert.ok(validBarcode("4901085613801"));
  assert.ok(!validBarcode("4901085613802"));
  assert.ok(validBarcode("49123456"));
  assert.ok(!validBarcode("12345"));
});

test("sugar alcohol and wine vinegar are not alcohol", () => {
  assert.equal(checkIngredients("エリスリトール(糖アルコール)").status, "clear");
  assert.equal(checkIngredients("ワインビネガー、食塩").status, "clear");
  assert.equal(checkIngredients("ワイン").status, "contains");
});

test("fermented seasoning and unnamed fats are doubtful", () => {
  assert.equal(checkIngredients("米発酵調味液、食塩").status, "check");
  assert.equal(checkIngredients("小麦粉、加工油脂").status, "check");
});

test("emulsifier with a plant source stated is not doubtful", () => {
  assert.equal(checkIngredients("砂糖、乳化剤（大豆由来）、香料").status, "clear");
  assert.equal(checkIngredients("砂糖、乳化剤、香料").status, "check");
});

test("spaces inside Japanese text and web markup are ignored", () => {
  assert.equal(checkIngredients("乳化剤(大豆 由来)、香料").status, "clear");
  assert.equal(checkIngredients("ゼ ラ チ ン").status, "contains");
  const r = checkIngredients('<span class="allergen">牛乳</span>、砂糖');
  assert.equal(r.text, "牛乳、砂糖");
  assert.equal(r.status, "clear");
});

test("plain milk is clear", () => {
  assert.equal(checkIngredients("生乳100%").status, "clear");
});
