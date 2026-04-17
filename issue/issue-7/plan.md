# Issue 7 - 專案定位轉正式使用與套件識別同步

本 issue 承接目前 viewer 與 round 流程已可實際使用的狀態，聚焦把 root 套件識別與專案文件從 `POC` 定位同步調整為正式使用中的驗證工具，避免設定、README 與 AI 入口規則彼此矛盾。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 root `package.json` 仍使用 `poc`，且沒有 `description`。

同時 `README.md` 與 `AGENTS.md` 還多次把本案描述成 `POC`，但實際上此案已進入真實使用階段，會直接影響：

- 套件識別是否貼近實際用途
- AI 接手時對專案階段的判斷
- 文件是否能正確引導後續維運與修改

## 2. 目標

本 issue 要回答：

1. root `package.json` 的名稱與描述是否已足夠代表本案實際用途。
2. `README.md` 是否已改為正式使用中的驗證工具定位。
3. `AGENTS.md` 的入口規則是否已與新定位一致。

## 3. 執行項目

### Task A. 更新 root package metadata

- Goal: 讓 root `package.json` 的 `name` 與 `description` 能正確描述本案用途。
- 預期輸出：
  - 一個不再帶有 `POC` 意涵的套件名稱
  - 一段可直接說明專案用途的描述

### Task B. 同步 README 與 AI 入口規則

- Goal: 讓 `README.md` 與 `AGENTS.md` 不再以 POC 作為目前階段描述，但仍保留避免過度設計的原則。
- 預期輸出：
  - README 的標題、目前階段、成功標準同步更新
  - AGENTS 的入口與決策原則同步更新

### Task C. 留下執行紀錄與 FEEDBACK

- Goal: 讓下一輪能清楚知道這次定位切換改了哪些內容、為何要改。
- 預期輸出：
  - `issue/issue-7/impl.md`

## 4. 成功標準

本 issue 若要算成功，至少需滿足：

1. root `package.json` 已有新的 `name` 與 `description`。
2. `README.md` 不再把本案寫成目前仍是 POC。
3. `AGENTS.md` 已能正確引導 AI 以正式使用中的驗證工具角度接手。
4. `impl.md` 已完整補上 FEEDBACK。

## 5. 風險

- 若名稱改得過度偏向單一 viewer，可能會縮限 root 專案對整體資料準備流程的定位。
- 若文件只拿掉 `POC` 字樣，卻沒有補上新的階段描述，下一輪仍可能誤判工作重心。
- 若完全轉成產品化語氣，可能反而導致過度設計與不必要的工程化。
