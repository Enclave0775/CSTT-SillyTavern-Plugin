/* CSTT — Full PNG/Text Converter Module
   Features:
   - Full support for tEXt / zTXt / iTXt
   - Auto-detects Base64 JSON or raw JSON inside text chunks
   - Robustly reconstructs PNG with updated chunk lengths and CRC
   - Falls back to original chunk when parsing fails (no corruption)
   - AI Response Interception and Conversion
*/

// Use relative imports so the plugin keeps working when SillyTavern is hosted under a URL subpath.
import { eventSource, event_types, saveSettings } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

const extensionName = "CSTT-SillyTavern-Plugin";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// Cache for the expensive OpenCC ConverterFactory result, keyed by conversion mode.
const openccConverterCache = new Map();

function makeDictId() {
    return crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
}

function getOpenccConverter(mode) {
    if (openccConverterCache.has(mode)) {
        return openccConverterCache.get(mode);
    }

    const options = MODE_MAP[mode] || MODE_MAP['s2twp'];
    const dictGroups = [];

    // Add standard dictionaries based on mode
    ['from', 'to'].forEach(type => {
        if (options[type] && options[type] !== 't') {
            const preset = OpenCC.Locale[type][options[type]];
            if (preset) {
                dictGroups.push(preset);
            }
        }
    });

    const converter = OpenCC.ConverterFactory.apply(null, dictGroups);
    openccConverterCache.set(mode, converter);
    return converter;
}

// Helper to get converter with custom dictionaries
function getConverter(mode) {
    if (typeof OpenCC === 'undefined') {
        throw new Error('OpenCC library not loaded');
    }
    
    // Custom dictionaries are handled via placeholder protection mechanism
    const settings = getSettings();
    let customEntries = settings.custom_dictionaries
        .filter(d => d.enabled)
        .map(d => d.content)
        .flat()
        .filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].length > 0);

    // Sort by length descending to handle overlapping matches (longest match first)
    customEntries.sort((a, b) => b[0].length - a[0].length);

    const openccConverter = getOpenccConverter(mode);

    return function(text) {
        if (!text) return text;
        
        // Optimization: if no custom entries, just run opencc
        if (customEntries.length === 0) {
            return openccConverter(text);
        }

        const placeholders = [];
        let protectedText = text;

        for (let i = 0; i < customEntries.length; i++) {
            const [origin, replacement] = customEntries[i];
            if (!origin) continue;
            
            // Only replace if the text actually contains the origin
            if (protectedText.includes(origin)) {
                const placeholder = makePlaceholder(i);
                const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Replace all occurrences
                protectedText = protectedText.replace(new RegExp(escapedOrigin, 'g'), placeholder);
                placeholders.push({ ph: placeholder, rep: replacement });
            }
        }

        let convertedText = openccConverter(protectedText);

        // Restore
        for (const { ph, rep } of placeholders) {
             convertedText = convertedText.split(ph).join(rep);
        }

        return convertedText;
    };
}

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

const DEFAULT_SETTINGS = {
    language: 'zh-TW',
    conversionMode: 's2twp',
    autoImport: true,
    importType: 'character',
    toolAutoMount: true,
    aiConvertEnabled: false,
    aiConvertMode: 's2twp',
    jsonConversionScope: 'all',
    jsonSelectedFields: 'name,description,personality,scenario,first_mes,mes,creator_notes,system_prompt,post_history_instructions,scriptName,replaceString,comment,content,entries,keys,secondary_keys'
};

const I18N = {
    'zh-TW': {
        title: 'CSTT 簡繁角色卡轉換', fileConversion: '檔案轉換 (File Conversion)', language: '介面語言:', selectFiles: '選擇檔案:', browse: '瀏覽...', noFiles: '未選擇任何檔案', conversionMode: '轉換模式:', autoImport: '自動匯入 (若失敗則改為下載)', importType: '匯入類型:', character: '角色卡', world: '世界書', preset: '預設', regex: '正規表達式', jsonScope: 'JSON 字串轉換範圍:', jsonAll: '轉換所有字串欄位', jsonSelected: '只轉換選定欄位', jsonFields: '欄位名稱/路徑（逗號分隔）:', convert: '轉換', customDictionary: '外掛字典管理 (Custom Dictionary)', createDictionary: '新建字典', importDictionary: '匯入字典...', clearList: '清空列表', dictionaryTools: '字典工具 (Dictionary Tools)', dictionaryConvert: '字典轉換:', selectTxtDictionary: '選擇 TXT 字典...', convertToJson: '轉為 JSON', autoMountDictionary: '轉換後自動加入外掛字典列表', aiConversion: 'AI 回覆即時轉換', enableAiConversion: '啟用 AI 回覆攔截轉換', logTitle: '轉換日誌', clearLog: '清空日誌', contact: '對於插件有問題可聯絡提問', originalAuthor: '原作者 (Original Author):', editDictionary: '編輯字典 (Edit Dictionary)', dictNotice: '注意：自定義字典具有最高優先級。若設定單字規則導致詞彙轉換錯誤，請將正確的詞彙規則也加入字典。系統會優先匹配較長的詞彙。', name: '名稱:', original: '原文 (Original)', replacement: '替換 (Replacement)', addEntry: '新增詞條', save: '儲存', cancel: '取消'
    },
    'zh-CN': {
        title: 'CSTT 简繁角色卡转换', fileConversion: '文件转换 (File Conversion)', language: '界面语言:', selectFiles: '选择文件:', browse: '浏览...', noFiles: '未选择任何文件', conversionMode: '转换模式:', autoImport: '自动导入（若失败则改为下载）', importType: '导入类型:', character: '角色卡', world: '世界书', preset: '预设', regex: '正则表达式', jsonScope: 'JSON 字符串转换范围:', jsonAll: '转换所有字符串字段', jsonSelected: '只转换选定字段', jsonFields: '字段名称/路径（逗号分隔）:', convert: '转换', customDictionary: '外挂字典管理 (Custom Dictionary)', createDictionary: '新建字典', importDictionary: '导入字典...', clearList: '清空列表', dictionaryTools: '字典工具 (Dictionary Tools)', dictionaryConvert: '字典转换:', selectTxtDictionary: '选择 TXT 字典...', convertToJson: '转为 JSON', autoMountDictionary: '转换后自动加入外挂字典列表', aiConversion: 'AI 回复实时转换', enableAiConversion: '启用 AI 回复拦截转换', logTitle: '转换日志', clearLog: '清空日志', contact: '插件有问题可联系提问', originalAuthor: '原作者 (Original Author):', editDictionary: '编辑字典 (Edit Dictionary)', dictNotice: '注意：自定义字典具有最高优先级。若设置单字规则导致词汇转换错误，请将正确的词汇规则也加入字典。系统会优先匹配较长的词汇。', name: '名称:', original: '原文 (Original)', replacement: '替换 (Replacement)', addEntry: '新增词条', save: '保存', cancel: '取消'
    },
    'en': {
        title: 'CSTT Chinese Converter', fileConversion: 'File Conversion', language: 'Interface language:', selectFiles: 'Select files:', browse: 'Browse...', noFiles: 'No files selected', conversionMode: 'Conversion mode:', autoImport: 'Auto import (download if it fails)', importType: 'Import type:', character: 'Character card', world: 'World info', preset: 'Preset', regex: 'Regex', jsonScope: 'JSON string conversion scope:', jsonAll: 'Convert all string fields', jsonSelected: 'Convert selected fields only', jsonFields: 'Field names/paths (comma separated):', convert: 'Convert', customDictionary: 'Custom Dictionary', createDictionary: 'Create dictionary', importDictionary: 'Import dictionary...', clearList: 'Clear list', dictionaryTools: 'Dictionary Tools', dictionaryConvert: 'Dictionary conversion:', selectTxtDictionary: 'Select TXT dictionary...', convertToJson: 'Convert to JSON', autoMountDictionary: 'Add converted dictionary to custom dictionary list', aiConversion: 'Live AI Response Conversion', enableAiConversion: 'Enable AI response interception conversion', logTitle: 'Conversion log', clearLog: 'Clear log', contact: 'Contact the author if you have plugin issues.', originalAuthor: 'Original Author:', editDictionary: 'Edit Dictionary', dictNotice: 'Custom dictionaries have the highest priority. If a single-character rule causes incorrect phrase conversion, add the correct longer phrase rule as well. Longer phrases are matched first.', name: 'Name:', original: 'Original', replacement: 'Replacement', addEntry: 'Add entry', save: 'Save', cancel: 'Cancel'
    }
};

function getSettings() {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = {};
    const settings = extension_settings[extensionName];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) settings[key] = value;
    }
    settings.custom_dictionaries = normalizeDictionaries(settings.custom_dictionaries);
    return settings;
}

function normalizeDictionaries(input) {
    if (!Array.isArray(input)) return [];
    return input.map((dict) => {
        const content = Array.isArray(dict?.content) ? dict.content : [];
        return {
            id: dict?.id || makeDictId(),
            name: String(dict?.name || 'Dictionary'),
            enabled: dict?.enabled !== false,
            content: content
                .filter(entry => Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string')
                .map(entry => [entry[0], typeof entry[1] === 'string' ? entry[1] : String(entry[1] ?? '')])
        };
    });
}

function getCurrentLanguage() {
    const lang = getSettings().language;
    return I18N[lang] ? lang : 'zh-TW';
}

function t(key) {
    return I18N[getCurrentLanguage()][key] || I18N['zh-TW'][key] || key;
}

function applyTranslations() {
    // Scope translations strictly to this extension. SillyTavern itself also uses
    // data-i18n attributes, so querying the whole document would overwrite core UI labels.
    const root = document.querySelector('.CSTT');
    if (!root) return;

    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (key) el.textContent = t(key);
    });

    const fileNameDisplay = root.querySelector('#file-name-display');
    if (fileNameDisplay && fileNameDisplay.dataset.empty === 'true') fileNameDisplay.textContent = t('noFiles');
}

function makePlaceholder(index) {
    const randomPart = (crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`).replace(/-/g, '_');
    return `\uE000CSTT_${randomPart}_${index}\uE001`;
}

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
    const settings = getSettings();

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
            const currentSettings = getSettings();
            if (!currentSettings.aiConvertEnabled) {
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

                const mode = currentSettings.aiConvertMode || 's2twp';
                const options = MODE_MAP[mode] || MODE_MAP['s2twp'];
                
                if (typeof OpenCC === 'undefined') {
                    console.warn(`${extensionName}: OpenCC not loaded, skipping conversion.`);
                    return;
                }

                const converter = getConverter(mode);
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
    const languageSelect = document.getElementById('cstt-language-select');
    const jsonFieldsBlock = document.getElementById('json-fields-block');
    const jsonFieldsInput = document.getElementById('json-fields-input');

    const settings = getSettings();

    // Load saved settings
    if (languageSelect) languageSelect.value = getCurrentLanguage();
    conversionModeSelect.value = settings.conversionMode;
    autoImportCheckbox.checked = settings.autoImport;

    conversionModeSelect.addEventListener('change', () => {
        settings.conversionMode = conversionModeSelect.value;
        saveSettings();
    });

    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            settings.language = languageSelect.value;
            applyTranslations();
            renderDictList();
            saveSettings();
        });
    }

    // Custom Dictionary Elements
    const dictListContainer = document.getElementById('dict-list-container');
    const addDictInput = document.getElementById('add-dict-input');
    const addDictBtn = document.getElementById('add-dict-btn');
    const clearDictsBtn = document.getElementById('clear-dicts-btn');

    // Tool Elements
    const toolDictInput = document.getElementById('tool-dict-input');
    const toolDictSelectBtn = document.getElementById('tool-dict-select-btn');
    const toolConvertJsonBtn = document.getElementById('tool-convert-json-btn');
    const toolAutoMountCheckbox = document.getElementById('tool-auto-mount-checkbox');
    const toolDictStatus = document.getElementById('tool-dict-status');
    const clearLogBtn = document.getElementById('clear-log-btn');

    // Load saved settings for tool checkboxes
    toolAutoMountCheckbox.checked = settings.toolAutoMount;

    toolAutoMountCheckbox.addEventListener('change', () => {
        settings.toolAutoMount = toolAutoMountCheckbox.checked;
        saveSettings();
    });

    // Load saved settings for import type radio
    const savedImportTypeRadio = document.querySelector(`input[name="import-type"][value="${settings.importType}"]`);
    if (savedImportTypeRadio) savedImportTypeRadio.checked = true;

    const savedJsonScopeRadio = document.querySelector(`input[name="json-conversion-scope"][value="${settings.jsonConversionScope}"]`);
    if (savedJsonScopeRadio) savedJsonScopeRadio.checked = true;
    if (jsonFieldsInput) jsonFieldsInput.value = settings.jsonSelectedFields;

    function updateJsonFieldsVisibility() {
        const scope = document.querySelector('input[name="json-conversion-scope"]:checked')?.value || 'all';
        if (jsonFieldsBlock) jsonFieldsBlock.style.display = scope === 'selected' ? 'flex' : 'none';
    }
    updateJsonFieldsVisibility();

    document.querySelectorAll('input[name="json-conversion-scope"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                settings.jsonConversionScope = radio.value;
                updateJsonFieldsVisibility();
                saveSettings();
            }
        });
    });

    if (jsonFieldsInput) {
        jsonFieldsInput.addEventListener('change', () => {
            settings.jsonSelectedFields = jsonFieldsInput.value;
            saveSettings();
        });
    }

    document.querySelectorAll('input[name="import-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                settings.importType = radio.value;
                saveSettings();
            }
        });
    });

    function log(msg) { if (logOutput) { logOutput.appendChild(document.createTextNode(msg + '\n')); logOutput.scrollTop = logOutput.scrollHeight; } else console.log(msg); }

    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', () => {
            if (logOutput) logOutput.textContent = '';
        });
    }

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
            fileNameDisplay.dataset.empty = 'false';
            fileNameDisplay.textContent = Array.from(fileInput.files).map(f => f.name).join(', ');
        } else {
            fileNameDisplay.dataset.empty = 'true';
            fileNameDisplay.textContent = t('noFiles');
        }
    });

    autoImportCheckbox.addEventListener('change', () => {
        importTypeBlock.style.display = autoImportCheckbox.checked ? 'block' : 'none';
        settings.autoImport = autoImportCheckbox.checked;
        saveSettings();
    });
    // Initial state
    importTypeBlock.style.display = autoImportCheckbox.checked ? 'block' : 'none';

    // --- Custom Dictionary Logic ---
    
    // Initialize settings if needed
    settings.custom_dictionaries = normalizeDictionaries(settings.custom_dictionaries);
    extension_settings[extensionName].custom_dictionaries = settings.custom_dictionaries;
    
    function saveDicts() {
        saveSettings();
        renderDictList();
    }

    // Editor State and Elements
    let currentEditingDictId = null;
    const editorModal = document.getElementById('cstt-dict-editor-modal');
    const editorNameInput = document.getElementById('cstt-dict-name');
    const editorEntriesContainer = document.getElementById('cstt-dict-entries');
    const editorAddEntryBtn = document.getElementById('cstt-add-entry-btn');
    const editorSaveBtn = document.getElementById('cstt-save-dict-btn');
    const editorCancelBtn = document.getElementById('cstt-cancel-dict-btn');
    const createDictBtn = document.getElementById('create-dict-btn');

    function renderDictList() {
        if (!dictListContainer) return;
        dictListContainer.innerHTML = '';
        const dicts = getSettings().custom_dictionaries;
        
        if (dicts.length === 0) {
            dictListContainer.innerHTML = `<div style="font-style: italic; color: gray; text-align: center;">${getCurrentLanguage() === 'en' ? 'No saved dictionaries' : getCurrentLanguage() === 'zh-CN' ? '暂无保存的字典' : '暫無儲存的字典'}</div>`;
            return;
        }

        dicts.forEach((dict, index) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '4px';
            row.style.padding = '4px';
            row.style.backgroundColor = 'var(--background-color-tertiary)';
            row.style.borderRadius = '4px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = dict.enabled;
            checkbox.style.marginRight = '8px';
            checkbox.title = '啟用/停用';
            checkbox.onchange = () => {
                dict.enabled = checkbox.checked;
                saveDicts();
            };

            const nameLabel = document.createElement('span');
            nameLabel.textContent = `${dict.name} (${dict.content.length} ${getCurrentLanguage() === 'en' ? 'entries' : getCurrentLanguage() === 'zh-CN' ? '词' : '詞'})`;
            nameLabel.style.flexGrow = '1';
            nameLabel.style.overflow = 'hidden';
            nameLabel.style.textOverflow = 'ellipsis';
            nameLabel.title = dict.name;

            // Edit Button
            const editBtn = document.createElement('div');
            editBtn.className = 'menu_button fa-solid fa-pen-to-square';
            editBtn.style.cursor = 'pointer';
            editBtn.style.padding = '5px';
            editBtn.style.marginRight = '5px';
            editBtn.title = '編輯';
            editBtn.onclick = () => openEditor(dict);

            const downloadBtn = document.createElement('div');
            downloadBtn.className = 'menu_button fa-solid fa-download';
            downloadBtn.style.cursor = 'pointer';
            downloadBtn.style.padding = '5px';
            downloadBtn.style.marginRight = '5px';
            downloadBtn.title = '下載';
            downloadBtn.onclick = () => {
                const isJson = dict.name.toLowerCase().endsWith('.json');
                let contentStr = '';
                let mimeType = 'text/plain';

                if (isJson) {
                    contentStr = JSON.stringify(dict.content, null, 2);
                    mimeType = 'application/json';
                } else {
                    contentStr = dict.content.map(entry => entry.join('\t')).join('\n');
                }

                const blob = new Blob([contentStr], { type: mimeType });
                downloadFile(blob, dict.name, log);
            };

            const delBtn = document.createElement('div');
            delBtn.className = 'menu_button fa-solid fa-trash';
            delBtn.style.cursor = 'pointer';
            delBtn.style.padding = '5px';
            delBtn.style.color = 'var(--smart-theme-color)';
            delBtn.title = '刪除';
            delBtn.onclick = () => {
                if (confirm(`確定要刪除字典 "${dict.name}" 嗎?`)) {
                    dicts.splice(index, 1);
                    saveDicts();
                    log(`INFO: 已刪除字典 ${dict.name}`);
                }
            };

            row.appendChild(checkbox);
            row.appendChild(nameLabel);
            row.appendChild(editBtn); // Add edit btn
            row.appendChild(downloadBtn);
            row.appendChild(delBtn);
            dictListContainer.appendChild(row);
        });
    }

    // Editor Functions
    function openEditor(dict) {
        if (dict && !dict.id) {
            dict.id = Date.now() + Math.random();
        }
        currentEditingDictId = dict ? dict.id : null;
        editorNameInput.value = dict ? dict.name : '';
        editorEntriesContainer.innerHTML = '';
        
        const content = dict ? dict.content : [];
        if (content.length === 0 && !dict) {
            addEditorEntryRow();
        } else {
            content.forEach(entry => addEditorEntryRow(entry[0], entry[1]));
        }
        editorModal.style.display = 'flex';
    }

    function addEditorEntryRow(origin = '', replacement = '') {
        const row = document.createElement('div');
        row.className = 'cstt-dict-entry-row';
        
        const inputOrigin = document.createElement('input');
        inputOrigin.type = 'text';
        inputOrigin.className = 'text_pole';
        inputOrigin.placeholder = '原文';
        inputOrigin.value = origin;

        const inputReplace = document.createElement('input');
        inputReplace.type = 'text';
        inputReplace.className = 'text_pole';
        inputReplace.placeholder = '替換';
        inputReplace.value = replacement;

        const delBtn = document.createElement('div');
        delBtn.className = 'menu_button fa-solid fa-trash';
        delBtn.style.padding = '5px';
        delBtn.style.color = 'var(--smart-theme-color)';
        delBtn.style.cursor = 'pointer';
        delBtn.onclick = () => row.remove();

        row.appendChild(inputOrigin);
        row.appendChild(inputReplace);
        row.appendChild(delBtn);
        editorEntriesContainer.appendChild(row);
    }

    function saveEditor() {
        const name = editorNameInput.value.trim();
        if (!name) {
            alert('請輸入字典名稱');
            return;
        }

        const entries = [];
        const rows = editorEntriesContainer.querySelectorAll('.cstt-dict-entry-row');
        rows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            const origin = inputs[0].value;
            const replace = inputs[1].value;
            if (origin) {
                entries.push([origin, replace]);
            }
        });

        const newDict = {
            id: currentEditingDictId || Date.now() + Math.random(),
            name: name,
            content: entries,
            enabled: true
        };

        addOrUpdateDictionary(newDict);
        saveDicts();
        closeEditor();
    }

    function closeEditor() {
        editorModal.style.display = 'none';
    }

    // Bind Editor Events
    if (createDictBtn) createDictBtn.onclick = () => openEditor(null);
    if (editorAddEntryBtn) editorAddEntryBtn.onclick = () => addEditorEntryRow();
    if (editorSaveBtn) editorSaveBtn.onclick = saveEditor;
    if (editorCancelBtn) editorCancelBtn.onclick = closeEditor;

    async function readAndParseDict(file) {
        const text = await file.text();
        let parsed;
        if (file.name.toLowerCase().endsWith('.json')) {
            try {
                const json = JSON.parse(text);
                if (Array.isArray(json)) {
                    parsed = json;
                } else if (typeof json === 'object' && json !== null) {
                    parsed = Object.entries(json);
                }
            } catch (e) {
                console.warn('JSON parse failed', e);
            }
        }
        if (!parsed) {
            parsed = parseDictText(text);
        }
        return parsed;
    }

    function parseDictText(text) {
        const lines = text.split(/\r?\n/);
        const dict = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                dict.push([parts[0], parts[1]]);
            }
        }
        return dict;
    }

    // Helper to add or update dictionary
    function addOrUpdateDictionary(newDict) {
        const dicts = getSettings().custom_dictionaries;
        let existingIndex = -1;
        if (newDict.id) {
            existingIndex = dicts.findIndex(d => d.id === newDict.id);
        }
        if (existingIndex === -1) {
            existingIndex = dicts.findIndex(d => d.name === newDict.name);
        }
        
        if (existingIndex !== -1) {
            if (!newDict.id && dicts[existingIndex].id) {
                newDict.id = dicts[existingIndex].id;
            }
            dicts[existingIndex] = newDict;
            log(`INFO: 已更新字典 ${newDict.name}`);
            if (typeof toastr !== 'undefined') {
                toastr.success(`已更新並覆蓋字典: ${newDict.name}`, 'CSTT 字典管理');
            }
        } else {
            if (!newDict.id) newDict.id = Date.now() + Math.random();
            dicts.push(newDict);
            log(`INFO: 已加入字典 ${newDict.name}`);
            if (typeof toastr !== 'undefined') {
                toastr.success(`已新增字典: ${newDict.name}`, 'CSTT 字典管理');
            }
        }
    }

    // Event Listeners
    if (addDictBtn && addDictInput) {
        addDictBtn.addEventListener('click', () => addDictInput.click());
        addDictInput.addEventListener('change', async () => {
            const files = Array.from(addDictInput.files);
            if (files.length === 0) return;

            let addedCount = 0;
            for (const file of files) {
                try {
                    const content = await readAndParseDict(file);
                    if (content && content.length > 0) {
                        addOrUpdateDictionary({
                            id: Date.now() + Math.random(),
                            name: file.name,
                            content: content,
                            enabled: true
                        });
                        addedCount++;
                    } else {
                        log(`WARN: 字典 ${file.name} 內容為空或無法解析`);
                    }
                } catch (e) {
                    log(`ERROR: 讀取 ${file.name} 失敗: ${e.message}`);
                }
            }
            
            if (addedCount > 0) {
                saveDicts();
                addDictInput.value = ''; // Reset
            }
        });
    }

    if (clearDictsBtn) {
        clearDictsBtn.addEventListener('click', () => {
            if (confirm('確定要清空所有已儲存的字典嗎?')) {
                getSettings().custom_dictionaries.length = 0;
                saveDicts();
                log('INFO: 已清空所有外掛字典');
            }
        });
    }

    // Initial Render
    applyTranslations();
    renderDictList();

    // --- Dictionary Tools Logic ---
    let toolDictFile = null;
    if (toolDictSelectBtn && toolDictInput) {
        toolDictSelectBtn.addEventListener('click', () => toolDictInput.click());
        toolDictInput.addEventListener('change', () => {
            if (toolDictInput.files.length > 0) {
                toolDictFile = toolDictInput.files[0];
                toolDictStatus.textContent = `已選擇: ${toolDictFile.name}`;
            } else {
                toolDictFile = null;
                toolDictStatus.textContent = '';
            }
        });
    }

    if (toolConvertJsonBtn) {
        toolConvertJsonBtn.addEventListener('click', async () => {
            if (!toolDictFile) { alert('請先選擇字典檔案'); return; }
            try {
                const parsed = await readAndParseDict(toolDictFile);
                if (!parsed || parsed.length === 0) {
                    throw new Error('解析失敗或內容為空');
                }

                const newName = toolDictFile.name.replace(/\.txt$/i, '') + '.json';

                if (toolAutoMountCheckbox && toolAutoMountCheckbox.checked) {
                    // Auto-mount only
                    addOrUpdateDictionary({
                        id: Date.now() + Math.random(),
                        name: newName,
                        content: parsed,
                        enabled: true
                    });
                    saveDicts();
                    log(`INFO: 轉換後的字典 ${newName} 已自動掛載到外掛字典列表 (未下載)。`);
                } else {
                    // Download only
                    const jsonStr = JSON.stringify(parsed, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    downloadFile(blob, newName, log);
                    log('INFO: 字典已轉換為 JSON 並下載。');
                }
            } catch (e) {
                log(`ERROR: 字典轉換失敗: ${e.message}`);
            }
        });
    }


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
                const converter = getConverter(mode);
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

                if (!blob) {
                    log(`跳過未產生輸出的檔案: ${file.name}`);
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
        const activeSettings = getSettings();
        const converted = convertJsonValue(data, converter, {
            scope: activeSettings.jsonConversionScope,
            selectedFields: parseSelectedFields(activeSettings.jsonSelectedFields),
        });
        const newJson = JSON.stringify(converted, null, 2);
        return new Blob([newJson], { type: 'application/json' });
    }

    function parseSelectedFields(fieldsText) {
        return String(fieldsText || '')
            .split(',')
            .map(field => field.trim())
            .filter(Boolean);
    }

    function shouldConvertJsonField(path, key, options = {}) {
        if (!options || options.scope !== 'selected') return true;
        const selected = Array.isArray(options.selectedFields) ? options.selectedFields : [];
        if (selected.length === 0) return false;
        return selected.some(field => field === key || field === path || path.endsWith(`.${field}`));
    }

    function convertJsonValue(value, converter, options = {}, path = '') {
        if (typeof value === 'string') {
            const key = path.split('.').pop() || path;
            return shouldConvertJsonField(path, key, options) ? converter(value) : value;
        }
        if (Array.isArray(value)) return value.map((v, index) => convertJsonValue(v, converter, options, path ? `${path}.${index}` : String(index)));
        if (typeof value === 'object' && value !== null) {
            const out = {};
            for (const k in value) {
                const childPath = path ? `${path}.${k}` : k;
                out[k] = convertJsonValue(value[k], converter, options, childPath);
            }
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
                            if (typeof toastr !== 'undefined') toastr.error(`匯入預設檔案 ${file.name} 失敗: ${err.message}`, 'CSTT');
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
                    if (typeof toastr !== 'undefined') toastr.success(`已成功匯入 ${files.length} 個預設檔案`, 'CSTT');
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
                                if (typeof toastr !== 'undefined') toastr.error(`檔案 ${file.name} 解析失敗`, 'CSTT');
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
                            if (typeof toastr !== 'undefined') toastr.success(`已成功匯入 ${newRegexes.length} 條正規表達式`, 'CSTT');
                        } else {
                            log('⚠️ 未找到可匯入的正規表達式資料。');
                            if (typeof toastr !== 'undefined') toastr.warning('未找到可匯入的正規表達式資料', 'CSTT');
                        }
                    } catch (e) {
                        console.error("Regex API import failed", e);
                        log(`❌ API 匯入失敗: ${e.message}`);
                        if (typeof toastr !== 'undefined') toastr.error(`API 匯入失敗: ${e.message}`, 'CSTT');
                    }
                } else {
                    log('❌ 錯誤: 找不到酒館助手 (JS-Slash-Runner) 正規表達式 API。');
                    if (typeof toastr !== 'undefined') toastr.error('找不到酒館助手正規表達式 API', 'CSTT');
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
            if (typeof toastr !== 'undefined') toastr.error(`匯入失敗: ${e.message}`, 'CSTT');
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
            const crcStart = chunkEnd;
            const crcEnd = crcStart + 4;
            if (chunkEnd > data.length || crcEnd > data.length) {
                log(`⚠️ ${file.name}: 偵測到不完整的 PNG 區塊，保留剩餘原始資料。`);
                outputParts.push(data.slice(pos));
                break;
            }
            const chunkData = data.slice(chunkStart, chunkEnd);
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

            // Attempt Base64 decode -> JSON, then raw JSON.
            let jsonObj = null;
            let wasBase64 = false;
            try {
                const decoded = b64DecodeUnicode(rawText);
                jsonObj = JSON.parse(decoded);
                wasBase64 = true;
                log && log(`[DEBUG] Detected base64 JSON in chunk (keyword: ${keywordStr || '<empty>'})`);
            } catch (e) {
                try { jsonObj = JSON.parse(rawText); log && log(`[DEBUG] Detected raw JSON in chunk (keyword: ${keywordStr || '<empty>'})`); } catch (e2) { return chunkData; }
            }

            // Convert recursively
            const activeSettings = getSettings();
            const converted = convertJsonValue(jsonObj, converter, {
                scope: activeSettings.jsonConversionScope,
                selectedFields: parseSelectedFields(activeSettings.jsonSelectedFields),
            });
            const newJson = JSON.stringify(converted);

            // Re-encode in original-ish form
            if (chunkType === 'tEXt') {
                const encoded = te.encode(wasBase64 ? b64EncodeUnicode(newJson) : newJson);
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
