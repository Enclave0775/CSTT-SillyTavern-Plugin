# CSTT-SillyTavern-Plugin - SillyTavern 專用繁簡轉換工具

CSTT-SillyTavern-Plugin 是一個為 SillyTavern 設計的第三方擴充功能，主要功能是讓使用者能夠轉換角色卡（`.png`）與（`.json`）檔案中的簡體中文與繁體中文。

本工具能穩定地處理儲存在 PNG 檔案中的元數據（metadata），確保在轉換文字的同時不會損壞圖片檔案。

## 主要功能

- **繁簡雙向轉換：** 可輕鬆在簡體中文與繁體中文之間進行切換。
- **支援 PNG 角色卡：**
    - 智慧型解析 PNG 區塊（`tEXt`, `zTXt`, `iTXt`），這些區塊通常儲存著角色資料。
    - 自動偵測並處理元數據中的原始 JSON 或 Base64 編碼的 JSON。
    - 在修改後，會以正確的區塊長度和 CRC 校驗和重建 PNG 檔案，以防止檔案損毀。
- **支援 JSON 檔案：** 可直接轉換 `.json` 檔案，適用於聊天記錄或其他資料檔案。
- **友善的使用者介面：** 在 SillyTavern 的擴充功能面板中提供了一個簡單的介面，方便使用者上傳檔案並選擇轉換模式。
- **自動匯入：** （可選功能）轉換後的檔案可以透過模擬拖放的方式自動匯入回 SillyTavern，簡化了操作流程。

## 安裝方式

1.  開啟 SillyTavern。
2.  點擊頂部工具列中的「擴充功能 (Extensions)」按鈕。
3.  點擊「安裝擴充功能 (Install Extension)」。
4.  將此 URL 複製到輸入欄位中： `https://github.com/Enclave0775/CSTT-SillyTavern-Plugin`
5.  點擊「僅為我安裝 (Install just for me)」或「為所有使用者安裝 (Install for all users)」。

## 使用教學

1.  在 SillyTavern 中，前往擴充功能的設定頁面。
2.  找到 **CSTT Converter** 面板。
3.  點擊 **「選擇檔案 (Select Files)」** 按鈕，選擇一個或多個您想要轉換的 `.png` 或 `.json` 檔案。
4.  選擇您需要的 **轉換模式 (Conversion Mode)**：
    - **簡體轉繁體 (Simplified to Traditional)**
    - **繁體轉簡體 (Traditional to Simplified)**
5.  （可選）如果您希望轉換後的檔案能自動載入回 SillyTavern，請勾選 **「自動匯入 (Auto Import)」** 核取方塊。如果未勾選，檔案將會直接下載到您的裝置。
6.  點擊 **「轉換 (Convert)」** 按鈕。
7.  下方的日誌區域將會顯示轉換過程的狀態。

## 技術細節

本擴充功能使用了數個強大的函式庫來實現其功能：

- **[OpenCC-JS](https://github.com/nk2028/opencc-js):** 核心的繁簡中文轉換邏輯。
- **[Pako](https://github.com/nodeca/pako):** 用於解壓縮在 `zTXt` 和 `iTXt` PNG 區塊中找到的壓縮資料。
- **CRC32:** 用於在修改後重新計算每個 PNG 區塊的循環冗餘校驗（CRC）值，這對於維持 PNG 檔案的完整性至關重要。

## 作者

- **Enclave0775**

---
