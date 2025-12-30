/* CSTT — Full PNG/Text Converter Module
   Features:
   - Full support for tEXt / zTXt / iTXt
   - Auto-detects Base64 JSON or raw JSON inside text chunks
   - Robustly reconstructs PNG with updated chunk lengths and CRC
   - Falls back to original chunk when parsing fails (no corruption)
   - AI Response Interception and Conversion
*/

import { eventSource, event_types, saveSettings } from '/script.js';
import { extension_settings, getContext } from '/scripts/extensions.js';

const extensionName = "CSTT-SillyTavern-Plugin";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// Mapping for conversion modes
const MODE_MAP = {
    's2t': { from: 'cn', to: 't' },
    't2s': { from: 't', to: 'cn' },
    's2tw': { from: 'cn', to: 'tw' },
    'tw2s': { from: 'tw', to: 'cn' },
    's2twp': { from: 'cn', to: 'twp' },
    'tw2sp': { from: 'twp', to: 'cn' },
    's2hk': { from: 'cn', to: 'hk' },
    'hk2s': { from: 'hk', to: 'cn' },
    't2tw': { from: 't', to: 'tw' },
    't2hk': { from: 't', to: 'hk' }
};

function loadCss(href) {
    if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
        document.head.appendChild(link);
    });
}

function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(s);
    });
}

async function setup() {
    try {
        const settingsHtml = await fetch(`${extensionFolderPath}settings.html`).then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); });
        const container = document.getElementById('extensions_container') || document.getElementById('extensions_settings');
        if (!container) { console.error(`${extensionName}: extensions container not found`); return; }
        const extDiv = document.createElement('div');
        extDiv.innerHTML = settingsHtml;
        container.appendChild(extDiv);

        await Promise.all([
            loadCss(`${extensionFolderPath}style.css`),
            loadScript(`${extensionFolderPath}lib/full.js`),
            loadScript(`${extensionFolderPath}lib/pako.js`),
            loadScript(`${extensionFolderPath}lib/crc.js`)
        ]);

        initializeConverter();
        initializeAiInterception();
        console.log(`${extensionName}: initialized`);
    } catch (e) {
        console.error(`${extensionName}: setup failed`, e);
        const logOutput = document.getElementById('log-output');
        if (logOutput) {
            logOutput.textContent += `❌ 擴充功能初始化失敗: ${e.message}\n`;
            logOutput.textContent += '請檢查檔案路徑與網路連線，並查看控制台錯誤訊息。\n';
        }
    }
}

function initializeAiInterception() {
    // Ensure settings object exists
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    const settings = extension_settings[extensionName];

    // UI Elements
    const enableCheckbox = document.getElementById('ai-convert-enable');
    const modeBlock = document.getElementById('ai-convert-mode-block');
    const modeSelect = document.getElementById('ai-conversion-mode-select');

    if (!enableCheckbox || !modeBlock || !modeSelect) {
        console.warn(`${extensionName}: AI Interception UI elements missing.`);
        return;
    }

    // Load Settings
    enableCheckbox.checked = settings.aiConvertEnabled || false;
    modeBlock.style.display = enableCheckbox.checked ? 'block' : 'none';
    
    // Set default mode if not set or invalid
    if (!settings.aiConvertMode || !MODE_MAP[settings.aiConvertMode]) {
        settings.aiConvertMode = 's2twp';
    }
    modeSelect.value = settings.aiConvertMode;

    // Event Listeners for UI
    enableCheckbox.addEventListener('change', () => {
        settings.aiConvertEnabled = enableCheckbox.checked;
        modeBlock.style.display = enableCheckbox.checked ? 'block' : 'none';
        saveSettings();
    });

    modeSelect.addEventListener('change', () => {
        settings.aiConvertMode = modeSelect.value;
        saveSettings();
    });

    // Register Generation Event Listener
    if (!window._cstt_event_registered) {
        const handleGenerationEnded = async () => {
            if (!settings.aiConvertEnabled) {
                return;
            }

            console.log(`${extensionName}: GENERATION_ENDED triggered.`);
            
            // Wait a bit to ensure message is in chat history
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const context = getContext();
                const chat = context.chat;
                
                if (!chat || chat.length === 0) {
                    console.warn(`${extensionName}: Chat is empty.`);
                    return;
                }

                const lastMsgIndex = chat.length - 1;
                const lastMsg = chat[lastMsgIndex];

                // Only process AI messages
                if (lastMsg.is_user) {
                    return;
                }

                // Prevent double processing
                if (lastMsg._cstt_processed) {
                    return;
                }

                const mode = settings.aiConvertMode || 's2twp';
                const options = MODE_MAP[mode] || MODE_MAP['s2twp'];
                
                if (typeof OpenCC === 'undefined') {
                    console.warn(`${extensionName}: OpenCC not loaded, skipping conversion.`);
                    return;
                }

                const converter = OpenCC.Converter(options);
                const original = lastMsg.mes;
                const converted = converter(original);

                if (original !== converted) {
                    console.log(`${extensionName}: Converting message...`);
                    lastMsg.mes = converted;
                    lastMsg._cstt_processed = true;
                    
                    // Update UI
                    eventSource.emit(event_types.MESSAGE_UPDATED, lastMsgIndex);
                    console.log(`${extensionName}: Converted AI response (${mode})`);
                }
            } catch (err) {
                console.error(`${extensionName}: Error converting AI response`, err);
            }
        };

        eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);
        window._cstt_event_registered = true;
        console.log(`${extensionName}: AI Interception event listener registered.`);
    }
}

function initializeConverter() {
    const fileInput = document.getElementById('file-input');
    const fileSelectButton = document.getElementById('file-select-button');
    const fileNameDisplay = document.getElementById('file-name-display');
    const convertButton = document.getElementById('convert-button');
    const logOutput = document.getElementById('log-output');
    const conversionModeSelect = document.getElementById('conversion-mode-select');
    const autoImportCheckbox = document.getElementById('auto-import-checkbox');
    const importTypeBlock = document.getElementById('import-type-block');

    function log(msg) { if (logOutput) { logOutput.appendChild(document.createTextNode(msg + '\n')); logOutput.scrollTop = logOutput.scrollHeight; } else console.log(msg); }

    if (!fileInput || !convertButton || !fileSelectButton || !fileNameDisplay || !conversionModeSelect || !autoImportCheckbox || !importTypeBlock) {
        console.error(`${extensionName}: UI elements missing`);
        if (logOutput) logOutput.textContent = '錯誤：UI 元素缺失，擴充功能無法初始化。';
        return;
    }

    if (typeof OpenCC === 'undefined' || typeof pako === 'undefined' || typeof CRC32 === 'undefined') {
        log('錯誤：必要的函式庫 (OpenCC, pako, CRC32) 未能成功載入。');
        return;
    }

    fileSelectButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            fileNameDisplay.textContent = Array.from(fileInput.files).map(f => f.name).join(', ');
        } else {
            fileNameDisplay.textContent = '未選擇任何檔案';
        }
    });

    autoImportCheckbox.addEventListener('change', () => {
        importTypeBlock.style.display = autoImportCheckbox.checked ? 'block' : 'none';
    });
    // Initial state
    importTypeBlock.style.display = autoImportCheckbox.checked ? 'block' : 'none';

    convertButton.addEventListener('click', async () => {
        if (logOutput) logOutput.textContent = ''; // Clear log on new conversion
        const files = fileInput.files;
        const mode = conversionModeSelect.value;
        const importType = document.querySelector('input[name="import-type"]:checked').value;
        if (!files || files.length === 0) { log('請先選擇要轉換的檔案。'); return; }
        log(`INFO: 開始轉換 (模式: ${mode})...`);

        const convertedFiles = [];
        const downloadTasks = [];

        for (const file of files) {
            try {
                const options = MODE_MAP[mode] || MODE_MAP['s2twp'];
                const converter = OpenCC.Converter(options);
                const name = file.name.toLowerCase();
                let blob;

                if (name.endsWith('.png')) {
                    blob = await convertPngToBlob(file, converter, log);
                } else if (name.endsWith('.json')) {
                    blob = await convertJsonToBlob(file, converter, log);
                } else {
                    log(`跳過不支援的檔案類型: ${file.name}`);
                    continue;
                }

                const newFile = new File([blob], `converted-${file.name}`, { type: blob.type });
                if (autoImportCheckbox.checked) {
                    convertedFiles.push(newFile);
                } else {
                    downloadTasks.push(downloadFile(blob, newFile.name, log));
                }
                log(`✓ 已處理檔案: ${file.name}`);
            } catch (err) {
                log(`處理檔案 ${file.name} 時發生嚴重錯誤: ${err.message}`);
                console.error(err);
            }
        }

        if (convertedFiles.length > 0) {
            await importFile(convertedFiles, importType, log);
        }
        if (downloadTasks.length > 0) {
            await Promise.all(downloadTasks);
        }

        log('INFO: 所有檔案處理完畢。');
    });

    async function convertJsonToBlob(file, converter, log) {
        const text = await file.text();
        const data = JSON.parse(text);
        const converted = convertJsonValue(data, converter);
        const newJson = JSON.stringify(converted, null, 2);
        return new Blob([newJson], { type: 'application/json' });
    }

    function convertJsonValue(value, converter) {
        if (typeof value === 'string') return converter(value);
        if (Array.isArray(value)) return value.map(v => convertJsonValue(v, converter));
        if (typeof value === 'object' && value !== null) {
            const out = {};
            for (const k in value) out[k] = convertJsonValue(value[k], converter);
            return out;
        }
        return value;
    }

    async function importFile(files, importType, log) {
        try {
            const dataTransfer = new DataTransfer();
            files.forEach(file => dataTransfer.items.add(file));

            if (importType === 'world') {
                const worldImportInput = document.getElementById('world_import_file');
                if (worldImportInput) {
                    worldImportInput.files = dataTransfer.files;
                    const changeEvent = new Event('change', { bubbles: true });
                    worldImportInput.dispatchEvent(changeEvent);
                    log(`✓ 已提交 ${files.length} 個檔案至世界書匯入處理程序。`);
                } else {
                    throw new Error('找不到世界書匯入的檔案輸入框 (world_import_file)。');
                }
            } else if (importType === 'preset') {
                if (window.TavernHelper && typeof window.TavernHelper.importRawPreset === 'function') {
                    log('INFO: 正在使用 TavernHelper 匯入預設...');
                    for (const file of files) {
                        try {
                            const fileContent = await file.text();
                            await window.TavernHelper.importRawPreset(file.name, fileContent);
                            log(`✓ 已提交預設檔案: ${file.name}`);
                        } catch (err) {
                            log(`❌ 匯入預設檔案 ${file.name} 時發生錯誤: ${err.message}`);
                            console.error(err);
                        }
                    }
                    if (window.TavernHelper && typeof window.TavernHelper.addOneMessage === 'function') {
                        window.TavernHelper.addOneMessage({
                            is_user: false,
                            name: "CSTT",
                            mes: `已成功提交 ${files.length} 個預設檔案進行匯入。`,
                        });
                    }
                } else {
                    throw new Error('找不到 TavernHelper.importRawPreset 或 TavernHelper.addOneMessage 功能。請確認 JS-Slash-Runner 擴充功能已正確安裝及啟用。');
                }
            } else if (importType === 'regex') {
                // Attempt to find API functions (global or on TavernHelper)
                const th = window.TavernHelper || {};
                const updateRegexFunc = window.updateTavernRegexesWith || th.updateTavernRegexesWith;
                const getRegexFunc = window.getTavernRegexes || th.getTavernRegexes;
                const replaceRegexFunc = window.replaceTavernRegexes || th.replaceTavernRegexes;
                const uuidFunc = window.uuidv4 || th.uuidv4 || (() => crypto.randomUUID());

                // Helper to map ST Regex format to TavernHelper Regex format
                const mapToTavernRegex = (item) => {
                    // Default scope mapping (ST placement -> TavernHelper source)
                    // 1: User Input, 2: AI Output, 3: World Info, 4: Slash Command
                    const placement = Array.isArray(item.placement) ? item.placement : [];
                    const source = item.source || {
                        user_input: placement.includes(1),
                        ai_output: placement.includes(2),
                        world_info: placement.includes(3),
                        slash_command: placement.includes(4),
                    };
                    // Default to AI Output if nothing specified
                    if (!item.source && placement.length === 0) {
                        source.ai_output = true;
                    }

                    const destination = item.destination || {
                        display: !item.promptOnly,
                        prompt: !item.markdownOnly, // Assuming markdownOnly implies display only
                    };

                    return {
                        id: item.id || uuidFunc(),
                        script_name: item.scriptName || item.script_name || "Imported Regex",
                        find_regex: item.findRegex || item.find_regex || "",
                        replace_string: item.replaceString || item.replace_string || "",
                        enabled: item.disabled !== undefined ? !item.disabled : (item.enabled !== undefined ? item.enabled : true),
                        run_on_edit: item.runOnEdit !== undefined ? item.runOnEdit : (item.run_on_edit || false),
                        min_depth: item.minDepth || item.min_depth || null,
                        max_depth: item.maxDepth || item.max_depth || null,
                        scope: item.scope || 'global', // Default to global scope
                        source: source,
                        destination: destination
                    };
                };

                // Helper to perform update if update function is missing but get/replace exist
                const performUpdate = async (newRegexes) => {
                    if (typeof updateRegexFunc === 'function') {
                        return await updateRegexFunc((existing) => [...existing, ...newRegexes]);
                    } else if (typeof getRegexFunc === 'function' && typeof replaceRegexFunc === 'function') {
                        const existing = getRegexFunc();
                        const merged = [...existing, ...newRegexes];
                        await replaceRegexFunc(merged);
                        return merged;
                    }
                    throw new Error("找不到支援的正規表達式 API (updateTavernRegexesWith 或 get/replaceTavernRegexes)");
                };

                if (updateRegexFunc || (getRegexFunc && replaceRegexFunc)) {
                    log('INFO: 正在使用 TavernHelper API 匯入正規表達式...');
                    try {
                        const newRegexes = [];
                        for (const file of files) {
                            const content = await file.text();
                            let json;
                            try { json = JSON.parse(content); } catch (e) { 
                                log(`❌ 檔案 ${file.name} 解析失敗: 无效的 JSON`);
                                continue; 
                            }
                            
                            // Handle both array and ST Regex export format
                            const items = Array.isArray(json) ? json : (json.regexScripts || [json]);
                            // Map items to valid TavernRegex structure
                            const mappedItems = items.map(mapToTavernRegex);
                            newRegexes.push(...mappedItems);
                        }

                        if (newRegexes.length > 0) {
                            await performUpdate(newRegexes);
                            log(`✓ 已透過 API 成功匯入 ${newRegexes.length} 條正規表達式規則。`);
                            
                            const addMsgFunc = window.addOneMessage || th.addOneMessage;
                            if (typeof addMsgFunc === 'function') {
                                addMsgFunc({
                                    is_user: false,
                                    name: "CSTT",
                                    mes: `已成功透過 API 匯入 ${newRegexes.length} 條正規表達式規則。`,
                                });
                            }
                        } else {
                            log('⚠️ 未找到可匯入的正規表達式資料。');
                        }
                    } catch (e) {
                        console.error("Regex API import failed", e);
                        log(`❌ API 匯入失敗: ${e.message}`);
                    }
                } else {
                    log('❌ 錯誤: 找不到酒館助手 (JS-Slash-Runner) 正規表達式 API。');
                    console.log("Available TavernHelper keys:", Object.keys(th));
                    console.error('Regex APIs not found on window or TavernHelper.');
                }
            } else {
                // Default to character import via drag-and-drop on body
                const dropEvent = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dataTransfer,
                });
                document.body.dispatchEvent(dropEvent);
                log(`✓ 已提交 ${files.length} 個檔案進行角色卡拖放匯入。`);
            }
        } catch (e) {
            log(`❌ 模擬匯入時發生錯誤: ${e.message}`);
            console.error(e);
            const downloadTasks = files.map(file => downloadFile(file, file.name, log));
            await Promise.all(downloadTasks);
            log('ℹ️ 自動匯入失敗，已改為觸發手動下載。');
        }
    }

    async function downloadFile(blob, fileName, log) {
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            log(`✓ 已轉換並觸發下載: ${fileName}`);
        } catch (e) { log(`❌ 下載檔案 ${fileName} 時發生錯誤: ${e.message}`); console.error(e); }
    }

    // ---------- Robust PNG chunk converter ----------
    function isPngSignature(bytes) {
        if (!bytes || bytes.length < 8) return false;
        const sig = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        return sig === '89504e470d0a1a0a';
    }

    async function convertPngToBlob(file, converter, log) {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        if (!isPngSignature(data)) {
            log(`❌ 跳過 ${file.name}: 不是有效的 PNG`);
            return null;
        }

        const outputParts = [data.slice(0, 8)];
        let pos = 8;
        const dv = new DataView(data.buffer);

        while (pos + 8 <= data.length) {
            const length = dv.getUint32(pos, false);
            const typeBytes = data.slice(pos + 4, pos + 8);
            const chunkType = new TextDecoder().decode(typeBytes);
            const chunkStart = pos + 8;
            const chunkEnd = chunkStart + length;
            if (chunkEnd > data.length) break; // malformed
            const chunkData = data.slice(chunkStart, chunkEnd);
            const crcStart = chunkEnd;
            const crcEnd = crcStart + 4;
            // process tEXt / zTXt / iTXt
            let newChunkData = chunkData;
            try {
                if (['tEXt', 'zTXt', 'iTXt'].includes(chunkType)) {
                    const processed = convertChunkData(chunkType, chunkData, converter, log);
                    if (processed instanceof Uint8Array) newChunkData = processed;
                }
            } catch (e) { console.error('convertChunkData error', e); }

            const newLength = newChunkData.length;
            const lengthBuf = new ArrayBuffer(4); new DataView(lengthBuf).setUint32(0, newLength, false);
            const crcInput = new Uint8Array(4 + newLength);
            crcInput.set(typeBytes, 0); crcInput.set(newChunkData, 4);
            const newCrc = CRC32.buf(crcInput) >>> 0;
            const crcBuf = new ArrayBuffer(4); new DataView(crcBuf).setUint32(0, newCrc, false);

            outputParts.push(new Uint8Array(lengthBuf), typeBytes, newChunkData, new Uint8Array(crcBuf));

            pos = crcEnd;
        }

        return new Blob(outputParts, { type: 'image/png' });
    }

    // Robust chunk parser that attempts to find JSON (base64 or raw) and convert it
    function convertChunkData(chunkType, chunkData, converter, log) {
        const td = new TextDecoder('utf-8', { fatal: false });
        const te = new TextEncoder();

        try {
            // Find keyword (first null)
            const keywordEnd = chunkData.indexOf(0);
            if (keywordEnd === -1) return chunkData;
            const keyword = chunkData.slice(0, keywordEnd);
            const keywordStr = td.decode(keyword);

            let rawText = null;

            if (chunkType === 'tEXt') {
                rawText = td.decode(chunkData.slice(keywordEnd + 1));
            } else if (chunkType === 'zTXt') {
                // keyword\0 compressionMethod(1 byte) compressedData
                if (chunkData.length <= keywordEnd + 1) return chunkData;
                const compMethod = chunkData[keywordEnd + 1];
                const compressed = chunkData.slice(keywordEnd + 2);
                rawText = pako.inflate(compressed, { to: 'string' });
            } else if (chunkType === 'iTXt') {
                // iTXt: keyword\0 compressionFlag\0 compressionMethod\0 languageTag\0 translatedKeyword\0 text
                let p = keywordEnd + 1;
                const compressionFlag = chunkData[p]; p++;
                const compressionMethod = chunkData[p]; p++;

                // languageTag
                const langEnd = chunkData.indexOf(0, p);
                if (langEnd === -1) return chunkData;
                p = langEnd + 1;

                // translatedKeyword
                const transEnd = chunkData.indexOf(0, p);
                if (transEnd === -1) return chunkData;
                p = transEnd + 1;

                const remaining = chunkData.slice(p);
                if (compressionFlag === 1) rawText = pako.inflate(remaining, { to: 'string' }); else rawText = td.decode(remaining);
            }

            if (!rawText || rawText.length === 0) return chunkData;

            // Attempt Base64 decode -> JSON
            let jsonObj = null;
            try {
                const decoded = b64DecodeUnicode(rawText);
                jsonObj = JSON.parse(decoded);
                log && log(`[DEBUG] Detected base64 JSON in chunk (keyword: ${keywordStr || '<empty>'})`);
            } catch (e) {
                try { jsonObj = JSON.parse(rawText); log && log(`[DEBUG] Detected raw JSON in chunk (keyword: ${keywordStr || '<empty>'})`); } catch (e2) { return chunkData; }
            }

            // Convert recursively
            const converted = convertJsonValue(jsonObj, converter);
            const newJson = JSON.stringify(converted);

            // Re-encode in original-ish form
            if (chunkType === 'tEXt') {
                const newB64 = b64EncodeUnicode(newJson);
                const encoded = te.encode(newB64);
                return new Uint8Array([...keyword, 0, ...encoded]);
            }

            if (chunkType === 'zTXt') {
                const compressed = pako.deflate(te.encode(newJson));
                // use compression method 0
                return new Uint8Array([...keyword, 0, 0, ...compressed]);
            }

            if (chunkType === 'iTXt') {
                // Write minimal iTXt with no compression (compressionFlag=0)
                const langNull = new Uint8Array([0]);
                const transNull = new Uint8Array([0]);
                const textBytes = te.encode(newJson);
                return new Uint8Array([...keyword, 0, 0, 0, ...langNull, ...transNull, ...textBytes]);
            }

            return chunkData;
        } catch (e) {
            console.error('convertChunkData exception', e);
            return chunkData; // fallback
        }
    }

    // helper: base64 unicode decode/encode (round-trip safe)
    function b64DecodeUnicode(str) {
        // atob may throw
        try {
            return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        } catch (e) { throw e; }
    }
    function b64EncodeUnicode(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    }

}

setup();
