import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceDir = path.join(root, "minitool");
const outputDir = path.join(root, "dist", "minitool");
const assetsDir = path.join(outputDir, "assets");
const artifactDir = path.join(root, "artifacts");
const zipPath = path.join(artifactDir, "众见六爻-小红书小工具.zip");
const mapPath = path.join(root, "client", "public", "data", "hexagrams_map.json");
const textsDir = path.join(root, "client", "public", "data", "texts");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });

const map = readJson(mapPath);
const combined = { hexagrams: {} };
for (const [bits, info] of Object.entries(map.hexagrams)) {
  const text = readJson(path.join(textsDir, `${info.key}.json`));
  combined.hexagrams[bits] = {
    key: info.key,
    number: info.number,
    name: info.name,
    gua_ci: text.gua_ci,
    xiang_yue: text.xiang_yue,
    yao_ci: text.yao_ci,
  };
}

if (Object.keys(combined.hexagrams).length !== 64) {
  throw new Error("Expected all 64 hexagrams");
}

fs.copyFileSync(path.join(sourceDir, "index.html"), path.join(outputDir, "index.html"));
fs.copyFileSync(path.join(sourceDir, "style.css"), path.join(assetsDir, "style.css"));
fs.copyFileSync(path.join(sourceDir, "app.js"), path.join(assetsDir, "app.js"));
fs.copyFileSync(path.join(sourceDir, "icon.svg"), path.join(assetsDir, "icon.svg"));
fs.copyFileSync(path.join(root, "client", "public", "assets", "coin-front.jpg"), path.join(assetsDir, "coin-front.jpg"));
fs.copyFileSync(path.join(root, "client", "public", "assets", "coin-back.jpg"), path.join(assetsDir, "coin-back.jpg"));
fs.writeFileSync(path.join(assetsDir, "hexagrams.js"), `window.ZHONGJIAN_HEXAGRAMS=${JSON.stringify(combined)};\n`, "utf8");

fs.rmSync(zipPath, { force: true });
execFileSync("zip", ["-q", "-r", zipPath, ".", "-x", "*.DS_Store"], { cwd: outputDir });
console.log(zipPath);
