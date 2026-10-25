//@name 원문 번역문 병기 플러그인
//@display-name ✌️💬 병기 방식 선택 플러그인 v1.3.2
//@api 3.0
//@version 1.3.2
//@update-url https://raw.githubusercontent.com/hhja37984-AI/Translation-Pairing-Plugins/refs/heads/main/Plugins/Choosing_pairings.js

(() => {


  const BUILD_LABEL = '병기 방식 선택';
  const DEFAULT_START_PATTERN = '/^[ \\t]*#{1,6}[ \\t]+source[ \\t]*:?[ \\t]*$/im';
  const DEFAULT_GLOSSARY_WRAPPER_TOP =
    '# Translation Guidelines\n' +
    'Expression-specific guidelines for conveying nuances when translating from English to Korean:';
  const DEFAULT_GLOSSARY_WRAPPER_BOTTOM = '---';
  const GLOSSARY_STORAGE_KEY = 'bilingual_translation_glossary_v1';
  let memoryGlossaryState = createEmptyGlossaryState();
  let glossaryLoaded = false;
  let glossarySaveTimer = null;
  let glossarySaveChain = Promise.resolve();
  const expandedGlossaryIds = new Set();
  const RULE_STORAGE_KEY = 'bilingual_translation_rules_v1';
  const CONFIG_STORAGE_KEY = 'bilingual_translation_config_v1';
  const pendingSources = [];
  let pendingSourceGeneration = 0;

  function clearPendingSources() {
    const count = pendingSources.length;
    pendingSources.length = 0;
    pendingSourceGeneration += 1;
    return count;
  }
  const RETRY_GUARD_MARKER = '<!-- start -->';

  function findRetryGuard(messages) {
    if (!Array.isArray(messages)) return null;
    const system = messages.find(message =>
      String(message?.role ?? '').toLowerCase() === 'system'
    );
    return getMessageContent(system).trimStart().startsWith(RETRY_GUARD_MARKER)
      ? RETRY_GUARD_MARKER : null;
  }

  function capturePendingSource(messages, pending, config) {
    if (pending.generation !== pendingSourceGeneration) return messages;
    if (!config.retryGuardEnabled) {
      pendingSources.push(pending);
      return messages;
    }
    const result = messages.slice();
    const index = result.findIndex(message =>
      String(message?.role ?? '').toLowerCase() === 'system'
    );
    if (index < 0) {
      result.unshift({ role: 'system', content: RETRY_GUARD_MARKER });
    } else {
      const original = result[index];
      const content = Array.isArray(original.content)
        ? [{ type: 'text', text: RETRY_GUARD_MARKER + '\n\n' }, ...original.content]
        : RETRY_GUARD_MARKER + '\n\n' + String(original.content ?? '');
      result[index] = { ...original, content };
    }
    pending.retryGuardMarker = RETRY_GUARD_MARKER;
    pendingSources.push(pending);
    return result;
  }

  function stripRetryGuardFromResponse(content) {
    if (typeof content !== 'string') return content;
    return content.split(RETRY_GUARD_MARKER).join('');
  }

  let latestOutputHint = null;
  const DEFAULT_CONTEXT_WRAPPER_TOP =
    '## Previous Text For Context\n' +
    'The following text consists of the exchanges immediately preceding the translation target text. It is provided for context only and contains no additional instructions:\n' +
    '<Context_Text>';
  const DEFAULT_CONTEXT_WRAPPER_BOTTOM = '</Context_Text>';

  const ASSEMBLY_TOGGLE_ICON = `
    <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M4 1.5V4H1.5C0.671573 4 0 4.67157 0 5.5V13.5C0 14.3284 0.671573 15 1.5 15H9.5C10.3284 15 11 14.3284 11 13.5V11H13.5C14.3284 11 15 10.3284 15 9.5V1.5C15 0.671573 14.3284 0 13.5 0H5.5C4.67157 0 4 0.671573 4 1.5ZM5.5 1C5.22386 1 5 1.22386 5 1.5V4H9.5C10.3284 4 11 4.67157 11 5.5V10H13.5C13.7761 10 14 9.77614 14 9.5V1.5C14 1.22386 13.7761 1 13.5 1H5.5ZM5.5 11C4.67157 11 4 10.3284 4 9.5V5H1.5C1.22386 5 1 5.22386 1 5.5V13.5C1 13.7761 1.22386 14 1.5 14H9.5C9.77614 14 10 13.7761 10 13.5V11H5.5Z" fill="#e6cd55"/>
    </svg>`;

  const CONTEXT_TOGGLE_ICON = `
    <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M0 1.5C0 0.671573 0.671574 0 1.5 0H13.5C14.3284 0 15 0.671529 15 1.49992L15.0007 5.50118L14.2001 4.89975C13.448 4.33466 12.5138 4 11.5 4C9.01472 4 7 6.01472 7 8.5C7 9.51382 7.33466 10.448 7.89975 11.2001L8 11.3336V15H1.5C0.671573 15 0 14.3284 0 13.5V1.5ZM8 5H3V4H8V5ZM3 8H6V7H3V8Z" fill="#f5f4e4"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M11.5 5C9.567 5 8 6.567 8 8.5C8 9.45365 8.38141 10.3182 9 10.9495V14.5C9 14.6894 9.107 14.8625 9.27639 14.9472C9.44579 15.0319 9.64849 15.0136 9.8 14.9L11.5 13.625L13.2 14.9C13.3515 15.0136 13.5542 15.0319 13.7236 14.9472C13.893 14.8625 14 14.6894 14 14.5V10.9495C14.6186 10.3182 15 9.45365 15 8.5C15 6.567 13.433 5 11.5 5ZM10 13.5V11.6632C10.4546 11.8792 10.9632 12 11.5 12C12.0368 12 12.5454 11.8792 13 11.6632V13.5L11.8 12.6C11.6222 12.4667 11.3778 12.4667 11.2 12.6L10 13.5Z" fill="#f5f4e4"/>
    </svg>`;

  let memoryRuleState = createEmptyRuleState();
  let memoryConfigState = createDefaultConfigState();
  let settingsDraft = null;
  let settingsSavedSnapshot = '';
  let configAutoSaveChain = Promise.resolve();

  const AUTO_SAVE_CONFIG_KEYS = new Set([
    'output_mode',
    'plugin_enabled',
    'enabled',
    'translation_context_enabled',
  ]);

  function settingsSnapshot(draft) {
    if (!draft) return '';
    const config = { ...draft.config };
    for (const key of AUTO_SAVE_CONFIG_KEYS) delete config[key];
    return JSON.stringify({
      config,
      wrapperStart: draft.wrapperStart,
      wrapperEnd: draft.wrapperEnd,
    });
  }

  function resetSettingsDraft() {
    settingsDraft = {
      config: normalizeConfigState(memoryConfigState),
      wrapperStart: memoryGlossaryState.wrapperStart,
      wrapperEnd: memoryGlossaryState.wrapperEnd,
    };
    settingsSavedSnapshot = settingsSnapshot(settingsDraft);
  }

  function syncUnsavedNotice() {
    const notice = document.getElementById('bt-unsaved-notice');
    if (notice) notice.hidden = !settingsDraft || settingsSnapshot(settingsDraft) === settingsSavedSnapshot;
  }

  let ruleSaveTimer = null;
  let ruleSaveChain = Promise.resolve();
  const expandedRuleIds = {
    exclude: new Set(),
    translation: new Set(),
    context: new Set(),
  };

  const BUILTIN_CONTEXT_RULES = [
    {
      id: '__builtin_context_trim_thoughts__',
      name: '__builtin_context_trim_thoughts__',
      input: '<Thoughts\\b[^>]*>[\\s\\S]*?<\\/Thoughts\\s*>',
      output: '',
      global: true,
      ignoreCase: true,
    },
  ];

  function createDefaultConfigState() {
    return {
      plugin_enabled: '1',
      enabled: '1',
      output_mode: 'bilingual',
      dialogue_source_position: 'outside',
      uppercase_block_pairing: '1',
      source_message_role: 'any',
      source_start_pattern: DEFAULT_START_PATTERN,
      source_end_pattern: 'NONE',
      translation_context_enabled: '0',
      translation_context_messages: '4',
      translation_context_max_chars: '12000',
      translation_context_wrapper_top: DEFAULT_CONTEXT_WRAPPER_TOP,
      translation_context_wrapper_bottom: DEFAULT_CONTEXT_WRAPPER_BOTTOM,
      translation_context_user_label: "[User]",
      translation_context_character_label: "[Assistant]",
      keep_reasoning_blocks: '0',
      retry_guard_enabled: '0',
      use_source_span: '1',
      source_color: '#b6997c',
      source_extra_style: '',
      source_class: '',
      source_translation_separator: '\\n',
      pair_separator: '\\n\\n',
      debug: '0',
    };
  }

  function normalizeConfigState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const defaults = createDefaultConfigState();
    const normalized = {};

    for (const key of Object.keys(defaults)) {
      const current = source[key];
      normalized[key] =
        current === undefined || current === null
          ? defaults[key]
          : String(current);
    }

    return normalized;
  }

  function createEmptyRuleState() {
    return {
      version: 1,
      translationRules: [],
      excludeRules: [],
      contextRules: [],
    };
  }

  function normalizeRuleState(value) {
    const source = value && typeof value === 'object' ? value : {};

    const translationRules = Array.isArray(source.translationRules)
      ? source.translationRules
          .filter((rule) => rule && typeof rule === 'object')
          .map((rule) => ({
            id: String(rule.id || makeRuleId()),
            name: String(rule.name ?? ''),
            input: String(rule.input ?? ''),
            output: String(rule.output ?? ''),
            global: rule.global !== false,
            ignoreCase: rule.ignoreCase === true,
          }))
      : [];

    const excludeRules = Array.isArray(source.excludeRules)
      ? source.excludeRules
          .filter((rule) => rule && typeof rule === 'object')
          .map((rule) => ({
            id: String(rule.id || makeRuleId()),
            name: String(rule.name ?? ''),
            input: String(rule.input ?? ''),
            ignoreCase: rule.ignoreCase === true,
          }))
      : [];

    const contextRules = Array.isArray(source.contextRules)
      ? source.contextRules
          .filter((rule) => rule && typeof rule === 'object')
          .map((rule) => ({
            id: String(rule.id || makeRuleId()),
            name: String(rule.name ?? ''),
            input: String(rule.input ?? ''),
            output: String(rule.output ?? ''),
            global: rule.global !== false,
            ignoreCase: rule.ignoreCase === true,
          }))
      : [];

    return {
      ...source,
      version: 1,
      translationRules,
      excludeRules,
      contextRules,
    };
  }

  function makeRuleId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function createEmptyGlossaryState() {
    return {
      version: 1,
      wrapperStart: DEFAULT_GLOSSARY_WRAPPER_TOP,
      wrapperEnd: DEFAULT_GLOSSARY_WRAPPER_BOTTOM,
      entries: [],
    };
  }

  function normalizeGlossaryState(value) {
    const seen = new Set();
    return {
      version: 1,
      wrapperStart: String(value?.wrapperStart ?? DEFAULT_GLOSSARY_WRAPPER_TOP),
      wrapperEnd: String(value?.wrapperEnd ?? DEFAULT_GLOSSARY_WRAPPER_BOTTOM),
      entries: (Array.isArray(value?.entries) ? value.entries : [])
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => {
          let id = String(entry.id || makeRuleId());
          if (seen.has(id)) id = makeRuleId();
          seen.add(id);
          return {
            id,
            name: String(entry.name ?? ''),
            enabled: entry.enabled !== false,
            input: String(entry.input ?? ''),
            ignoreCase: entry.ignoreCase === true,
            guide: String(entry.guide ?? ''),
          };
        }),
    };
  }

  function collectGlossaryGuidance(source, state, config) {
    const lines = [];
    const names = [];
    for (const entry of state.entries) {
      if (!entry.enabled || !entry.input || !entry.guide.trim()) continue;
      try {
        // 일치 표현만 수집하며 번역 원문은 변경하지 않는다.
        const regex = new RegExp(entry.input, entry.ignoreCase ? 'gi' : 'g');
        const expressions = [...new Set(Array.from(source.matchAll(regex), match => match[0]))];
        if (!expressions.length) continue;
        lines.push(`- ${expressions.map(text => JSON.stringify(text)).join(', ')}: ${entry.guide}`);
        names.push(entry.name);
      } catch (error) {
        warn(config, `glossary regex skipped (${entry.name}): ${error?.message ?? error}`);
      }
    }
    log(config, `glossary matched: ${lines.length}`, names);
    if (!lines.length) return '';
    return [
      state.wrapperStart ?? '',
      lines.join('\n\n'),
      decodeOptionalWrapper(
        state.wrapperEnd,
        DEFAULT_GLOSSARY_WRAPPER_BOTTOM
      ),
    ]
      .filter(part => part !== '').join('\n\n');
  }

  function appendGlossaryGuidance(messages, block) {
    if (!block) return messages;
    const result = messages.slice();
    const index = result.findIndex(
      message => String(message?.role ?? '').toLowerCase() === 'system'
    );
    if (index < 0) result.unshift({ role: 'system', content: block });
    else {
      const original = result[index];
      const content = Array.isArray(original.content)
        ? [...original.content, { type: 'text', text: '\n\n' + block }]
        : (typeof original.content === 'string' && original.content ? original.content + '\n\n' : '') + block;
      result[index] = { ...original, content };
    }
    return result;
  }

  async function loadGlossaryState() {
    if (glossaryLoaded) return normalizeGlossaryState(memoryGlossaryState);
    try {
      const raw = await Risuai.pluginStorage.getItem(GLOSSARY_STORAGE_KEY);
      if (!raw) {
        glossaryLoaded = true;
        return normalizeGlossaryState(memoryGlossaryState);
      }

      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      memoryGlossaryState = normalizeGlossaryState(parsed);
      glossaryLoaded = true;
      return normalizeGlossaryState(memoryGlossaryState);
    } catch (error) {
      console.warn(
        `[Versa] failed to load glossary: ${error?.message ?? error}`
      );
      return normalizeGlossaryState(memoryGlossaryState);
    }
  }

  async function saveGlossaryState(value) {
    const normalized = normalizeGlossaryState(value);

    try {
      await Risuai.pluginStorage.setItem(
        GLOSSARY_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch (error) {
      console.warn(
        `[Versa] failed to save glossary: ${error?.message ?? error}`
      );
      throw error;
    }

    return normalizeGlossaryState(normalized);
  }

  function persistGlossaryState(value, onError) {
    const snapshot = normalizeGlossaryState(value);
    const operation = glossarySaveChain.then(() => saveGlossaryState(snapshot));
    glossarySaveChain = operation.catch(() => {});
    if (typeof onError === 'function') return operation.catch(onError);
    return operation;
  }

  function queueGlossaryStateSave(value, onError) {
    if (glossarySaveTimer) clearTimeout(glossarySaveTimer);
    glossarySaveTimer = setTimeout(() => {
      glossarySaveTimer = null;
      persistGlossaryState(value, onError).catch(() => {});
    }, 180);
  }

  async function persistGlossaryStateNow(value, onError) {
    if (glossarySaveTimer) {
      clearTimeout(glossarySaveTimer);
      glossarySaveTimer = null;
    }
    await persistGlossaryState(value, onError);
  }

  async function loadRuleState() {
    try {
      const raw = await Risuai.pluginStorage.getItem(RULE_STORAGE_KEY);
      if (!raw) return normalizeRuleState(memoryRuleState);

      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      memoryRuleState = normalizeRuleState(parsed);
      return normalizeRuleState(memoryRuleState);
    } catch (error) {
      console.warn(
        `[Versa] failed to load regex rules: ${error?.message ?? error}`
      );
      return normalizeRuleState(memoryRuleState);
    }
  }

  async function saveRuleState(value) {
    const normalized = normalizeRuleState(value);
    memoryRuleState = normalized;

    try {
      await Risuai.pluginStorage.setItem(
        RULE_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch (error) {
      console.warn(
        `[Versa] failed to save regex rules: ${error?.message ?? error}`
      );
      throw error;
    }

    return normalizeRuleState(normalized);
  }

  function persistRuleState(value, onError) {
    const snapshot = normalizeRuleState(value);
    ruleSaveChain = ruleSaveChain
      .then(() => saveRuleState(snapshot))
      .catch((error) => {
        if (typeof onError === 'function') onError(error);
      });
    return ruleSaveChain;
  }

  function queueRuleStateSave(value, onError) {
    if (ruleSaveTimer) clearTimeout(ruleSaveTimer);
    ruleSaveTimer = setTimeout(() => {
      ruleSaveTimer = null;
      persistRuleState(value, onError);
    }, 180);
  }

  async function persistRuleStateNow(value, onError) {
    if (ruleSaveTimer) {
      clearTimeout(ruleSaveTimer);
      ruleSaveTimer = null;
    }
    await persistRuleState(value, onError);
  }

  async function loadLegacyConfigState() {
    const defaults = createDefaultConfigState();
    const imported = { ...defaults };

    if (typeof Risuai.getArgument !== 'function') return imported;

    for (const key of Object.keys(defaults)) {
      try {
        const value = await Risuai.getArgument(key);
        if (
          value !== undefined &&
          value !== null &&
          String(value).length > 0
        ) {
          imported[key] = String(value);
        }
      } catch {
        // ARG가 없는 새 설치에서는 기본값을 사용한다.
      }
    }

    return normalizeConfigState(imported);
  }

  async function loadConfigState() {
    try {
      const raw = await Risuai.pluginStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        memoryConfigState = normalizeConfigState(parsed);
        return normalizeConfigState(memoryConfigState);
      }

      memoryConfigState = await loadLegacyConfigState();
      await Risuai.pluginStorage.setItem(
        CONFIG_STORAGE_KEY,
        JSON.stringify(memoryConfigState)
      );
      return normalizeConfigState(memoryConfigState);
    } catch (error) {
      console.warn(
        `[Versa] failed to load settings: ${error?.message ?? error}`
      );
      return normalizeConfigState(memoryConfigState);
    }
  }

  async function saveConfigState(value) {
    const normalized = normalizeConfigState(value);
    memoryConfigState = normalized;

    try {
      await Risuai.pluginStorage.setItem(
        CONFIG_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch (error) {
      console.warn(
        `[Versa] failed to save settings: ${error?.message ?? error}`
      );
      throw error;
    }

    return normalizeConfigState(normalized);
  }

  function decodeEscapes(value) {
    return String(value)
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
  }

  function decodeConfigString(value, { allowNone = false } = {}) {
    const text = String(value ?? '');
    if (allowNone && text.trim().toUpperCase() === 'NONE') return '';
    return decodeEscapes(text);
  }

  function decodeOptionalWrapper(value, fallback = '') {
    const text = String(value ?? '');
    if (text.length === 0) return fallback;
    return text.trim().toUpperCase() === 'NONE' ? '' : text;
  }

  /* ---------------- Pattern helpers ---------------- */

  function parsePatternToken(token, { noneAllowed = false } = {}) {
    const text = String(token ?? '').trim();

    if (noneAllowed && text.toUpperCase() === 'NONE') {
      return null;
    }

    if (!text) return null;

    if (text.startsWith('/')) {
      const lastSlash = text.lastIndexOf('/');
      if (lastSlash > 0) {
        const body = text.slice(1, lastSlash);
        const flags = text.slice(lastSlash + 1);

        if (/^[dgimsuvy]*$/.test(flags)) {
          try {
            return new RegExp(body, flags);
          } catch (error) {
            console.warn(
              `[Versa] invalid regex "${text}"; treating as literal string.`
            );
          }
        }
      }
    }

    return text;
  }

  function cloneRegexWithGlobal(regex) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    return new RegExp(regex.source, flags);
  }

  // 프롬프트 설명에 포함된 마커를 피하기 위해 마지막 시작 마커를 사용한다.
  function findLastPattern(text, pattern) {
    if (typeof pattern === 'string') {
      // 문자열 마커는 앞뒤 공백을 제외한 독립된 한 줄과만 일치한다.
      const lines = text.split(/\n/);
      let offset = 0;
      let last = null;

      for (const line of lines) {
        const lineLengthWithBreak = line.length + 1;

        if (line.trim() === pattern.trim()) {
          const leadingWhitespace = line.length - line.trimStart().length;
          const markerStart = offset + leadingWhitespace;
          const markerEnd = offset + line.length;

          last = {
            index: markerStart,
            end: markerEnd,
          };
        }

        offset += lineLengthWithBreak;
      }

      return last;
    }

    if (pattern instanceof RegExp) {
      const regex = cloneRegexWithGlobal(pattern);
      let match;
      let last = null;

      while ((match = regex.exec(text)) !== null) {
        last = {
          index: match.index,
          end: match.index + match[0].length,
        };

        // 길이가 0인 정규식 일치에서 무한 반복을 방지한다.
        if (match[0].length === 0) regex.lastIndex++;
      }

      return last;
    }

    return null;
  }

  // 원문 시작점 이후 첫 종료 마커를 사용한다.
  function findFirstPatternAfter(text, pattern, fromIndex) {
    if (typeof pattern === 'string') {
      // 문자열 마커는 앞뒤 공백을 제외한 독립된 한 줄과만 일치한다.
      const lines = text.split(/\n/);
      let offset = 0;

      for (const line of lines) {
        const lineStart = offset;
        const lineEnd = offset + line.length;

        if (lineEnd >= fromIndex && line.trim() === pattern.trim()) {
          const leadingWhitespace = line.length - line.trimStart().length;
          const markerStart = lineStart + leadingWhitespace;

          if (markerStart >= fromIndex) {
            return {
              index: markerStart,
              end: lineEnd,
            };
          }
        }

        offset += line.length + 1;
      }

      return null;
    }

    if (pattern instanceof RegExp) {
      const regex = cloneRegexWithGlobal(pattern);
      regex.lastIndex = fromIndex;
      const match = regex.exec(text);

      if (!match) return null;

      return {
        index: match.index,
        end: match.index + match[0].length,
      };
    }

    return null;
  }

  async function getConfig() {
    const stored = await loadConfigState();
    const getString = (name, fallback = '') => {
      const value = stored[name];
      if (value === undefined || value === null || String(value).length === 0) {
        return fallback;
      }
      return String(value);
    };
    const getInt = (name, fallback = 0) => {
      const value = stored[name];
      if (value === undefined || value === null || String(value).trim() === '') {
        return fallback;
      }
      const parsed = Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const pluginEnabled = getInt('plugin_enabled', 1) !== 0;
    const enabled = getInt('enabled', 1) !== 0;
    const requestedOutputMode = getString(
      'output_mode',
      'bilingual'
    ).trim().toLowerCase();
    const outputMode = requestedOutputMode === 'dialogue'
      ? 'dialogue'
      : 'bilingual';
    const dialogueSourcePosition = getString(
      'dialogue_source_position',
      'outside'
    ).trim().toLowerCase() === 'inside' ? 'inside' : 'outside';
    const uppercaseBlockPairing = getInt('uppercase_block_pairing', 1) !== 0;

    const sourceMessageRole = getString('source_message_role', 'any')
      .trim()
      .toLowerCase();

    const startRaw = getString('source_start_pattern', DEFAULT_START_PATTERN);
    const endRaw = getString('source_end_pattern', 'NONE');

    const sourceStartPattern = parsePatternToken(startRaw, {
      noneAllowed: true,
    });
    const sourceEndPattern = parsePatternToken(endRaw, {
      noneAllowed: true,
    });

    const useSourceSpan = !(outputMode === 'dialogue' && dialogueSourcePosition === 'inside') && getInt('use_source_span', 1) !== 0;

    const sourceColor = decodeConfigString(
      getString('source_color', '#b6997c'),
      { allowNone: true }
    );

    const sourceExtraStyle = decodeConfigString(
      getString('source_extra_style', '')
    );

    const sourceClass = getString('source_class', '');

    const sourceTranslationSeparator = decodeConfigString(
      getString('source_translation_separator', '\\n'),
      { allowNone: true }
    );

    const pairSeparator = decodeConfigString(
      getString('pair_separator', '\\n\\n'),
      { allowNone: true }
    );

    const excludeSourcePatterns = [];

    const translationContextEnabled =
      getInt('translation_context_enabled', 0) !== 0;
    const translationContextMessages = Math.max(
      0,
      Math.min(50, getInt('translation_context_messages', 4))
    );
    const translationContextMaxChars = Math.max(
      0,
      Math.min(200000, getInt('translation_context_max_chars', 12000))
    );
    const translationContextWrapperTop = getString('translation_context_wrapper_top', DEFAULT_CONTEXT_WRAPPER_TOP);
    const translationContextWrapperBottom = decodeOptionalWrapper(
      getString(
        'translation_context_wrapper_bottom',
        DEFAULT_CONTEXT_WRAPPER_BOTTOM
      ),
      DEFAULT_CONTEXT_WRAPPER_BOTTOM
    );
    const translationContextUserLabel = decodeConfigString(
      getString('translation_context_user_label', "[User]"),
      { allowNone: true }
    );
    const translationContextCharacterLabel = decodeConfigString(
      getString('translation_context_character_label', "[Assistant]"),
      { allowNone: true }
    );
    const keepReasoningBlocks = getInt('keep_reasoning_blocks', 0) !== 0;

    const translationStripPatterns = [];

    const ruleState = await loadRuleState();

    const debug = getInt('debug', 0) !== 0;
    const retryGuardEnabled = getInt('retry_guard_enabled', 0) !== 0;

    return {
      pluginEnabled,
      enabled,
      outputMode,
      dialogueSourcePosition,
      uppercaseBlockPairing,
      sourceMessageRole,
      sourceStartPattern,
      sourceEndPattern,
      useSourceSpan,
      sourceColor,
      sourceExtraStyle,
      sourceClass,
      sourceTranslationSeparator,
      pairSeparator,
      excludeSourcePatterns,
      translationContextEnabled,
      translationContextMessages,
      translationContextMaxChars,
      translationContextWrapperTop,
      translationContextWrapperBottom,
      translationContextUserLabel,
      translationContextCharacterLabel,
      keepReasoningBlocks,
      retryGuardEnabled,
      translationStripPatterns,
      translationRules: ruleState.translationRules,
      uiExcludeRules: ruleState.excludeRules,
      contextRules: ruleState.contextRules,
      debug,
    };
  }

  function log(config, ...args) {
    if (config?.debug) console.log('[Versa]', ...args);
  }

  function warn(config, ...args) {
    if (config?.debug) console.warn('[Versa]', ...args);
  }

  /* ---------------- Regex rule manager UI ---------------- */

  function getRuleLabel(rule) {
    const name = String(rule?.name ?? '').trim();
    return name || 'Unnamed Script';
  }

  function compileUiRegex(rule, type) {
    const input = String(rule?.input ?? '');
    if (!input) throw new Error('IN을 입력해주세요.');

    let flags = '';
    if (
      (type === 'translation' || type === 'context') &&
      rule.global !== false
    ) flags += 'g';
    if (rule.ignoreCase === true) flags += 'i';
    return new RegExp(input, flags);
  }

  function applyTranslationRules(text, rules, config) {
    let result = String(text ?? '');

    for (const rule of rules ?? []) {
      if (!String(rule?.input ?? '')) continue;

      try {
        result = result.replace(
          compileUiRegex(rule, 'translation'),
          String(rule.output ?? '')
        );
      } catch (error) {
        warn(
          config,
          `invalid translation regex "${getRuleLabel(rule)}": ${error?.message ?? error}`
        );
      }
    }

    return result;
  }

  function applyContextRules(text, rules, config) {
    let result = String(text ?? '');

    for (const rule of rules ?? []) {
      if (!String(rule?.input ?? '')) continue;

      try {
        result = result.replace(
          compileUiRegex(rule, 'context'),
          String(rule.output ?? '')
        );
      } catch (error) {
        warn(
          config,
          `invalid context regex "${getRuleLabel(rule)}": ${error?.message ?? error}`
        );
      }
    }

    return result;
  }

  function matchesUiExcludeRule(text, rule, config) {
    if (!String(rule?.input ?? '')) return false;

    try {
      const regex = compileUiRegex(rule, 'exclude');
      regex.lastIndex = 0;
      return regex.test(text);
    } catch (error) {
      warn(
        config,
        `invalid source-exclude regex "${getRuleLabel(rule)}": ${error?.message ?? error}`
      );
      return false;
    }
  }

  function setDocumentTheme(theme) {
    const scheme = theme?.scheme ?? {};
    const root = document.documentElement;
    const values = {
      '--bt-bg': scheme.bgcolor || '#181914',
      '--bt-panel': scheme.darkbg || '#1f201b',
      '--bt-button': scheme.darkbutton || '#292a24',
      '--bt-selected': scheme.selected || '#6f6657',
      '--bt-border': scheme.borderc || scheme.darkborderc || '#44463d',
      '--bt-text': scheme.textcolor || '#f4f1e8',
      '--bt-muted': scheme.textcolor2 || '#aaa79d',
    };

    for (const [name, value] of Object.entries(values)) {
      root.style.setProperty(name, String(value));
    }
  }

  function installRuleManagerShell() {
    document.body.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 100%; min-height: 100%; background: transparent; color: var(--bt-text); }
        body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 16px; }
        button, input, textarea { font: inherit; color: inherit; }
        button { -webkit-tap-highlight-color: transparent; }
        .bt-overlay { width: 100%; min-height: 100vh; padding: 18px; background: rgba(0, 0, 0, 0.2); display: flex; align-items: center; justify-content: center; }
        .bt-wrap { --bt-sticky-offset: 0px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(calc(100% - 36px), 720px); max-height: calc(100vh - 36px); overflow-y: auto; padding: 20px 18px 28px; background: var(--bt-bg); border: 1px solid var(--bt-border); border-radius: 18px; box-shadow: 0 20px 54px rgba(0, 0, 0, 0.42); }
        .bt-wrap.bt-wrap-regex { max-height: min(70vh, calc(100vh - 36px)); }
        .bt-wrap.bt-wrap-settings { height: calc(100vh - 36px); overflow: hidden; padding-bottom: 0; display: flex; flex-direction: column; }
        .bt-fixed-top { position: sticky; top: -20px; z-index: 40; margin: -20px -18px 0; padding: 20px 18px 0; background: var(--bt-bg); }
        .bt-wrap-settings .bt-fixed-top { position: relative; top: auto; flex: 0 0 auto; }
        .bt-settings-scroll { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding-top: 2px; }
        .bt-head { display: grid; grid-template-columns: 42px 1fr 42px; align-items: center; gap: 6px; margin-bottom: 18px; }
        .bt-title { padding-right: 10px; margin: 0; font-size: 1.5rem; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bt-description.bt-unsaved-notice { grid-column: 1 / -1; text-align: right; margin: 0; color: #d66f6f; }
        .bt-unsaved-notice[hidden] { display: none; }
        .bt-icon { width: 42px; height: 42px; border: 0; background: transparent; font-size: 2rem; line-height: 1; cursor: pointer; border-radius: 10px; }
        .bt-icon:active, .bt-tab:active, .bt-add:active, .bt-save:active { background: color-mix(in srgb, var(--bt-text) 10%, transparent); }
        .bt-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--bt-border); margin-bottom: 6px; background: var(--bt-bg); }
        .bt-tab-cell { position: relative; display: flex; align-items: stretch; justify-content: center; border-bottom: 2px solid transparent; }
        .bt-tab-cell[data-selected="true"] { border-bottom-color: var(--bt-selected); }
        .bt-tab { min-width: 0; border: 0; padding: 12px 4px 10px 8px; background: transparent; color: var(--bt-muted); font-size: 1.1rem; cursor: pointer; }
        .bt-tab[aria-selected="true"] { color: var(--bt-text); border-bottom-color: var(--bt-selected); font-weight: 700; }
        .bt-help { flex: 0 0 auto; align-self: center; width: 18px; height: 18px; margin-right: 6px; padding: 0; border: 1px solid var(--bt-muted); border-radius: 50%; background: transparent; color: var(--bt-muted); font-size: 0.78rem; font-weight: 800; text-align: center; cursor: pointer; }
        .bt-help[aria-expanded="true"] { border-color: var(--bt-text); color: var(--bt-text); }
        .bt-tooltip { position: absolute; z-index: 5; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: min(340px, calc(100vw - 56px)); padding: 11px 12px; border: 1px solid var(--bt-border); border-radius: 10px; background: var(--bt-button); color: var(--bt-text); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32); font-size: 0.92rem; font-weight: 400; line-height: 1.5; text-align: left; white-space: normal; }
        .bt-tab-cell:last-child .bt-tooltip { right: 8px; left: auto; transform: none; }
        .bt-regex-section { position: relative; margin-top: 22px; }
        .bt-regex-section:first-child { margin-top: 0; }
        .bt-regex-heading { position: sticky; top: var(--bt-sticky-offset); z-index: 20; display: flex; align-items: center; gap: 8px; min-height: 44px; margin: 10px -2px 10px; padding: 10px 4px 9px; background: linear-gradient(var(--bt-bg) 84%, color-mix(in srgb, var(--bt-bg) 0%, transparent)); backdrop-filter: blur(5px); }
        .bt-regex-heading-title { margin: 0; font-size: 1.1rem; font-weight: 800; line-height: 1.3; }
        .bt-regex-heading .bt-help { margin-left: 0; margin-right: 0; }
        .bt-regex-heading .bt-tooltip { top: calc(100% - 2px); left: 0; transform: none; }
        .bt-list { border: 1px solid var(--bt-border); border-radius: 14px; overflow: hidden; background: var(--bt-panel); }
        .bt-rule { border-bottom: 1px solid var(--bt-border); }
        .bt-rule:last-child { border-bottom: 0; }
        .bt-row { display: grid; grid-template-columns: 1fr 50px; align-items: stretch; min-height: 58px; }
        .bt-open { min-width: 0; border: 0; background: transparent; font-size: 0.92rem; font-weight: 700; text-align: left; padding: 15px 18px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bt-open:hover { color: #10b981; }
        .bt-delete { border: 0; background: transparent; font-size: 1.8rem; cursor: pointer; color: var(--bt-muted); }
        .bt-inline-editor { padding: 20px 18px 4px; background: color-mix(in srgb, var(--bt-panel) 88%, var(--bt-bg)); }
        .bt-inline-editor .bt-area { min-height: 96px; }
        .bt-empty { padding: 30px 18px; color: var(--bt-muted); font-size: 1.1rem; text-align: center; }
        .bt-add { width: 100%; margin-top: 14px; border: 1px solid var(--bt-border); border-radius: 12px; padding: 12px; background: var(--bt-button); font-size: 1.1rem; cursor: pointer; }
        .bt-regex-section .bt-add { font-size: 0.92rem; }
        .bt-field { display: block; margin-bottom: 18px; }
        .bt-label { display: block; margin-bottom: 8px; font-size: 1.05rem; font-weight: 700; }
        .bt-label-with-icon { display: inline-flex; align-items: center; gap: 8px; }
        .bt-label-icon { display: inline-flex; width: 18px; height: 18px; flex: 0 0 18px; }
        .bt-label-icon svg { display: block; width: 100%; height: 100%; }
        .bt-input, .bt-area { width: 100%; border: 1px solid color-mix(in srgb, var(--bt-border) 50%, transparent); border-radius: 8px; background: var(--bt-panel); padding: 8px 14px; font-size: 1rem; outline: none; resize: vertical; }
        .bt-input { min-height: 48px; }
        .bt-area { min-height: 110px; line-height: 1.45; }
        .bt-wrapper-editor { width: 100%; min-width: 0; }
        .bt-wrapper-editor > .bt-area { display: block; margin: 0; }
        .bt-wrapper-editor > .bt-wrapper-top { border-radius: 8px 8px 0 0; min-height: 150px; }
        .bt-wrapper-slot { border-left: 1px solid color-mix(in srgb, var(--bt-border) 50%, transparent); border-right: 1px solid color-mix(in srgb, var(--bt-border) 50%, transparent); background: rgba(0, 0, 0, 0.10); color: var(--bt-muted); padding: 10px 14px; line-height: 1.45; overflow-wrap: anywhere; cursor: default; }
        .bt-wrapper-editor > .bt-wrapper-bottom { border-radius: 0 0 8px 8px; min-height: 64px; }
        .bt-context-template { min-height: 180px; }
        .bt-input:focus, .bt-area:focus { border-color: var(--bt-border); box-shadow: 0 0 0 1px var(--bt-border); }
        .bt-wrapper-editor:focus-within { border-radius: 8px; box-shadow: 0 0 0 1px var(--bt-border); }
        .bt-wrapper-editor > .bt-area:focus { box-shadow: none; }
        .bt-readonly-hint { color: var(--bt-muted); font-size: 0.86rem; line-height: 1.45; cursor: default; user-select: none; }
        .bt-mode-head { position: relative; z-index: 20; margin-bottom: 18px; }
        .bt-title-button { width: 100%; min-width: 0; border: 0; padding: 4px 2px; background: transparent; color: var(--bt-text); font-size: clamp(1.2rem, 4.6vw, 1.85rem); font-weight: 700; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
        .bt-mode-arrow { color: var(--bt-text); font-size: 10px; }
        .bt-mode-option { position: absolute; z-index: 1; top: calc(100% + 4px); right: 48px; left: 48px; display: block; width: auto; margin: 0; border: 1px solid var(--bt-border); border-radius: 10px; padding: 11px 2px; background: var(--bt-bg); color: var(--bt-text); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24); font-size: clamp(1.2rem, 4.6vw, 1.85rem); font-weight: 700; text-align: center; white-space: nowrap; cursor: pointer; }
        .bt-mode-option:hover, .bt-mode-option:active { background: var(--bt-button); }
        .bt-mode-option[hidden] { display: none !important; }
        .bt-settings [hidden] { display: none !important; }
        select.bt-input, select.bt-input option { color: var(--bt-text); background: var(--bt-panel); }
        .bt-settings { padding-top: 2px; }
        .bt-setting-divider { min-height: 40px; padding: 8px 0; position: sticky; top: var(--bt-sticky-offset); z-index: 20; display: flex; align-items: center; gap: 12px; margin: 20px 0 17px; color: var(--bt-muted); font-size: 0.9rem; text-align: center; background: var(--bt-bg); }
        .bt-setting-divider::before, .bt-setting-divider::after { content: ''; flex: 1; height: 1px; background: var(--bt-border); }
        .bt-setting-divider:first-child { margin-top: 6px; }
        .bt-settings-section { position: relative; display: flow-root; }
        .bt-settings-section .bt-setting-divider { top: -2px; margin-top: 6px; }
        .bt-toggle-field.is-off { border-style: solid; border-color: color-mix(in srgb, var(--bt-selected) 20%, transparent); background: color-mix(in srgb, var(--bt-bg) 90%, var(--bt-muted)); }
        .bt-toggle-field.is-off .bt-label { color: var(--bt-muted); }
        .bt-badge-toggle { position: relative; cursor: pointer; }
        .bt-badge-toggle input { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
        .bt-toggle-badge { grid-column: 2; grid-row: 1 / span 2; display: inline-flex; align-items: center; justify-content: center; min-width: 44px; padding: 6px 8px; border: 1px solid var(--bt-selected); border-radius: 6px; background: color-mix(in srgb, var(--bt-border) 40%, transparent); color: var(--bt-text); font-size: 0.8rem; font-weight: 800; line-height: 1; }
        .is-off .bt-toggle-badge { border-color: color-mix(in srgb, var(--bt-selected) 20%, transparent); background: transparent; color: var(--bt-muted); }
        .bt-badge-toggle input:focus-visible + .bt-toggle-badge { outline: 2px solid var(--bt-selected); outline-offset: 3px; }
        .bt-number-stepper { position: relative; }
        .bt-number-stepper .bt-input { padding-right: 80px; appearance: textfield; -moz-appearance: textfield; }
        .bt-number-stepper input::-webkit-inner-spin-button, .bt-number-stepper input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .bt-stepper-buttons { position: absolute; inset: 1px 1px 1px auto; width: 70px; display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; border-left: 1px solid var(--bt-border); border-radius: 0 7px 7px 0; }
        .bt-stepper-buttons button { border: 0; background: var(--bt-button); cursor: pointer; font-size: 0.65rem; padding: 0; }
        .bt-stepper-buttons button + button { border-left: 1px solid var(--bt-border); }
        .bt-stepper-buttons button:disabled { opacity: 0.35; cursor: default; }
        .bt-regex-section > .bt-regex-heading-title { margin-bottom: 8px; }
        .bt-description { display: block; margin: -3px 0 8px; color: var(--bt-muted); font-size: 0.86rem; line-height: 1.45; }
        .bt-settings .bt-field { margin-bottom: 26px; }
        .bt-settings .bt-input { min-height: 44px; }
        .bt-toggle-field { display: grid; grid-template-columns: 1fr auto; column-gap: 14px; align-items: center; padding: 14px; border: 1px solid var(--bt-border); border-radius: 12px; background: var(--bt-panel); }
        .bt-toggle-field .bt-label { margin-bottom: 3px; }
        .bt-toggle-field .bt-description { grid-column: 1; margin: 0; }
        .bt-toggle-field input { grid-column: 2; grid-row: 1 / span 2; width: 21px; height: 21px; accent-color: var(--bt-selected); }
        .bt-top-toggle-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 10px 0 26px; }
        .bt-top-toggle { min-width: 0; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; padding: 12px; }
        .bt-top-toggle .bt-label { min-width: 0; margin: 0; font-size: 0.92rem; line-height: 1.32; overflow-wrap: anywhere; }
        .bt-top-toggle .bt-label-with-icon { align-items: flex-start; gap: 6px; }
        .bt-top-toggle .bt-label-icon { width: 16px; height: 16px; flex-basis: 16px; margin-top: 1px; }
        .bt-top-toggle input { grid-row: 1; width: 20px; height: 20px; margin: 0; }
        .bt-top-toggle .bt-description { display: block; grid-column: 1 / -1; margin: 5px 0 0; }
        .bt-top-toggle.bt-master-toggle { border: 2px solid rgba(255, 230, 128, 0.72); background: rgba(255, 213, 0, 0.07); }
        .bt-top-toggle.is-off { border-color: color-mix(in srgb, var(--bt-border) 65%, transparent); background: var(--bt-panel); opacity: 0.78; filter: none; }
        .bt-top-toggle.is-off .bt-label { color: var(--bt-text); }
        .bt-top-toggle.bt-master-toggle.is-off { border-color: rgba(255, 230, 128, 0.28); background: rgba(255, 213, 0, 0.02); opacity: 1; }
        .bt-top-toggle.is-disabled { opacity: 0.46; filter: saturate(0.55); cursor: not-allowed; }
        .bt-top-toggle.is-disabled .bt-label { color: var(--bt-muted); }
        .bt-top-toggle.is-disabled input { cursor: not-allowed; }
        .bt-inline-editor .bt-label { font-size: 0.92rem; }
        .bt-flags { display: flex; align-items: center; gap: 16px; margin-top: 9px; color: var(--bt-muted); font-size: 0.86rem; }
        .bt-flag { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
        .bt-flag input { width: 17px; height: 17px; accent-color: var(--bt-selected); }
        .bt-glossary-chip { align-self: center; justify-self: center; min-width: 58px; margin-left: 10px; border: 1px solid var(--bt-border); border-radius: 999px; padding: 6px 9px; background: transparent; color: var(--bt-muted); font-size: 0.84rem; font-weight: 800; line-height: 1; white-space: nowrap; cursor: pointer; touch-action: manipulation; }
        .bt-glossary-chip[data-enabled="true"] { border-color: var(--bt-selected); background: color-mix(in srgb, var(--bt-border) 40%, transparent); color: var(--bt-text); }
        .bt-glossary-chip:active { transform: translateY(1px); }
        .bt-error { min-height: 1.4em; margin: -5px 0 10px; color: #d66f6f; font-size: 0.99rem; white-space: pre-wrap; }
        .bt-status { text-align: center; min-height: 1.4em; margin: 0 0 8px; color: var(--bt-muted); font-size: 0.99rem; white-space: pre-wrap; }
        .bt-status[data-error="true"] { color: #d66f6f; }
        .bt-settings-footer { flex: 0 0 auto; z-index: 35; margin: 0 -18px; padding: 10px 18px 18px; border-top: 1px solid var(--bt-border); background: linear-gradient(to bottom, color-mix(in srgb, var(--bt-bg) 94%, transparent), var(--bt-bg) 22%); backdrop-filter: blur(7px); }
        .bt-save { display: block; width: 90%; margin-inline: auto; border: 1px solid var(--bt-border); border-radius: 12px; padding: 13px; background: var(--bt-button); font-size: 1.1rem; font-weight: 700; cursor: pointer; }
        .bt-wrap, .bt-settings-scroll { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--bt-border) 72%, transparent) transparent; }
        .bt-wrap::-webkit-scrollbar, .bt-settings-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .bt-wrap::-webkit-scrollbar-track, .bt-settings-scroll::-webkit-scrollbar-track { background: transparent; }
        .bt-wrap::-webkit-scrollbar-thumb, .bt-settings-scroll::-webkit-scrollbar-thumb { border-radius: 999px; background: color-mix(in srgb, var(--bt-border) 62%, transparent); }
        .bt-wrap::-webkit-scrollbar-thumb:hover, .bt-settings-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--bt-selected) 78%, transparent); }
        .bt-settings, .bt-regex-page, .bt-wrap > .bt-regex-section { width: 90%; margin-inline: auto; }
        @media (min-width: 421px) {
          .bt-head { cursor: move; user-select: none; touch-action: none; }
          .bt-head.is-dragging { cursor: grabbing; }
          .bt-head button { cursor: pointer; }
        }
        @media (max-width: 420px) {
          body { font-size: 16px; }
          .bt-title { font-size: 1.35rem; }
          .bt-overlay { padding: 10px; }
          .bt-wrap { top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: calc(100% - 20px); max-height: calc(100vh - 20px); padding-inline: 13px; border-radius: 14px; }
          .bt-wrap.bt-wrap-regex { max-height: min(70vh, calc(100vh - 20px)); }
          .bt-wrap.bt-wrap-settings { height: calc(100vh - 20px); }
          .bt-fixed-top { top: -20px; margin-inline: -13px; padding-inline: 13px; }
          .bt-area { min-height: 92px; }
          .bt-tooltip { width: min(300px, calc(100vw - 40px)); }
          .bt-tab { padding-inline: 3px; font-size: 0.88rem; }
          .bt-tooltip { font-size: 0.84rem; }
          .bt-regex-heading-title { font-size: 1rem; }
          .bt-open, .bt-empty, .bt-add, .bt-save, .bt-readonly-hint { font-size: 1rem; }
          .bt-regex-section .bt-add { font-size: 1rem; }
          .bt-inline-editor .bt-label { font-size: 0.95rem; }
          .bt-label { font-size: 0.95rem; }
          .bt-setting-divider { font-size: 0.82rem; }
          .bt-description { font-size: 0.78rem; }
          .bt-toggle-badge { font-size: 0.73rem; }
          .bt-flags { font-size: 0.9rem; }
          .bt-glossary-chip { font-size: 0.76rem; }
          .bt-error, .bt-status { font-size: 0.9rem; }
          .bt-help { margin-right: 3px; }
          .bt-inline-editor { padding: 17px 13px 2px; }
          .bt-top-toggle-grid { gap: 6px; margin-top: 6px;}
          .bt-top-toggle { padding: 10px 8px; column-gap: 5px; }
          .bt-top-toggle .bt-label { font-size: 0.74rem; }
          .bt-top-toggle .bt-label-with-icon { gap: 4px; }
          .bt-top-toggle .bt-label-icon { width: 14px; height: 14px; flex-basis: 14px; }
          .bt-top-toggle input { width: 18px; height: 18px; }
          .bt-settings, .bt-regex-page, .bt-wrap > .bt-regex-section { width: 100%; }
          .bt-settings-footer { margin-inline: -13px; padding-inline: 13px; }
          .bt-save { width: 100%; }
          .bt-glossary-chip { min-width: 52px; margin-left: 6px; padding-inline: 7px; font-size: 0.72rem; }
        }
      </style>
      <div id="bt-overlay" class="bt-overlay">
        <main id="bt-app" class="bt-wrap"></main>
      </div>
    `;

    document.getElementById('bt-overlay').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) Risuai.hideContainer();
    });
  }

  function createHeader(title, { back = false } = {}) {
    const head = document.createElement('header');
    head.className = 'bt-head';

    const left = document.createElement('button');
    left.type = 'button';
    left.className = 'bt-icon';
    left.setAttribute('aria-label', back ? '목록으로' : '');
    left.textContent = back ? '‹' : '';

    const heading = document.createElement('h1');
    heading.className = 'bt-title';
    heading.textContent = title;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bt-icon';
    close.setAttribute('aria-label', '닫기');
    close.textContent = '×';
    close.addEventListener('click', () => Risuai.hideContainer());

    const notice = document.createElement('div');
    notice.id = 'bt-unsaved-notice';
    notice.className = 'bt-description bt-unsaved-notice';
    notice.textContent = '저장하지 않은 설정값이 있습니다.';
    notice.setAttribute('role', 'status');
    notice.hidden = !settingsDraft || settingsSnapshot(settingsDraft) === settingsSavedSnapshot;
    head.append(left, heading, close, notice);
    return { head, left };
  }

  function enableFloatingWindowDrag(container, handle) {
    if (!container || !handle) return;

    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const finishDrag = (event) => {
      if (event.pointerId !== pointerId) return;
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      pointerId = null;
      handle.classList.remove('is-dragging');
    };

    handle.addEventListener('pointerdown', (event) => {
      if (window.innerWidth <= 420 || event.button !== 0) return;
      if (event.target.closest('button, input, textarea, select, a')) return;

      const rect = container.getBoundingClientRect();
      pointerId = event.pointerId;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.top}px`;
      container.style.transform = 'none';
      handle.setPointerCapture?.(pointerId);
      handle.classList.add('is-dragging');
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;

      const rect = container.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - rect.width);
      const maxY = Math.max(0, window.innerHeight - rect.height);
      const x = Math.min(maxX, Math.max(0, event.clientX - offsetX));
      const y = Math.min(maxY, Math.max(0, event.clientY - offsetY));

      container.style.left = `${x}px`;
      container.style.top = `${y}px`;
      event.preventDefault();
    });

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  function createWrapperEditor(
    start,
    end,
    marker,
    label,
    startPlaceholder = '시작 문구 (비우면 생략)',
    endPlaceholder = '끝 문구 (비우면 생략)'
  ) {
    const root = document.createElement('div');
    root.className = 'bt-wrapper-editor';
    const top = document.createElement('textarea');
    top.className = 'bt-area bt-wrapper-top';
    top.value = start;
    top.placeholder = startPlaceholder;
    top.setAttribute('aria-label', `${label} 시작`);
    const slot = document.createElement('div');
    slot.className = 'bt-wrapper-slot';
    slot.textContent = marker;
    slot.setAttribute('aria-label', `${label} 자동 삽입 위치`);
    const bottom = document.createElement('textarea');
    bottom.className = 'bt-area bt-wrapper-bottom';
    bottom.value = end;
    bottom.placeholder = endPlaceholder;
    bottom.setAttribute('aria-label', `${label} 끝`);
    root.append(top, slot, bottom);
    return { root, top, bottom };
  }

  function getUiMode() {
    return memoryConfigState.output_mode === 'dialogue'
      ? 'dialogue'
      : 'bilingual';
  }

  function getModeUi(mode) {
    return mode === 'dialogue'
      ? {
          title: '💬 대사 병기 제어',
          alternative: '✌️ 원문-번역문 병기',
          other: 'bilingual',
        }
      : {
          title: '✌️ 원문-번역문 병기 제어',
          alternative: '💬 대사 병기 제어',
          other: 'dialogue',
        };
  }

  function createModeHeader(state, activeTab) {
    const mode = getUiMode();
    const info = getModeUi(mode);
    const wrapper = document.createElement('div');
    wrapper.className = 'bt-mode-head';

    const head = document.createElement('header');
    head.className = 'bt-head';

    const left = document.createElement('button');
    left.type = 'button';
    left.className = 'bt-icon bt-mode-arrow';
    left.setAttribute('aria-label', '병기 방식 선택 펼치기');
    left.setAttribute('aria-expanded', 'false');
    left.textContent = '▼';

    const heading = document.createElement('h1');
    heading.className = 'bt-title';
    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.className = 'bt-title-button';
    titleButton.textContent = info.title;
    titleButton.setAttribute('aria-expanded', 'false');
    heading.appendChild(titleButton);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bt-icon';
    close.setAttribute('aria-label', '닫기');
    close.textContent = '×';
    close.addEventListener('click', () => Risuai.hideContainer());

    const alternative = document.createElement('button');
    alternative.type = 'button';
    alternative.className = 'bt-mode-option';
    alternative.textContent = info.alternative;
    alternative.hidden = true;

    const setOpened = (opened) => {
      alternative.hidden = !opened;
      left.textContent = opened ? '▲' : '▼';
      left.setAttribute('aria-expanded', String(opened));
      titleButton.setAttribute('aria-expanded', String(opened));
    };

    const toggle = () => setOpened(alternative.hidden);
    left.addEventListener('click', toggle);
    titleButton.addEventListener('click', toggle);
    alternative.addEventListener('click', async () => {
      alternative.disabled = true;
      try {
        configAutoSaveChain = configAutoSaveChain.then(async () => {
          memoryConfigState = await saveConfigState({ ...memoryConfigState, output_mode: info.other });
        });
        await configAutoSaveChain;
        if (settingsDraft) settingsDraft.config.output_mode = info.other;
        expandedRuleIds.exclude.clear();
        expandedRuleIds.translation.clear();
        const nextTab = activeTab === 'exclude' && info.other === 'dialogue'
          ? 'settings'
          : activeTab;
        renderRuleList(state, nextTab);
      } catch (error) {
        alternative.disabled = false;
        globalThis.alert(`병기 방식을 저장하지 못했습니다: ${error?.message ?? error}`);
      }
    });

    const notice = document.createElement('div');
    notice.id = 'bt-unsaved-notice';
    notice.className = 'bt-description bt-unsaved-notice';
    notice.textContent = '저장하지 않은 설정값이 있습니다.';
    notice.setAttribute('role', 'status');
    notice.hidden = !settingsDraft || settingsSnapshot(settingsDraft) === settingsSavedSnapshot;
    head.append(left, heading, close, notice);
    wrapper.append(head, alternative);
    return { wrapper, closeMenu: () => setOpened(false) };
  }

  function renderSettingsPanel() {
    if (!settingsDraft) resetSettingsDraft();
    const app = document.getElementById('bt-app');
    const settings = document.createElement('section');
    settings.className = 'bt-settings';
    const inputs = new Map();

    const topToggleGrid = document.createElement('div');
    topToggleGrid.className = 'bt-top-toggle-grid';
    const topToggleFields = new Map();

    const topToggles = [
      {
        key: 'plugin_enabled',
        label: '✌️ 플러그인 전체',
        description:
          '플러그인 자체 ON/OFF',
      },
      {
        key: 'enabled',
        label: getUiMode() === 'dialogue' ? '대사 병기 조립' : '원문-번역문 조립',
        iconSvg: ASSEMBLY_TOGGLE_ICON,
        description: getUiMode() === 'dialogue' ? '번역된 대사에 원문을 괄호로 덧붙입니다.' : '번역 결과물을 원문-번역문 형태로 출력합니다.',
      },
      {
        key: 'translation_context_enabled',
        label: '이전 메시지 제공',
        iconSvg: CONTEXT_TOGGLE_ICON,
        description: '이전 N개 메시지를 참고용 문맥으로 제공합니다.',
      },
    ];

    for (const item of topToggles) {
      const field = document.createElement('label');
      field.className = 'bt-toggle-field bt-top-toggle';
      if (item.key === 'plugin_enabled') field.classList.add('bt-master-toggle');
      field.title = item.description;

      const label = document.createElement('span');
      label.className = 'bt-label';
      if (item.iconSvg) {
        label.classList.add('bt-label-with-icon');
        const icon = document.createElement('span');
        icon.className = 'bt-label-icon';
        icon.innerHTML = item.iconSvg;
        label.append(icon, document.createTextNode(item.label));
      } else {
        label.textContent = item.label;
      }

      const description = document.createElement('span');
      description.className = 'bt-description';
      description.textContent = item.description;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = String(settingsDraft.config[item.key] ?? '1') !== '0';
      const syncOwnToggleState = () => {
        field.classList.toggle('is-off', !input.checked);
      };
      input.addEventListener('change', syncOwnToggleState);
      input.addEventListener('change', () => {
        const value = input.checked ? '1' : '0';
        settingsDraft.config[item.key] = value;
        configAutoSaveChain = configAutoSaveChain
          .then(async () => {
            memoryConfigState = await saveConfigState({
              ...memoryConfigState,
              [item.key]: value,
            });
          })
          .catch((error) => {
            status.dataset.error = 'true';
            status.textContent = `ON/OFF 설정을 저장하지 못했습니다: ${error?.message ?? error}`;
          });
      });
      syncOwnToggleState();
      inputs.set(item.key, input);
      topToggleFields.set(item.key, field);
      field.append(label, description, input);
      topToggleGrid.appendChild(field);
    }

    const pluginToggle = inputs.get('plugin_enabled');
    const syncPluginDependentToggles = () => {
      const pluginOn = pluginToggle?.checked !== false;
      for (const key of ['enabled', 'translation_context_enabled']) {
        const input = inputs.get(key);
        const field = topToggleFields.get(key);
        if (input) input.disabled = !pluginOn;
        field?.classList.toggle('is-disabled', !pluginOn);
        field?.setAttribute('aria-disabled', String(!pluginOn));
      }
    };
    pluginToggle?.addEventListener('change', syncPluginDependentToggles);
    syncPluginDependentToggles();

    settings.appendChild(topToggleGrid);

    const items = [
      ...(getUiMode() === 'dialogue' ? [
      { divider: '대사 병기' },
      {
        key: 'dialogue_source_position',
        type: 'select',
        label: '대사 원문 삽입 위치',
        description: '',
        options: [
          ['outside', '따옴표 밖: “번역문”(원문)'],
          ['inside', '따옴표 안: “번역문 (원문)”'],
        ],
      },
      {
        key: 'uppercase_block_pairing',
        type: 'checkbox',
        label: '독립 대문자 블록 병기',
        description: '문단 구조가 안전하게 대응될 때 대문자 원문 블록을 번역문 뒤에 붙입니다.',
      },
      ] : []),
      { divider: '번역 원문 찾기' },
      {
        key: 'source_message_role',
        label: '{{solt::content}}를 찾을 role',
        description:
          '<|im_start|> 기준, user/system/assistant, 비울 시 any (role 지정 x)',
        placeholder: 'any',
      },
      {
        key: 'source_start_pattern',
        label: '번역 프롬 내 {{solt::content}} 앞 패턴',
        description:
          '문자열=독립된 한 줄, /regex/flags=정규식, NONE=role의 처음 (기본: # SOURCE)',
        placeholder: '정규식 사용 시 \/(패턴)\/g 형태로 입력',
      },
      {
        key: 'source_end_pattern',
        label: '번역 프롬 내 {{solt::content}} 뒤 패턴',
        description:
          '문자열=독립된 한 줄, /regex/flags=정규식, NONE=role의 끝 (기본: NONE)',
        placeholder: 'NONE',
      },
      { divider: '<span>', group: 'span' },
      {
        key: 'use_source_span',
        type: 'checkbox',
        label: '<span> 태그 사용',
        description: '원문 꾸미기용 <span> 태그를 사용합니다.',
      },
      {
        key: 'source_color',
        label: '원문 색상',
        description:
          '<span style="color:">형태. NONE=색상 없음 (기본: #b6997c)',
        placeholder: '#b6997c',
      },
      {
        key: 'source_extra_style',
        label: '추가 스타일 CSS',
        description: '원문 <span>에 추가할 스타일 (기본: 없음)',
        placeholder: '(비우면 생략)',
      },
      {
        key: 'source_class',
        label: '클래스 설정',
        description: '원문 <span>에 class 명을 추가합니다. (기본: 없음)',
        placeholder: '(비우면 생략)',
      },
      ...(getUiMode() === 'bilingual' ? [
      { divider: '원문-번역문 사이 설정' },
      {
        key: 'source_translation_separator',
        label: '원문-번역문 사이 구분자',
        description: 'NONE=없음 (기본: \\n)',
        placeholder: '\\n',
      },
      {
        key: 'pair_separator',
        label: '원문+번역문 문단 사이 구분자',
        description: 'NONE=없음 (기본: \\n\\n)',
        placeholder: '\\n\\n',
      },
      ] : []),
      { divider: '이전 메시지 제공' },
      {
        key: 'translation_context_messages',
        type: 'number',
        min: '0',
        max: '50',
        label: '이전 메시지 수',
        description: '턴이 아닌 개별 user/char 메시지 개수입니다. (최대 50) (기본: 4)',
        placeholder: '4',
      },
      {
        key: 'translation_context_max_chars',
        type: 'number',
        min: '0',
        max: '200000',
        label: '최대 글자 수',
        description:
          '토큰이 아닌 글자 수입니다. 초과하면 오래된 메시지부터 줄입니다. 0이면 이전 메시지를 주입하지 않습니다 (최대 200000) (기본: 12000)',
        placeholder: '12000',
      },
      {
        key: '__translation_context_wrapper_ui__',
        type: 'textarea',
        tall: true,
        label: '이전 메시지 블럭',
        description: '이전 N개 메시지를 아래 프롬프트와 함께 제공합니다. 주입 위치: \'번역 프롬 내 {{solt::content}} 앞 패턴\'의 직전. NONE=없음 (기본: 플레이스 홀더 참고)',
      },
      {
        key: 'translation_context_user_label',
        label: '{{user}} 메시지 라벨',
        description: 'NONE=없음 (기본: [User])',
        placeholder: "[User]",
      },
      {
        key: 'translation_context_character_label',
        label: '{{char}} 메시지 라벨',
        description: 'NONE=없음 (기본: [Assistant])',
        placeholder: "[Assistant]",
      },
      { divider: '어휘집 (추가 번역 가이드)' },
      {
        key: '__glossary_wrapper_ui__',
        type: 'textarea',
        tall: true,
        label: '어휘집 블럭',
        description: '사용 중인 어휘집 항목이 번역 원문과 매칭될 때, 아래 프롬프트와 함께 추가 번역 가이드를 제공합니다. 주입 위치: 첫번째 system 메시지의 최하단. NONE=없음 (기본: 플레이스 홀더 참고)',
      },
      { divider: '기타' },
      {
        key: 'retry_guard_enabled',
        type: 'checkbox',
        label: '재시도 중복 방지',
        description: '요청에 식별 문구를 넣어 재시도 시 원문 수집과 이전 메시지·어휘집 주입의 반복을 방지합니다. (기본: OFF)',
      },
      {
        key: 'keep_reasoning_blocks',
        type: 'checkbox',
        label: '번역 응답의 생각의 사슬(<Thoughts>) 유지',
        description: 'OFF 시 번역 모델의 생각의 사슬은 제거합니다. 이 옵션을 킬 경우 번역 모델의 생각의 사슬을 제거하지 않습니다.',
      },
      {
        key: 'debug',
        type: 'checkbox',
        label: '디버그 로그 출력',
        description: '번역문 출력 상단에 디버그 로그를 표시합니다.',
      },
    ];

    let settingsSection = settings;
    for (const item of items) {
      if (item.divider) {
        const divider = document.createElement('div');
        divider.className = 'bt-setting-divider';
        divider.textContent = item.divider;
        settingsSection = document.createElement('section');
        settingsSection.className = 'bt-settings-section';
        if (item.group) settingsSection.dataset.settingGroup = item.group;
        settings.appendChild(settingsSection);
        settingsSection.appendChild(divider);
        continue;
      }

      const field = document.createElement('label');
      field.className = 'bt-field';

      const label = document.createElement('span');
      label.className = 'bt-label';
      if (item.iconSvg) {
        label.classList.add('bt-label-with-icon');
        const icon = document.createElement('span');
        icon.className = 'bt-label-icon';
        icon.innerHTML = item.iconSvg;
        label.append(icon, document.createTextNode(item.label));
      } else {
        label.textContent = item.label;
      }

      const description = document.createElement('span');
      description.className = 'bt-description';
      description.textContent = item.description;

      let input;
      let toggleBadge;
      if (item.key === '__translation_context_wrapper_ui__') {
        const wrapper = createWrapperEditor(
          settingsDraft.config.translation_context_wrapper_top ?? DEFAULT_CONTEXT_WRAPPER_TOP,
          settingsDraft.config.translation_context_wrapper_bottom ?? DEFAULT_CONTEXT_WRAPPER_BOTTOM,
          '{{이전 메시지 삽입 위치}}',
          '이전 메시지 영역',
          DEFAULT_CONTEXT_WRAPPER_TOP,
          DEFAULT_CONTEXT_WRAPPER_BOTTOM
        );
        inputs.set(item.key, wrapper);
        field.append(label, description, wrapper.root);
        settingsSection.appendChild(field);
        continue;
      }
      if (item.key === '__glossary_wrapper_ui__') {
        const wrapper = createWrapperEditor(
          settingsDraft.wrapperStart ?? DEFAULT_GLOSSARY_WRAPPER_TOP,
          settingsDraft.wrapperEnd ?? DEFAULT_GLOSSARY_WRAPPER_BOTTOM,
          '{{어휘집 삽입 위치}}',
          '어휘집 영역',
          DEFAULT_GLOSSARY_WRAPPER_TOP,
          DEFAULT_GLOSSARY_WRAPPER_BOTTOM
        );
        inputs.set(item.key, wrapper);
        field.append(label, description, wrapper.root);
        settingsSection.appendChild(field);
        continue;
      }
      if (item.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = String(settingsDraft.config[item.key] ?? '1') !== '0';
        field.classList.add('bt-toggle-field', 'bt-badge-toggle');
        toggleBadge = document.createElement('span');
        toggleBadge.className = 'bt-toggle-badge';
        toggleBadge.setAttribute('aria-hidden', 'true');
        input.setAttribute('aria-label', item.label);
        const syncOffStyle = () => {
          field.classList.toggle('is-off', !input.checked);
          toggleBadge.textContent = input.checked ? 'ON' : 'OFF';
        };
        input.addEventListener('change', syncOffStyle);
        syncOffStyle();
      } else if (item.type === 'select') {
        input = document.createElement('select');
        input.className = 'bt-input';
        for (const [value, text] of item.options ?? []) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          input.appendChild(option);
        }
        input.value = settingsDraft.config[item.key] ?? item.options?.[0]?.[0] ?? '';
      } else if (item.type === 'textarea') {
        input = document.createElement('textarea');
        input.className = item.tall ? 'bt-area bt-context-template' : 'bt-area';

        input.value = settingsDraft.config[item.key] ?? '';

        input.placeholder = item.placeholder ?? '';
        input.autocomplete = 'off';
      } else {
        input = document.createElement('input');
        input.className = 'bt-input';
        input.type = item.type === 'number' ? 'number' : 'text';
        if (item.min !== undefined) input.min = item.min;
        if (item.max !== undefined) input.max = item.max;
        input.value = settingsDraft.config[item.key] ?? '';
        input.placeholder = item.placeholder ?? '';
        input.autocomplete = 'off';
      }

      inputs.set(item.key, input);
      if (item.key === 'translation_context_messages') {
        const stepper = document.createElement('div');
        stepper.className = 'bt-number-stepper';
        const buttons = document.createElement('div');
        buttons.className = 'bt-stepper-buttons';
        input.step = '1';
        input.inputMode = 'numeric';
        input.setAttribute('aria-label', item.label);
        for (const [delta, symbol, action] of [[1, '▲', '늘리기'], [-1, '▼', '줄이기']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = symbol;
          button.setAttribute('aria-label', `${item.label} ${action}`);
          button.addEventListener('click', event => {
            event.preventDefault();
            const value = Number(input.value || item.placeholder);
            input.value = String(Math.max(Number(item.min), Math.min(Number(item.max), Math.trunc(Number.isFinite(value) ? value : 4) + delta)));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
          const syncBoundary = () => button.disabled = input.value !== '' && (delta > 0 ? Number(input.value) >= Number(item.max) : Number(input.value) <= Number(item.min));
          input.addEventListener('input', syncBoundary);
          syncBoundary();
          buttons.appendChild(button);
        }
        stepper.append(input, buttons);
        field.append(label, description, stepper);
      } else {
        field.append(label, description, input);
      }
      if (toggleBadge) field.appendChild(toggleBadge);
      settingsSection.appendChild(field);
    }

    const syncConditionalSettings = () => {
      const inside = getUiMode() === 'dialogue' && inputs.get('dialogue_source_position')?.value === 'inside';
      settings.querySelectorAll('[data-setting-group="span"]').forEach(element => { element.hidden = inside; });
    };
    inputs.get('dialogue_source_position')?.addEventListener('change', syncConditionalSettings);
    syncConditionalSettings();

    const status = document.createElement('div');
    status.className = 'bt-status';

    const captureDraft = () => {
      const updated = { ...settingsDraft.config };
      const updatedGlossary = {};
      for (const [key, input] of inputs) {
        if (key === '__translation_context_wrapper_ui__') {
          updated.translation_context_wrapper_top = input.top.value;
          updated.translation_context_wrapper_bottom = input.bottom.value;
          continue;
        }
        if (key === '__glossary_wrapper_ui__') {
          updatedGlossary.wrapperStart = input.top.value;
          updatedGlossary.wrapperEnd = input.bottom.value;
          continue;
        }

        updated[key] = input.type === 'checkbox'
          ? (input.checked ? '1' : '0')
          : input.value;
      }

      settingsDraft = { config: updated, wrapperStart: updatedGlossary.wrapperStart, wrapperEnd: updatedGlossary.wrapperEnd };
      syncUnsavedNotice();
    };
    for (const input of inputs.values()) {
      for (const control of input.top ? [input.top, input.bottom] : [input]) {
        for (const event of ['input', 'change']) control.addEventListener(event, () => {
          captureDraft();
          status.textContent = '';
        });
      }
    }

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'bt-save';
    save.textContent = '설정 저장';
    save.addEventListener('click', async () => {
      status.textContent = '';
      status.dataset.error = 'false';
      captureDraft();
      const savingDraft = JSON.parse(JSON.stringify(settingsDraft));
      const updated = savingDraft.config;
      const updatedGlossary = normalizeGlossaryState(memoryGlossaryState);
      updatedGlossary.wrapperStart = savingDraft.wrapperStart;
      updatedGlossary.wrapperEnd = savingDraft.wrapperEnd;
      save.disabled = true;

      try {
        await configAutoSaveChain;
        memoryConfigState = await saveConfigState(updated);
        memoryGlossaryState = updatedGlossary;
        await persistGlossaryStateNow(memoryGlossaryState);
        settingsSavedSnapshot = settingsSnapshot(savingDraft);
        syncUnsavedNotice();
        status.textContent = '저장되었습니다.';
      } catch (error) {
        status.dataset.error = 'true';
        status.textContent = `저장하지 못했습니다: ${error?.message ?? error}`;
      } finally {
        save.disabled = false;
      }
    });

    const footer = document.createElement('div');
    footer.className = 'bt-settings-footer';
    const clearSources = document.createElement('button');
    clearSources.type = 'button';
    clearSources.className = 'bt-save';
    clearSources.textContent = '수집한 원문 비우기';
    clearSources.style.marginBottom = '8px';
    clearSources.title = '번역이 끝나거나 중단된 뒤 사용하세요. 병기 대기 중인 원문을 모두 비웁니다.';
    clearSources.addEventListener('click', () => {
      const count = clearPendingSources();
      status.dataset.error = 'false';
      status.textContent = `수집한 원문 ${count}건을 비웠습니다.`;
    });
    footer.append(status, clearSources, save);

    const scroll = document.createElement('div');
    scroll.className = 'bt-settings-scroll';
    scroll.appendChild(settings);
    app.append(scroll, footer);
  }

  function createEmptyUiRule(activeTab) {
    return activeTab === 'translation' || activeTab === 'context'
      ? {
          id: makeRuleId(),
          name: '',
          input: '',
          output: '',
          global: true,
          ignoreCase: false,
        }
      : {
          id: makeRuleId(),
          name: '',
          input: '',
          ignoreCase: false,
        };
  }

  function createInlineRuleEditor(state, activeTab, rule, summaryButton) {
    const editor = document.createElement('div');
    editor.className = 'bt-inline-editor';
    editor.dataset.ruleId = rule.id;

    const nameLabel = document.createElement('label');
    nameLabel.className = 'bt-field';
    nameLabel.innerHTML = '<span class="bt-label">이름</span>';
    const nameInput = document.createElement('input');
    nameInput.className = 'bt-input';
    nameInput.value = rule.name;
    nameInput.placeholder = 'Unnamed Script';
    nameInput.autocomplete = 'off';
    nameLabel.appendChild(nameInput);

    const inputLabel = document.createElement('label');
    inputLabel.className = 'bt-field';
    inputLabel.innerHTML = '<span class="bt-label">IN:</span>';
    const patternInput = document.createElement('textarea');
    patternInput.className = 'bt-area';
    patternInput.value = rule.input;
    patternInput.placeholder = '정규식 매칭 패턴 입력';
    inputLabel.appendChild(patternInput);

    let outputInput = null;
    let globalInput = null;
    let ignoreCaseInput = null;

    if (activeTab === 'exclude') {
      const flags = document.createElement('div');
      flags.className = 'bt-flags';
      const iLabel = document.createElement('label');
      iLabel.className = 'bt-flag';
      ignoreCaseInput = document.createElement('input');
      ignoreCaseInput.type = 'checkbox';
      ignoreCaseInput.checked = rule.ignoreCase;
      iLabel.append(ignoreCaseInput, document.createTextNode('i 대소문자 무시'));
      flags.appendChild(iLabel);
      inputLabel.appendChild(flags);
    }

    editor.append(nameLabel, inputLabel);

    if (activeTab === 'translation' || activeTab === 'context') {
      const outputLabel = document.createElement('label');
      outputLabel.className = 'bt-field';
      outputLabel.innerHTML = '<span class="bt-label">OUT:</span>';
      outputInput = document.createElement('textarea');
      outputInput.className = 'bt-area';
      outputInput.value = rule.output;
      outputInput.placeholder = '';
      outputLabel.appendChild(outputInput);

      const flags = document.createElement('div');
      flags.className = 'bt-flags';

      const gLabel = document.createElement('label');
      gLabel.className = 'bt-flag';
      globalInput = document.createElement('input');
      globalInput.type = 'checkbox';
      globalInput.checked = rule.global;
      gLabel.append(globalInput, document.createTextNode('g 전체 치환'));

      const iLabel = document.createElement('label');
      iLabel.className = 'bt-flag';
      ignoreCaseInput = document.createElement('input');
      ignoreCaseInput.type = 'checkbox';
      ignoreCaseInput.checked = rule.ignoreCase;
      iLabel.append(ignoreCaseInput, document.createTextNode('i 대소문자 무시'));

      flags.append(gLabel, iLabel);
      outputLabel.appendChild(flags);
      editor.appendChild(outputLabel);
    } else {
      const outputHint = document.createElement('div');
      outputHint.className = 'bt-field';
      outputHint.innerHTML = '<span class="bt-label">OUT:</span>';
      const outputLikeBox = document.createElement('div');
      outputLikeBox.className = 'bt-readonly-hint';
      outputLikeBox.setAttribute('aria-disabled', 'true');
      outputLikeBox.textContent = '(출력 시 해당 부분은 원문은 출력하지 않고 번역문만 남깁니다.)';
      outputHint.appendChild(outputLikeBox);
      editor.appendChild(outputHint);
    }

    const errorBox = document.createElement('div');
    errorBox.className = 'bt-error';
    editor.appendChild(errorBox);

    const updateRule = () => {
      rule.name = nameInput.value;
      rule.input = patternInput.value;
      rule.ignoreCase = ignoreCaseInput?.checked === true;

      if (activeTab === 'translation' || activeTab === 'context') {
        rule.output = outputInput.value;
        rule.global = globalInput.checked;
      }

      summaryButton.textContent = getRuleLabel(rule);
      summaryButton.setAttribute('aria-label', `${getRuleLabel(rule)} 편집`);
      errorBox.textContent = '';

      if (rule.input) {
        try {
          compileUiRegex(rule, activeTab);
        } catch (error) {
          errorBox.textContent = `정규식 오류: ${error?.message ?? error}`;
        }
      }

      queueRuleStateSave(state, (error) => {
        errorBox.textContent = `자동 저장하지 못했습니다: ${error?.message ?? error}`;
      });
    };

    nameInput.addEventListener('input', updateRule);
    patternInput.addEventListener('input', updateRule);
    outputInput?.addEventListener('input', updateRule);
    globalInput?.addEventListener('change', updateRule);
    ignoreCaseInput?.addEventListener('change', updateRule);

    return editor;
  }

  function createHelpButton(label, description, scopeRoot) {
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'bt-help';
    help.textContent = '?';
    help.setAttribute('aria-label', `${label} 설명`);
    help.setAttribute('aria-expanded', 'false');

    const closeTooltip = () => {
      help.parentElement?.querySelector('.bt-tooltip')?.remove();
      help.setAttribute('aria-expanded', 'false');
    };

    const openTooltip = () => {
      const root = document.getElementById('bt-app') || scopeRoot || document;
      root.querySelectorAll('.bt-tooltip').forEach((item) => item.remove());
      root.querySelectorAll('.bt-help').forEach((item) =>
        item.setAttribute('aria-expanded', 'false')
      );

      const tooltip = document.createElement('div');
      tooltip.className = 'bt-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.textContent = description;
      help.parentElement?.appendChild(tooltip);
      help.setAttribute('aria-expanded', 'true');
    };

    help.addEventListener('click', (event) => {
      if (window.innerWidth > 420) return;
      event.preventDefault();
      if (help.getAttribute('aria-expanded') === 'true') closeTooltip();
      else openTooltip();
    });

    help.addEventListener('mouseenter', () => {
      if (window.innerWidth > 420) openTooltip();
    });
    help.addEventListener('mouseleave', () => {
      if (window.innerWidth > 420 && document.activeElement !== help) closeTooltip();
    });
    help.addEventListener('focus', () => {
      if (window.innerWidth > 420) openTooltip();
    });
    help.addEventListener('blur', () => {
      if (window.innerWidth > 420) closeTooltip();
    });

    return help;
  }

  function getRuleSectionMeta(type) {
    if (type === 'translation') {
      return {
        key: 'translationRules',
        label: '번역문 수정',
        tooltip:
          '기존 RisuAI 정규식 스크립트의 \'Modification Type: 번역문 수정\'과 비슷합니다. 다른 점: 플러그인이 번역문의 해당 패턴을 자체적으로 치환 후 원문과 조립하여 출력하기 때문에, 결과물에 정규식 처리 전 번역문이 남지 않습니다. (비가역적)',
      };
    }
    if (type === 'context') {
      return {
        key: 'contextRules',
        label: '참고용 이전 메시지 수정',
        description: '<Thoughts> 태그와 그 안의 내용은 기본으로 제거됩니다.',
        tooltip:
          '참고용으로 주입할 이전 메시지에 적용되는 정규식입니다. 실제 채팅 메시지와 번역 대상 메시지는 변경하지 않으며, 치환 뒤 빈 메시지는 주입 대상에서 제외됩니다.',
      };
    }
    return {
      key: 'excludeRules',
      label: '원문 제외',
      tooltip:
        '해당하는 패턴이 포함된 문단은 원문없이 번역문만 출력합니다. 일치하는 패턴이 있는 원문 문단 전체가 빠지므로, 상태창이나 에셋 등 원문 출력이 필요없고 확실하게 식별되는 패턴이 있는 경우에 활용하세요.',
    };
  }

  function renderSingleRuleSection(state, type) {
    const meta = getRuleSectionMeta(type);
    const rules = state[meta.key];
    const expanded = expandedRuleIds[type];

    const section = document.createElement('section');
    section.className = 'bt-regex-section';
    section.dataset.ruleSection = type;

    const heading = document.createElement('div');
    heading.className = 'bt-regex-heading';

    const title = document.createElement('h2');
    title.className = 'bt-regex-heading-title';
    title.textContent = meta.label;
    heading.appendChild(title);
    heading.appendChild(createHelpButton(meta.label, meta.tooltip, section));
    section.appendChild(heading);
    if (meta.description) {
      const description = document.createElement('span');
      description.className = 'bt-description';
      description.textContent = meta.description;
      heading.style.marginBottom = '8px';
      section.appendChild(description);
    }

    const list = document.createElement('div');
    list.className = 'bt-list';

    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bt-empty';
      empty.textContent = '등록된 스크립트가 없습니다.';
      list.appendChild(empty);
    } else {
      for (const rule of rules) {
        const ruleBlock = document.createElement('div');
        ruleBlock.className = 'bt-rule';

        const row = document.createElement('div');
        row.className = 'bt-row';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'bt-open';
        open.textContent = getRuleLabel(rule);
        open.setAttribute('aria-label', `${getRuleLabel(rule)} 편집`);
        open.setAttribute('aria-expanded', String(expanded.has(rule.id)));
        open.addEventListener('click', () => {
          const wrap = document.querySelector('.bt-wrap');
          const scrollTop = wrap?.scrollTop ?? 0;
          if (expanded.has(rule.id)) expanded.delete(rule.id);
          else expanded.add(rule.id);
          renderRuleList(state, 'regex', scrollTop);
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'bt-delete';
        remove.setAttribute('aria-label', `${getRuleLabel(rule)} 삭제`);
        remove.textContent = '×';
        remove.addEventListener('click', async () => {
          if (
            typeof globalThis.confirm === 'function' &&
            !globalThis.confirm(`${getRuleLabel(rule)}을(를) 삭제할까요?`)
          ) {
            return;
          }

          const wrap = document.querySelector('.bt-wrap');
          const scrollTop = wrap?.scrollTop ?? 0;
          expanded.delete(rule.id);
          state[meta.key] = state[meta.key].filter((item) => item.id !== rule.id);
          await persistRuleStateNow(state, (error) => {
            globalThis.alert(`삭제 내용을 저장하지 못했습니다: ${error?.message ?? error}`);
          });
          renderRuleList(state, 'regex', scrollTop);
        });

        row.append(open, remove);
        ruleBlock.appendChild(row);

        if (expanded.has(rule.id)) {
          ruleBlock.appendChild(createInlineRuleEditor(state, type, rule, open));
        }

        list.appendChild(ruleBlock);
      }
    }

    section.appendChild(list);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'bt-add';
    add.textContent = '＋ 추가';
    add.addEventListener('click', async () => {
      const rule = createEmptyUiRule(type);
      state[meta.key].push(rule);
      expanded.add(rule.id);
      await persistRuleStateNow(state, (error) => {
        globalThis.alert(`추가 내용을 저장하지 못했습니다: ${error?.message ?? error}`);
      });
      renderRuleList(state, 'regex');
      setTimeout(() => {
        const editor = document.querySelector(
          `.bt-inline-editor[data-rule-id="${rule.id}"] .bt-input`
        );
        editor?.scrollIntoView({ block: 'center' });
        editor?.focus();
      }, 0);
    });
    section.appendChild(add);

    return section;
  }

  function renderGlossarySection(ruleState) {
    const state = memoryGlossaryState;
    const section = document.createElement('section');
    section.className = 'bt-regex-section';
    const title = document.createElement('h2');
    title.className = 'bt-regex-heading-title';
    title.textContent = '어휘집';
    const description = document.createElement('p');
    description.className = 'bt-description';
    description.textContent = '번역 대상 메시지에서 아래 등록된 표현이 발견될 경우, 해당하는 번역 가이드를 제공합니다.';
    const status = document.createElement('div');
    status.className = 'bt-error';
    const onError = error => { status.textContent = `저장하지 못했습니다: ${error?.message ?? error}`; };
    const redraw = () => renderRuleList(ruleState, 'glossary', document.getElementById('bt-app')?.scrollTop ?? 0);
    const list = document.createElement('div');
    list.className = 'bt-list';
    if (!state.entries.length) {
      const empty = document.createElement('div');
      empty.className = 'bt-empty';
      empty.textContent = '아직 등록된 어휘가 없습니다.';
      list.append(empty);
    }
    for (const entry of state.entries) {
      const card = document.createElement('div');
      card.className = 'bt-rule';
      const row = document.createElement('div');
      row.className = 'bt-row';
      row.style.gridTemplateColumns = 'auto minmax(0, 1fr) 50px';
      const enabled = document.createElement('button');
      enabled.type = 'button';
      enabled.className = 'bt-glossary-chip';
      const syncEnabledChip = () => {
        enabled.dataset.enabled = String(entry.enabled);
        enabled.textContent = entry.enabled ? '사용 중' : '사용 안함';
        enabled.setAttribute('aria-pressed', String(entry.enabled));
        enabled.setAttribute('aria-label', `어휘집 항목 ${entry.enabled ? '사용 중' : '미사용 중'}`);
      };
      syncEnabledChip();
      enabled.addEventListener('click', async () => {
        entry.enabled = !entry.enabled;
        syncEnabledChip();
        await persistGlossaryStateNow(state, onError);
      });
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'bt-open';
      open.textContent = entry.name || '이름 없는 항목';
      open.setAttribute('aria-expanded', String(expandedGlossaryIds.has(entry.id)));
      open.addEventListener('click', () => {
        if (expandedGlossaryIds.has(entry.id)) expandedGlossaryIds.delete(entry.id);
        else expandedGlossaryIds.add(entry.id);
        redraw();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bt-delete';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${entry.name || '이름 없는 항목'} 삭제`);
      remove.addEventListener('click', async () => {
        if (typeof globalThis.confirm === 'function' && !globalThis.confirm(`${entry.name || '이름 없는 항목'}을(를) 삭제할까요?`)) return;
        state.entries = state.entries.filter(item => item.id !== entry.id);
        expandedGlossaryIds.delete(entry.id);
        await persistGlossaryStateNow(state, error => globalThis.alert(`삭제 내용을 저장하지 못했습니다: ${error?.message ?? error}`));
        redraw();
      });
      row.append(enabled, open, remove);
      card.append(row);
      if (expandedGlossaryIds.has(entry.id)) {
        const editor = document.createElement('div');
        editor.className = 'bt-inline-editor';
        const errorBox = document.createElement('div');
        errorBox.className = 'bt-error';
        const validate = () => {
          errorBox.textContent = '';
          try { if (entry.input) new RegExp(entry.input, entry.ignoreCase ? 'i' : ''); }
          catch (error) { errorBox.textContent = `정규식 오류 (번역 시 건너뜀): ${error?.message ?? error}`; }
        };
        const nameLabel = document.createElement('label');
        nameLabel.className = 'bt-field';
        nameLabel.innerHTML = '<span class="bt-label">이름</span>';
        const nameInput = document.createElement('input');
        nameInput.className = 'bt-input';
        nameInput.value = entry.name;
        nameInput.placeholder = 'Unnamed Script';
        nameInput.autocomplete = 'off';
        nameInput.addEventListener('input', () => {
          entry.name = nameInput.value;
          open.textContent = entry.name || '이름 없는 항목';
          queueGlossaryStateSave(state, onError);
        });
        nameLabel.appendChild(nameInput);

        const inputLabel = document.createElement('label');
        inputLabel.className = 'bt-field';
        inputLabel.innerHTML = '<span class="bt-label">IN (어휘 감지 정규식):</span>';
        const patternInput = document.createElement('textarea');
        patternInput.className = 'bt-area';
        patternInput.value = entry.input;
        patternInput.placeholder = '정규식 매칭 패턴 입력';
        patternInput.addEventListener('input', () => {
          entry.input = patternInput.value;
          validate();
          queueGlossaryStateSave(state, onError);
        });
        inputLabel.appendChild(patternInput);

        const flags = document.createElement('div');
        flags.className = 'bt-flags';
        const ignoreCaseLabel = document.createElement('label');
        ignoreCaseLabel.className = 'bt-flag';
        const ignoreCaseInput = document.createElement('input');
        ignoreCaseInput.type = 'checkbox';
        ignoreCaseInput.checked = entry.ignoreCase;
        ignoreCaseInput.addEventListener('change', () => {
          entry.ignoreCase = ignoreCaseInput.checked;
          validate();
          queueGlossaryStateSave(state, onError);
        });
        ignoreCaseLabel.append(ignoreCaseInput, document.createTextNode('i 대소문자 무시'));
        flags.appendChild(ignoreCaseLabel);
        inputLabel.appendChild(flags);

        const guideLabel = document.createElement('label');
        guideLabel.className = 'bt-field';
        guideLabel.innerHTML = '<span class="bt-label">OUT (번역 가이드):</span>';
        const guideInput = document.createElement('textarea');
        guideInput.className = 'bt-area';
        guideInput.value = entry.guide;
        guideInput.style.minHeight = '180px';
        guideInput.addEventListener('input', () => {
          entry.guide = guideInput.value;
          queueGlossaryStateSave(state, onError);
        });
        guideLabel.appendChild(guideInput);

        editor.append(nameLabel, inputLabel, guideLabel);
        validate();
        editor.append(errorBox);
        card.append(editor);
      }
      list.append(card);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'bt-add';
    add.textContent = '＋ 어휘집 항목 추가';
    add.addEventListener('click', async () => {
      const entry = { id: makeRuleId(), name: '', enabled: true, input: '', ignoreCase: false, guide: '' };
      state.entries.push(entry);
      expandedGlossaryIds.add(entry.id);
      await persistGlossaryStateNow(state, error => globalThis.alert(`추가 내용을 저장하지 못했습니다: ${error?.message ?? error}`));
      redraw();
      const editors = section.ownerDocument.querySelectorAll('.bt-inline-editor');
      const last = editors[editors.length - 1];
      last?.scrollIntoView({ block: 'center' });
      last?.querySelector('input')?.focus();
    });
    section.append(title, description, status, list, add);
    return section;
  }

  function syncStickyOffset(app, fixedTop) {
    const update = () => {
      if (!app || !fixedTop) return;
      app.style.setProperty('--bt-sticky-offset', `${fixedTop.offsetHeight - 20}px`);
    };

    requestAnimationFrame(update);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(update);
      observer.observe(fixedTop);
      requestAnimationFrame(() => {
        if (!fixedTop.isConnected) observer.disconnect();
      });
    }
  }

  function renderRuleList(state, activeTab, restoreScrollTop = null) {
    const app = document.getElementById('bt-app');
    app.replaceChildren();

    app.classList.toggle('bt-wrap-regex', activeTab === 'regex');
    app.classList.toggle('bt-wrap-settings', activeTab === 'settings');
    app.style.setProperty('--bt-sticky-offset', '0px');
    app.scrollTop = 0;

    const fixedTop = document.createElement('div');
    fixedTop.className = 'bt-fixed-top';

    const { wrapper: modeHeader, closeMenu } = createModeHeader(state, activeTab);
    fixedTop.appendChild(modeHeader);
    app.onclick = event => { if (!modeHeader.contains(event.target)) closeMenu(); };
    enableFloatingWindowDrag(app, modeHeader.querySelector('.bt-head'));

    const tabs = document.createElement('div');
    tabs.className = 'bt-tabs';

    for (const [tab, label] of [
      ['settings', '기본 설정'],
      ['regex', '정규식'],
      ['glossary', '어휘집'],
    ]) {
      const cell = document.createElement('div');
      cell.className = 'bt-tab-cell';
      cell.dataset.selected = String(tab === activeTab);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bt-tab';
      button.textContent = label;
      button.setAttribute('aria-selected', String(tab === activeTab));
      button.addEventListener('click', () => {
        renderRuleList(state, tab);
      });
      cell.appendChild(button);
      tabs.appendChild(cell);
    }

    fixedTop.appendChild(tabs);
    app.appendChild(fixedTop);
    if (activeTab !== 'settings') syncStickyOffset(app, fixedTop);

    if (activeTab === 'settings') {
      renderSettingsPanel();
    } else if (activeTab === 'regex') {
      const regexPage = document.createElement('div');
      regexPage.className = 'bt-regex-page';
      regexPage.append(
        ...(getUiMode() === 'bilingual' ? [renderSingleRuleSection(state, 'exclude')] : []),
        renderSingleRuleSection(state, 'translation'),
        renderSingleRuleSection(state, 'context')
      );
      app.appendChild(regexPage);

    } else {
      app.appendChild(renderGlossarySection(state));
    }

    if (restoreScrollTop !== null) {
      requestAnimationFrame(() => {
        app.scrollTop = restoreScrollTop;
      });
    }
  }

  async function showRuleManager() {
    if (glossarySaveTimer) await persistGlossaryStateNow(memoryGlossaryState);
    await glossarySaveChain;
    await loadGlossaryState();
    const [state, configState, theme] = await Promise.all([
      loadRuleState(),
      loadConfigState(),
      typeof Risuai.getColorScheme === 'function'
        ? Promise.resolve(Risuai.getColorScheme()).catch(() => null)
        : Promise.resolve(null),
    ]);

    memoryConfigState = configState;
    resetSettingsDraft();
    setDocumentTheme(theme);
    installRuleManagerShell();
    renderRuleList(state, 'settings');
    await Risuai.showContainer('fullscreen');
  }

  /* ---------------- Source extraction ---------------- */

  function getMessageContent(message) {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;

    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        })
        .join('');
    }

    return '';
  }

  function roleMatches(message, wantedRole) {
    if (!wantedRole || wantedRole === 'any') return true;
    return String(message?.role ?? '').toLowerCase() === wantedRole;
  }

  function extractFromMessage(content, config) {
    if (!content) return null;

    let sourceStart = 0;
    let startMatch = null;

    if (config.sourceStartPattern) {
      startMatch = findLastPattern(content, config.sourceStartPattern);
      if (!startMatch) return null;
      sourceStart = startMatch.end;
    }

    let sourceEnd = content.length;
    let endMatch = null;

    if (config.sourceEndPattern) {
      endMatch = findFirstPatternAfter(
        content,
        config.sourceEndPattern,
        sourceStart
      );

      if (!endMatch) return null;
      sourceEnd = endMatch.index;
    }

    const rawSource = content.slice(sourceStart, sourceEnd);
    const source = rawSource.trim();

    if (!source) return null;

    return {
      source,
      sourceStart,
      sourceEnd,
      rawSourceStartPreview: content
        .slice(Math.max(0, sourceStart - 120), Math.min(content.length, sourceStart + 240)),
      startMatch,
      endMatch,
    };
  }

  function extractSource(messages, config) {
    if (!Array.isArray(messages)) {
      return {
        source: '',
        messageIndex: -1,
        role: 'unknown',
        sourceStart: -1,
        sourceEnd: -1,
        rawSourceStartPreview: '',
      };
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      if (!roleMatches(messages[i], config.sourceMessageRole)) continue;

      const content = getMessageContent(messages[i]);
      const extracted = extractFromMessage(content, config);

      if (extracted?.source) {
        log(config, `source matched in role=${messages[i]?.role ?? 'unknown'}, messageIndex=${i}`);
        log(
          config,
          `source preview: ${JSON.stringify(extracted.source.slice(0, 300))}`
        );

        return {
          ...extracted,
          messageIndex: i,
          role: messages[i]?.role ?? 'unknown',
        };
      }
    }

    warn(config, 'source pattern not found.');

    return {
      source: '',
      messageIndex: -1,
      role: 'unknown',
      sourceStart: -1,
      sourceEnd: -1,
      rawSourceStartPreview: '',
    };
  }

  /* ---------------- Recent chat context ---------------- */

  function normalizeComparableText(value) {
    return String(value ?? '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sourceLikelyMatches(messageText, sourceText) {
    const directMessage = String(messageText ?? '').trim();
    const directSource = String(sourceText ?? '').trim();
    if (!directMessage || !directSource) return false;
    if (directMessage === directSource) return true;

    const message = normalizeComparableText(directMessage);
    const source = normalizeComparableText(directSource);
    if (!message || !source) return false;
    if (message === source) return true;

    const shorter = message.length <= source.length ? message : source;
    const longer = message.length > source.length ? message : source;
    return shorter.length >= 80 && shorter.length / longer.length >= 0.72
      ? longer.includes(shorter)
      : false;
  }

  function findSourceChatMessageIndex(chatMessages, source) {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (sourceLikelyMatches(chatMessages[i]?.data, source)) return i;
    }
    return -1;
  }

  function isUsableContextMessage(message) {
    const role = String(message?.role ?? '').toLowerCase();
    if (!['user', 'char', 'assistant'].includes(role)) return false;
    if (message?.disabled === true) return false;

    const data = String(message?.data ?? '').trim();
    if (!data || data === '{{none}}' || data === '{{blank}}') return false;
    if (/^\{\{specialcomment::/i.test(data)) return false;
    return true;
  }

  function collectRecentContextMessages(chatMessages, targetIndex, config) {
    const result = [];
    let remaining = config.translationContextMaxChars;

    for (
      let i = Math.min(targetIndex - 1, chatMessages.length - 1);
      i >= 0 && result.length < config.translationContextMessages && remaining > 0;
      i--
    ) {
      const message = chatMessages[i];
      if (!isUsableContextMessage(message)) continue;

      const effectiveContextRules = [
        ...BUILTIN_CONTEXT_RULES,
        ...(config.contextRules ?? []),
      ];

      let data = applyContextRules(
        String(message.data ?? ''),
        effectiveContextRules,
        config
      ).trim();
      if (!data) continue;
      let truncated = false;
      if (data.length > remaining) {
        const marker = '[...truncated]\n';
        if (remaining <= marker.length) {
          data = data.slice(-remaining);
        } else {
          const available = remaining - marker.length;
          data = `${marker}${data.slice(-available)}`;
        }
        truncated = true;
      }

      if (data) {
        result.unshift({
          role: String(message.role ?? '').toLowerCase(),
          data,
          messageIndex: i,
        });
        remaining -= data.length;
      }

      if (truncated) break;
    }

    return result;
  }

  function buildRecentContextBlock(contextMessages, config) {
    if (!contextMessages.length) return '';
    const body = contextMessages.map(message => {
      const label = message.role === 'user'
        ? config.translationContextUserLabel
        : config.translationContextCharacterLabel;
      return [label, message.data].filter(Boolean).join('\n');
    }).join('\n\n');
    return [config.translationContextWrapperTop, body, config.translationContextWrapperBottom]
      .filter(Boolean).join('\n\n').trim();
  }

  async function resolveRecentContext(extracted, config) {
    if (
      !config.translationContextEnabled ||
      config.translationContextMessages <= 0 ||
      config.translationContextMaxChars <= 0
    ) return null;

    const startedAt = performance.now();

    if (
      typeof Risuai.getCurrentCharacterIndex !== 'function' ||
      typeof Risuai.getCurrentChatIndex !== 'function' ||
      typeof Risuai.getChatFromIndex !== 'function'
    ) return null;

    let characterIndex;
    let chatIndex;
    try {
      [characterIndex, chatIndex] = await Promise.all([
        Risuai.getCurrentCharacterIndex(),
        Risuai.getCurrentChatIndex(),
      ]);
      characterIndex = Number(characterIndex);
      chatIndex = Number(chatIndex);
    } catch {
      return null;
    }

    let chat;
    try {
      chat = await Risuai.getChatFromIndex(characterIndex, chatIndex);
    } catch {
      return null;
    }

    const chatMessages = Array.isArray(chat?.message) ? chat.message : [];
    if (chatMessages.length === 0) return null;

    let targetIndex = -1;
    let route = '';
    const tailIndex = chatMessages.length - 1;
    if (sourceLikelyMatches(chatMessages[tailIndex]?.data, extracted.source)) {
      targetIndex = tailIndex;
      route = 'latest-message-match';
    }

    if (
      targetIndex < 0 &&
      latestOutputHint &&
      latestOutputHint.characterIndex === characterIndex &&
      latestOutputHint.chatIndex === chatIndex &&
      latestOutputHint.messageIndex >= 0 &&
      latestOutputHint.messageIndex < chatMessages.length &&
      sourceLikelyMatches(
        chatMessages[latestOutputHint.messageIndex]?.data,
        extracted.source
      )
    ) {
      targetIndex = latestOutputHint.messageIndex;
      route = 'output-index';
    }

    if (targetIndex < 0) {
      targetIndex = findSourceChatMessageIndex(chatMessages, extracted.source);
      if (targetIndex >= 0) route = 'source-match';
    }

    if (targetIndex < 0) {
      targetIndex = chatMessages.length - 1;
      route = 'chat-tail';
      warn(config, 'source not matched; using final chat message as context target.');
    }

    const contextMessages = collectRecentContextMessages(
      chatMessages,
      targetIndex,
      config
    );
    log(config, `context target: route=${route}, characterIndex=${characterIndex}, ` +
      `chatIndex=${chatIndex}, targetIndex=${targetIndex}, chatLength=${chatMessages.length}, ` +
      `contextIndices=${contextMessages.map(message => message.messageIndex).join(',')}`);
    if (contextMessages.length === 0) return null;

    const block = buildRecentContextBlock(contextMessages, config);
    if (!block) return null;

    return {
      block,
      route,
      targetIndex,
      includedMessages: contextMessages.length,
      includedChars: contextMessages.reduce(
        (sum, message) => sum + message.data.length,
        0
      ),
      lookupMs: performance.now() - startedAt,
    };
  }

  function injectRecentContext(messages, extracted, contextResult) {
    if (!Array.isArray(messages) || !contextResult?.block) return messages;
    const requestMessage = messages[extracted.messageIndex];
    if (!requestMessage || typeof requestMessage.content !== 'string') {
      return messages;
    }

    const content = requestMessage.content;
    const insertionIndex = extracted.startMatch?.index ?? 0;
    if (insertionIndex < 0 || insertionIndex > content.length) return messages;

    const before = content.slice(0, insertionIndex);
    const after = content.slice(insertionIndex);
    const beforeSeparator = !before
      ? ''
      : before.endsWith('\n\n')
        ? ''
        : before.endsWith('\n')
          ? '\n'
          : '\n\n';
    const afterSeparator = contextResult.block.endsWith('\n\n')
      ? ''
      : contextResult.block.endsWith('\n')
        ? '\n'
        : '\n\n';

    const nextMessages = messages.slice();
    nextMessages[extracted.messageIndex] = {
      ...requestMessage,
      content:
        before +
        beforeSeparator +
        contextResult.block +
        afterSeparator +
        after,
    };
    return nextMessages;
  }

  function regexForReplaceAll(regex) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    return new RegExp(regex.source, flags);
  }

  function removePattern(text, pattern) {
    if (typeof pattern === 'string') {
      if (!pattern) return text;
      return text.split(pattern).join('');
    }

    if (pattern instanceof RegExp) {
      return text.replace(regexForReplaceAll(pattern), '');
    }

    return text;
  }

  function cleanTranslationOutput(translated, config) {
    let text = String(translated ?? '');
    const reasoningBlocks = [];
    text = text.replace(/<thoughts\b[^>]*>[\s\S]*?<\/thoughts>/gi, (block) => {
      reasoningBlocks.push(block);
      return '';
    });

    for (const pattern of config.translationStripPatterns ?? []) {
      text = removePattern(text, pattern);
    }

    text = applyTranslationRules(text, config.translationRules, config);

    return {
      text: text.trim(),
      reasoningBlocks: config.keepReasoningBlocks ? reasoningBlocks : [],
    };
  }

  function prependReasoningBlocks(result, reasoningBlocks) {
    const body = String(result ?? '');
    if (!reasoningBlocks?.length) return body;
    const prefix = reasoningBlocks.join('\n\n');
    return body ? `${prefix}\n\n${body}` : prefix;
  }

  /* ---------------- Markdown-aware block processing ---------------- */

  function stripOuterParagraphTag(value) {
    const text = value.trim();
    const match = text.match(/^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/i);
    return match ? match[1].trim() : text;
  }

  function makeMarkdownBlock(type, lines) {
    return {
      type,
      text: lines.join('\n').trim(),
    };
  }

  function getFenceInfo(line) {
    const match = String(line ?? '').match(/^ {0,3}(`{3,}|~{3,})/);
    if (!match) return null;
    return {
      marker: match[1][0],
      length: match[1].length,
    };
  }

  function isFenceClose(line, fence) {
    if (!fence) return false;
    const marker = fence.marker === '`' ? '`' : '~';
    const escapedMarker = marker === '`' ? '`' : '~';
    return new RegExp(
      `^ {0,3}${escapedMarker}{${fence.length},}[ \\t]*$`
    ).test(String(line ?? ''));
  }

  function getListType(line) {
    if (/^\s*[-+*][ \t]+/.test(line)) return 'unordered-list';
    if (/^\s*\d+[.)][ \t]+/.test(line)) return 'ordered-list';
    return null;
  }

  function isHeadingLine(line) {
    return /^ {0,3}#{1,6}[ \t]+/.test(line);
  }

  function isQuoteLine(line) {
    return /^ {0,3}>/.test(line);
  }

  function splitTableRow(line) {
    const text = String(line ?? '');
    const parts = [];
    let current = '';
    let codeTickLength = 0;
    let separatorCount = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '\\' && i + 1 < text.length) {
        current += char + text[i + 1];
        i++;
        continue;
      }

      if (char === '`') {
        let runLength = 1;
        while (text[i + runLength] === '`') runLength++;

        if (codeTickLength === 0) codeTickLength = runLength;
        else if (codeTickLength === runLength) codeTickLength = 0;

        current += text.slice(i, i + runLength);
        i += runLength - 1;
        continue;
      }

      if (char === '|' && codeTickLength === 0) {
        parts.push(current);
        current = '';
        separatorCount++;
        continue;
      }

      current += char;
    }

    parts.push(current);

    const leadingPipe = /^\s*\|/.test(text);
    const trailingPipe = /\|\s*$/.test(text);
    const firstCell = leadingPipe ? 1 : 0;
    const lastCellExclusive = parts.length - (trailingPipe ? 1 : 0);

    return {
      parts,
      separatorCount,
      leadingPipe,
      trailingPipe,
      firstCell,
      lastCellExclusive,
      columnCount: Math.max(0, lastCellExclusive - firstCell),
    };
  }

  function isTableDelimiterLine(line) {
    const parsed = splitTableRow(line);
    if (parsed.separatorCount === 0 || parsed.columnCount === 0) return false;

    return parsed.parts
      .slice(parsed.firstCell, parsed.lastCellExclusive)
      .every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
  }

  function isTableStart(lines, index) {
    if (index + 1 >= lines.length) return false;
    const header = splitTableRow(lines[index]);
    return header.separatorCount > 0 && isTableDelimiterLine(lines[index + 1]);
  }

  function getSpecialBlockStart(lines, index) {
    const line = lines[index] ?? '';
    if (getFenceInfo(line)) return 'code';
    if (isTableStart(lines, index)) return 'table';
    if (isHeadingLine(line)) return 'heading';
    if (isQuoteLine(line)) return 'quote';
    return getListType(line);
  }

  function splitMarkdownBlocks(value) {
    const text = String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .trim();

    if (!text) return [];

    const pMatches = [...text.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi)];
    if (pMatches.length >= 2) {
      return pMatches
        .map((match) => stripOuterParagraphTag(match[0]))
        .filter(Boolean)
        .map((part) => makeMarkdownBlock('normal', [part]));
    }

    const lines = text.split('\n');
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      if (!lines[index].trim()) {
        index++;
        continue;
      }

      const startType = getSpecialBlockStart(lines, index);

      if (startType === 'code') {
        const fence = getFenceInfo(lines[index]);
        const blockLines = [lines[index++]];

        while (index < lines.length) {
          const line = lines[index++];
          blockLines.push(line);
          if (isFenceClose(line, fence)) break;
        }

        blocks.push(makeMarkdownBlock('code', blockLines));
        continue;
      }

      if (startType === 'table') {
        const blockLines = [lines[index++], lines[index++]];

        while (index < lines.length && lines[index].trim()) {
          const parsed = splitTableRow(lines[index]);
          if (parsed.separatorCount === 0) break;
          blockLines.push(lines[index++]);
        }

        blocks.push(makeMarkdownBlock('table', blockLines));
        continue;
      }

      if (startType === 'heading') {
        blocks.push(makeMarkdownBlock('heading', [lines[index++]]));
        continue;
      }

      if (startType === 'quote') {
        const blockLines = [];
        while (index < lines.length && isQuoteLine(lines[index])) {
          blockLines.push(lines[index++]);
        }
        blocks.push(makeMarkdownBlock('quote', blockLines));
        continue;
      }

      if (startType === 'unordered-list' || startType === 'ordered-list') {
        const blockLines = [];
        while (index < lines.length && getListType(lines[index]) === startType) {
          blockLines.push(lines[index++]);
        }
        blocks.push(makeMarkdownBlock(startType, blockLines));
        continue;
      }

      const blockLines = [];
      while (index < lines.length && lines[index].trim()) {
        if (blockLines.length > 0 && getSpecialBlockStart(lines, index)) break;
        blockLines.push(lines[index++]);
      }

      if (blockLines.length > 0) {
        blocks.push(makeMarkdownBlock('normal', blockLines));
      }
    }

    return blocks;
  }

  function matchesPattern(text, pattern) {
    if (typeof pattern === 'string') {
      return pattern.length > 0 && text.includes(pattern);
    }

    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      return pattern.test(text);
    }

    return false;
  }

  function shouldExcludeSource(sourcePart, config) {
    if (!sourcePart) return false;

    const excludedByArgument = (config.excludeSourcePatterns ?? []).some(
      (pattern) => matchesPattern(sourcePart, pattern)
    );

    if (excludedByArgument) return true;

    return (config.uiExcludeRules ?? []).some((rule) =>
      matchesUiExcludeRule(sourcePart, rule, config)
    );
  }

  function formatSource(sourcePart, config) {
    if (!config.useSourceSpan) return sourcePart;

    const styles = [];

    if (config.sourceColor) {
      styles.push(`color: ${config.sourceColor};`);
    }

    if (config.sourceExtraStyle.trim()) {
      styles.push(config.sourceExtraStyle.trim());
    }

    const attrs = [];

    if (config.sourceClass.trim()) {
      attrs.push(`class="${config.sourceClass.trim()}"`);
    }

    if (styles.length > 0) {
      attrs.push(`style="${styles.join(' ')}"`);
    }

    return attrs.length > 0
      ? `<span ${attrs.join(' ')}>${sourcePart}</span>`
      : `<span>${sourcePart}</span>`;
  }

  function makeMarkdownSeparator(separator, blankLine = true) {
    const normalized = String(separator ?? '').replace(/\r\n?/g, '\n');
    const core = normalized.replace(/^\n+|\n+$/g, '');

    if (!core.trim()) return blankLine ? '\n\n' : '\n';
    return blankLine ? `\n\n${core}\n\n` : `\n${core}\n`;
  }

  function parseListLine(line, type) {
    const regex = type === 'ordered-list'
      ? /^(\s*\d+[.)][ \t]+)(.*)$/
      : /^(\s*[-+*][ \t]+)(.*)$/;
    const match = String(line ?? '').match(regex);
    if (!match) return null;
    return {
      prefix: match[1],
      content: match[2],
    };
  }

  function renderInterleavedList(sourceBlock, translatedBlock, config) {
    const sourceLines = sourceBlock.text.split('\n');
    const translatedLines = translatedBlock.text.split('\n');
    if (sourceLines.length !== translatedLines.length) return null;

    const output = [];
    for (let i = 0; i < sourceLines.length; i++) {
      const sourceItem = parseListLine(sourceLines[i], sourceBlock.type);
      const translatedItem = parseListLine(translatedLines[i], translatedBlock.type);
      if (!sourceItem || !translatedItem) return null;

      output.push(`${sourceItem.prefix}${formatSource(sourceItem.content, config)}`);
      output.push(`${translatedItem.prefix}${translatedItem.content}`);
    }

    return output.join('\n');
  }

  function renderSourceList(sourceBlock, config) {
    const output = [];
    for (const line of sourceBlock.text.split('\n')) {
      const item = parseListLine(line, sourceBlock.type);
      if (!item) return sourceBlock.text;
      output.push(`${item.prefix}${formatSource(item.content, config)}`);
    }
    return output.join('\n');
  }

  function renderHeadingSource(sourceBlock, config) {
    const match = sourceBlock.text.match(/^( {0,3}#{1,6}[ \t]+)(.*)$/);
    if (!match) return sourceBlock.text;
    return `${match[1]}${formatSource(match[2], config)}`;
  }

  function wrapTableCell(cell, config) {
    const match = String(cell ?? '').match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match || !match[2]) return cell;
    return `${match[1]}${formatSource(match[2], config)}${match[3]}`;
  }

  function getTableShape(block) {
    return block.text.split('\n').map((line) => splitTableRow(line).columnCount);
  }

  function tablesAreCompatible(sourceBlock, translatedBlock) {
    const sourceShape = getTableShape(sourceBlock);
    const translatedShape = getTableShape(translatedBlock);
    return (
      sourceShape.length === translatedShape.length &&
      sourceShape.every(
        (columnCount, index) =>
          columnCount > 0 && columnCount === translatedShape[index]
      )
    );
  }

  function renderTableSource(sourceBlock, config) {
    return sourceBlock.text
      .split('\n')
      .map((line, rowIndex) => {
        if (rowIndex < 2) return line;

        const parsed = splitTableRow(line);
        if (parsed.columnCount === 0) return line;

        const parts = parsed.parts.map((cell, index) => {
          if (index < parsed.firstCell || index >= parsed.lastCellExclusive) {
            return cell;
          }
          return wrapTableCell(cell, config);
        });

        return parts.join('|');
      })
      .join('\n');
  }

  function renderSourceOnly(block, config) {
    if (!block?.text) return '';

    switch (block.type) {
      case 'heading':
        return renderHeadingSource(block, config);
      case 'unordered-list':
      case 'ordered-list':
        return renderSourceList(block, config);
      case 'table':
        return renderTableSource(block, config);
      case 'quote':
      case 'code':
        return block.text;
      default:
        return formatSource(block.text, config);
    }
  }

  function renderMarkdownPair(sourceBlock, translatedBlock, config, index) {
    const sourceText = sourceBlock?.text ?? '';
    const translatedText = translatedBlock?.text ?? '';

    if (sourceText && shouldExcludeSource(sourceText, config)) {
      log(config, `source block ${index + 1} excluded by pattern`);
      return {
        text: translatedText,
        markdown: translatedBlock?.type !== 'normal',
      };
    }

    if (!sourceText) {
      return {
        text: translatedText,
        markdown: translatedBlock?.type !== 'normal',
      };
    }

    if (!translatedText) {
      return {
        text: renderSourceOnly(sourceBlock, config),
        markdown: sourceBlock.type !== 'normal',
      };
    }

    if (sourceBlock.type !== translatedBlock.type) {
      return {
        text: `${sourceText}${makeMarkdownSeparator(
          config.sourceTranslationSeparator,
          true
        )}${translatedText}`,
        markdown: true,
      };
    }

    switch (sourceBlock.type) {
      case 'unordered-list':
      case 'ordered-list': {
        const rendered = renderInterleavedList(
          sourceBlock,
          translatedBlock,
          config
        );
        return rendered
          ? { text: rendered, markdown: true }
          : {
              text: `${sourceText}${makeMarkdownSeparator(
                config.sourceTranslationSeparator,
                true
              )}${translatedText}`,
              markdown: true,
            };
      }

      case 'heading':
        return {
          text: `${renderHeadingSource(
            sourceBlock,
            config
          )}${makeMarkdownSeparator(
            config.sourceTranslationSeparator,
            false
          )}${translatedText}`,
          markdown: true,
        };

      case 'quote':
      case 'code':
        return {
          text: `${sourceText}${makeMarkdownSeparator(
            config.sourceTranslationSeparator,
            true
          )}${translatedText}`,
          markdown: true,
        };

      case 'table':
        return {
          text: tablesAreCompatible(sourceBlock, translatedBlock)
            ? `${renderTableSource(
                sourceBlock,
                config
              )}${makeMarkdownSeparator(
                config.sourceTranslationSeparator,
                true
              )}${translatedText}`
            : `${sourceText}${makeMarkdownSeparator(
                config.sourceTranslationSeparator,
                true
              )}${translatedText}`,
          markdown: true,
        };

      default:
        return {
          text: `${formatSource(sourceText, config)}${
            config.sourceTranslationSeparator
          }${translatedText}`,
          markdown: false,
        };
    }
  }

  function joinRenderedBlocks(blocks, config) {
    let result = '';
    let previous = null;

    for (const block of blocks.filter((item) => item?.text)) {
      if (result) {
        result += previous?.markdown || block.markdown
          ? makeMarkdownSeparator(config.pairSeparator, true)
          : config.pairSeparator;
      }
      result += block.text;
      previous = block;
    }

    return result;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function debugLine(value) {
    return escapeHtml(JSON.stringify(String(value ?? '')));
  }

  function makeDebugBlock(
    source,
    translated,
    sourceBlocks,
    translatedBlocks,
    meta,
    rawTranslated = translated
  ) {
    const sourcePreview = source.slice(0, 350);
    const translationPreview = translated.slice(0, 350);
    const rawTranslationPreview = rawTranslated.slice(0, 350);
    const aroundStart = meta?.rawSourceStartPreview ?? '';

    const sourceFirst = sourceBlocks.slice(0, 5)
      .map(
        (block, i) =>
          `${i} [${block.type}]: ${JSON.stringify(block.text.slice(0, 180))}`
      )
      .join('\n');

    const translationFirst = translatedBlocks.slice(0, 5)
      .map(
        (block, i) =>
          `${i} [${block.type}]: ${JSON.stringify(block.text.slice(0, 180))}`
      )
      .join('\n');

    return [
      '<div style="font-size:0.82em; opacity:0.82; border:1px dashed currentColor; padding:0.6em; margin-bottom:0.8em; overflow-wrap:anywhere;">',
      '<b>[Bilingual Translation DEBUG]</b><br>',
      `message index: ${meta?.messageIndex ?? '?'} / role: ${escapeHtml(meta?.role ?? '?')}<br>`,
      `source chars: ${source.length} / translated chars: ${translated.length} / raw translated chars: ${rawTranslated.length}<br>`,
      `source range: ${meta?.sourceStart ?? '?'} → ${meta?.sourceEnd ?? '?'}<br>`,
      `source blocks: ${sourceBlocks.length}<br>`,
      `translation blocks: ${translatedBlocks.length}<br>`,
      '<details open><summary>source preview (JSON)</summary>',
      `<pre style="white-space:pre-wrap; margin:0.35em 0;">${debugLine(sourcePreview)}</pre>`,
      '</details>',
      '<details><summary>text around detected source start</summary>',
      `<pre style="white-space:pre-wrap; margin:0.35em 0;">${debugLine(aroundStart)}</pre>`,
      '</details>',
      '<details open><summary>first 5 source blocks</summary>',
      `<pre style="white-space:pre-wrap; margin:0.35em 0;">${escapeHtml(sourceFirst)}</pre>`,
      '</details>',
      '<details open><summary>first 5 translation blocks</summary>',
      `<pre style="white-space:pre-wrap; margin:0.35em 0;">${escapeHtml(translationFirst)}</pre>`,
      '</details>',
      '<details><summary>clean translation preview (JSON)</summary>',
      `<pre style="white-space:pre-wrap; margin:0.35em 0;">${debugLine(translationPreview)}</pre>`,
      '</details>',
      '<details><summary>raw translation preview (JSON)</summary>',
      `<pre style="white-space:pre-wrap; margin:0.35em 0;">${debugLine(rawTranslationPreview)}</pre>`,
      '</details>',
      '</div>'
    ].join('');
  }

  function makeBilingual(source, translated, config, meta = {}) {
    const rawTranslated = String(translated ?? '');
    const {
      text: cleanedTranslated,
      reasoningBlocks,
    } = cleanTranslationOutput(rawTranslated, config);

    const sourceBlocks = splitMarkdownBlocks(source);
    const translatedBlocks = splitMarkdownBlocks(cleanedTranslated);

    log(
      config,
      `blocks: source=${sourceBlocks.length}, translation=${translatedBlocks.length}`
    );

    if (sourceBlocks.length !== translatedBlocks.length) {
      warn(
        config,
        `block mismatch: source=${sourceBlocks.length}, translation=${translatedBlocks.length}`
      );
    }

    const maxLength = Math.max(
      sourceBlocks.length,
      translatedBlocks.length
    );

    const renderedBlocks = [];

    for (let i = 0; i < maxLength; i++) {
      renderedBlocks.push(
        renderMarkdownPair(sourceBlocks[i], translatedBlocks[i], config, i)
      );
    }

    const result = joinRenderedBlocks(renderedBlocks, config);

    if (config.debug) {
      return prependReasoningBlocks(
        makeDebugBlock(
          source,
          cleanedTranslated,
          sourceBlocks,
          translatedBlocks,
          meta,
          rawTranslated
        ) + result,
        reasoningBlocks
      );
    }

    return prependReasoningBlocks(result, reasoningBlocks);
  }

  /* ---------------- Dialogue-only processing ---------------- */

  function findDoubleQuotedSegments(value) {
    const text = String(value ?? '');
    const segments = [];
    const openToClose = {
      '“': '”',
      '"': '"',
      '「': '」',
      '『': '』',
    };
    let open = '';
    let close = '';
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (!open) {
        if (!(char in openToClose)) continue;
        if (char === '"' && i > 0 && text[i - 1] === '\\') continue;
        open = char;
        close = openToClose[char];
        start = i;
        continue;
      }

      if (char !== close) continue;
      if (char === '"' && i > 0 && text[i - 1] === '\\') continue;

      segments.push({
        start,
        end: i + 1,
        contentStart: start + 1,
        contentEnd: i,
        content: text.slice(start + 1, i),
      });
      open = '';
      close = '';
      start = -1;
    }

    return segments;
  }

  function formatSourceParenthetical(sourcePart, config, allowSpan = true) {
    const parenthetical = `(${sourcePart})`;
    if (!allowSpan || !config.useSourceSpan) return parenthetical;
    return formatSource(parenthetical, config);
  }

  function splitParagraphBlocks(value) {
    const text = String(value ?? '');
    const blocks = [];
    const lineRegex = /.*(?:\r\n|\n|$)/g;
    let blockStart = -1;
    let blockEnd = -1;
    let match;

    while ((match = lineRegex.exec(text)) && match[0] !== '') {
      const fullLine = match[0];
      const lineText = fullLine.replace(/(?:\r\n|\n)$/, '');
      const lineStart = match.index;
      const lineEnd = lineStart + lineText.length;

      if (/^[ \t]*$/.test(lineText)) {
        if (blockStart >= 0) {
          blocks.push({
            start: blockStart,
            end: blockEnd,
            text: text.slice(blockStart, blockEnd),
          });
          blockStart = -1;
          blockEnd = -1;
        }
      } else {
        if (blockStart < 0) blockStart = lineStart;
        blockEnd = lineEnd;
      }

      if (lineRegex.lastIndex >= text.length) break;
    }

    if (blockStart >= 0) {
      blocks.push({
        start: blockStart,
        end: blockEnd,
        text: text.slice(blockStart, blockEnd),
      });
    }

    return blocks;
  }

  function isStandaloneUppercaseBlock(value) {
    const text = String(value ?? '').trim();
    if (!text || findDoubleQuotedSegments(text).length > 0) return false;
    if (/^(?: {0,3}#{1,6}[ \t]| {0,3}(?:[-+*]|\d+[.)])[ \t]| {0,3}>| {0,3}(?:```|~~~)| {0,3}\|)/m.test(text)) {
      return false;
    }

    const letters = text.match(/[A-Za-z]/g) ?? [];
    return letters.length >= 2 && !/[a-z]/.test(text);
  }

  function collectUppercaseBlockEdits(source, translated, config) {
    if (!config.uppercaseBlockPairing) {
      return { edits: [], sourceBlocks: 0, translatedBlocks: 0, safe: false };
    }

    const sourceBlocks = splitParagraphBlocks(source);
    const translatedBlocks = splitParagraphBlocks(translated);
    const safe =
      sourceBlocks.length > 0 && sourceBlocks.length === translatedBlocks.length;

    if (!safe) {
      return {
        edits: [],
        sourceBlocks: sourceBlocks.length,
        translatedBlocks: translatedBlocks.length,
        safe: false,
      };
    }

    const edits = [];
    for (let i = 0; i < sourceBlocks.length; i++) {
      const sourceText = sourceBlocks[i].text.trim();
      const translatedText = translatedBlocks[i].text.trim();
      if (!isStandaloneUppercaseBlock(sourceText)) continue;
      if (sourceText === translatedText) continue;

      edits.push({
        start: translatedBlocks[i].end,
        end: translatedBlocks[i].end,
        replacement: ` ${formatSourceParenthetical(sourceText, config)}`,
        kind: 'uppercase',
      });
    }

    return {
      edits,
      sourceBlocks: sourceBlocks.length,
      translatedBlocks: translatedBlocks.length,
      safe: true,
    };
  }

  function applyTextEdits(value, edits) {
    let result = String(value ?? '');
    const ordered = [...edits].sort((a, b) => {
      if (a.start !== b.start) return b.start - a.start;
      return b.end - a.end;
    });

    for (const edit of ordered) {
      result =
        result.slice(0, edit.start) +
        edit.replacement +
        result.slice(edit.end);
    }

    return result;
  }

  function makeDialogueOnly(source, translated, config, meta = {}) {
    const rawTranslated = String(translated ?? '');
    const {
      text: cleanedTranslated,
      reasoningBlocks,
    } = cleanTranslationOutput(rawTranslated, config);
    const sourceDialogues = findDoubleQuotedSegments(source);
    const translatedDialogues = findDoubleQuotedSegments(cleanedTranslated);
    const pairCount = Math.min(sourceDialogues.length, translatedDialogues.length);

    log(
      config,
      `dialogues: source=${sourceDialogues.length}, translation=${translatedDialogues.length}`
    );

    if (sourceDialogues.length !== translatedDialogues.length) {
      warn(
        config,
        `dialogue mismatch: source=${sourceDialogues.length}, translation=${translatedDialogues.length}`
      );
    }

    const edits = [];
    for (let i = 0; i < pairCount; i++) {
      const sourceDialogue = sourceDialogues[i];
      const translatedDialogue = translatedDialogues[i];
      const original = formatSourceParenthetical(
        sourceDialogue.content,
        config,
        config.dialogueSourcePosition === 'outside'
      );
      if (config.dialogueSourcePosition === 'inside') {
        edits.push({
          start: translatedDialogue.contentEnd,
          end: translatedDialogue.contentEnd,
          replacement: ` ${original}`,
          kind: 'dialogue',
        });
      } else {
        edits.push({
          start: translatedDialogue.end,
          end: translatedDialogue.end,
          replacement: original,
          kind: 'dialogue',
        });
      }
    }

    const uppercase = collectUppercaseBlockEdits(
      source,
      cleanedTranslated,
      config
    );
    edits.push(...uppercase.edits);
    const result = applyTextEdits(cleanedTranslated, edits);

    if (config.debug) {
      const details = [
        '<div style="border:1px solid #888;padding:0.7em;margin:0 0 1em;">',
        '<strong>[Dialogue Translation DEBUG]</strong><br>',
        `source dialogues: ${sourceDialogues.length}<br>`,
        `translation dialogues: ${translatedDialogues.length}<br>`,
        `paired dialogues: ${pairCount}<br>`,
        `dialogue source position: ${config.dialogueSourcePosition}<br>`,
        `uppercase block structure safe: ${uppercase.safe}<br>`,
        `uppercase blocks paired: ${uppercase.edits.length}<br>`,
        `source range: ${meta?.sourceStart ?? '?'} → ${meta?.sourceEnd ?? '?'}<br>`,
        '</div>',
      ].join('');
      return prependReasoningBlocks(details + result, reasoningBlocks);
    }

    return prependReasoningBlocks(result, reasoningBlocks);
  }

  /* ---------------- Risu replacers ---------------- */

  const beforeRequestHandler = async (messages, type) => {
    if (type !== 'translate') return messages;

    const generation = pendingSourceGeneration;
    const config = await getConfig();
    if (generation !== pendingSourceGeneration) return messages;
    if (config.pluginEnabled && config.retryGuardEnabled && findRetryGuard(messages)) {
      log(config, 'retry guard: already processed request; skipping repeated capture and injection.');
      return messages;
    }
    if (!config.pluginEnabled) {
      pendingSources.push({ disabled: true, generation, capturedAt: Date.now() });
      return messages;
    }
    if (glossarySaveTimer) await persistGlossaryStateNow(memoryGlossaryState);
    await glossarySaveChain;
    const glossary = await loadGlossaryState();
    if (generation !== pendingSourceGeneration) return messages;
    if (!config.enabled && !config.translationContextEnabled && !glossary.entries.some(entry => entry.enabled && entry.input && entry.guide.trim())) {
      pendingSources.push({ disabled: true, generation, capturedAt: Date.now() });
      return messages;
    }
    const extracted = extractSource(messages, config);
    const source = extracted.source;

    const pending = {
      ...extracted,
      generation,
      capturedAt: Date.now(),
    };

    log(config, `captured source (${source.length} chars)`);

    const glossaryBlock = source ? collectGlossaryGuidance(source, glossary, config) : '';
    if (!source || !config.translationContextEnabled) {
      return capturePendingSource(
        appendGlossaryGuidance(messages, glossaryBlock), pending, config
      );
    }

    let requestMessages = messages;
    try {
      const contextResult = await resolveRecentContext(extracted, config);
      if (!contextResult) {
        log(config, 'recent context not injected.');
      } else {
        Object.assign(pending, {
          contextRoute: contextResult.route,
          contextTargetIndex: contextResult.targetIndex,
          contextMessages: contextResult.includedMessages,
          contextChars: contextResult.includedChars,
          contextLookupMs: contextResult.lookupMs,
        });
        log(
          config,
          `recent context injected: route=${contextResult.route}, ` +
            `targetIndex=${contextResult.targetIndex}, ` +
            `messages=${contextResult.includedMessages}, ` +
            `chars=${contextResult.includedChars}, ` +
            `lookupMs=${contextResult.lookupMs.toFixed(2)}`
        );
        requestMessages = injectRecentContext(
          messages,
          extracted,
          contextResult
        );
      }
    } catch (error) {
      warn(
        config,
        `recent context injection failed: ${error?.message ?? error}`
      );
    }

    return capturePendingSource(
      appendGlossaryGuidance(requestMessages, glossaryBlock), pending, config
    );
  };

  const afterRequestHandler = async (content, type) => {
    if (type !== 'translate') return content;

    const pending = pendingSources.shift();
    const generation = pendingSourceGeneration;
    const config = await getConfig();
    if (pending?.retryGuardMarker || (config.pluginEnabled && config.retryGuardEnabled)) {
      content = stripRetryGuardFromResponse(content);
    }

    if (generation !== pendingSourceGeneration || pending?.disabled || !config.pluginEnabled || !config.enabled) return content;

    if (!pending?.source) {
      warn(config, 'no captured source; returning translation unchanged.');
      return content;
    }

    try {
      const processor = config.outputMode === 'dialogue' ? makeDialogueOnly : makeBilingual;
      return processor(
        pending.source,
        String(content ?? ''),
        config,
        pending
      );
    } catch (error) {
      console.error(
        `[Versa] post-processing failed: ${error?.message ?? error}`
      );
      return content;
    }
  };

  const chatOutputListener = async ({
    characterIndex,
    chatIndex,
    messageIndex,
  } = {}) => {
    latestOutputHint = {
      characterIndex: Number(characterIndex),
      chatIndex: Number(chatIndex),
      messageIndex: Number(messageIndex),
      capturedAt: Date.now(),
    };
  };

  (async () => {
    try {
      await Risuai.addRisuReplacer('beforeRequest', beforeRequestHandler);
      await Risuai.addRisuReplacer('afterRequest', afterRequestHandler);

      if (typeof Risuai.addRisuChatListener === 'function') {
        await Risuai.addRisuChatListener('output', chatOutputListener);
      }

      await Risuai.registerButton(
        {
          name: `${BUILD_LABEL} 설정`,
          icon: '<img src="https://i.imgur.com/Byt1gYG.png" alt="병기 방식 선택" style="width:24px;height:24px;object-fit:contain;display:block;" />',
          iconType: 'html',
          location: 'hamburger',
        },
        showRuleManager
      );

      const config = await getConfig();
      log(config, 'Versa v1.3.2 loaded.');
    } catch (error) {
      console.error(
        `[Versa] initialization failed: ${error?.message ?? error}`
      );
    }
  })();
})();

