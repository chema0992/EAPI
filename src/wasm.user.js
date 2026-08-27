// ==UserScript==
// @name         엔트리 WASM 비공식 블록 확장
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  엔트리에 WebAssembly 기능을 연결하기 위한 확장 유저스크립트
// @match        *://playentry.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.EAPI = window.EAPI || { modules: [], categories: [] };

    // 1. EAPI 카테고리 등록
    if (!window.EAPI.categories.some(c => c.category === 'WASM')) {
        window.EAPI.categories.push({
            category: 'WASM',
            displayName: 'WASM',
            color: '#E65100',
            fontColor: '#ffffff',
            visible: true
        });
    }


    const wasmBlocks = [
        'wasm_load_module',
        'wasm_is_module_loaded',
        'wasm_call_function_value',
        'wasm_call_function_action',
        'wasm_read_memory',
        'wasm_write_memory',
        'wasm_unload_module'

    ];

    // 2. EAPI 모듈 등록
    window.EAPI.modules.push({
        name: 'WASM Extension',
        init: function(targetWindow, Entry, EntryStatic, $) {
            console.log('[WASM Extension] 모듈 주입 시작');

            // WASM 기본 컬러 테마
            const defaultColor = { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' };

            // 블록 추가용 헬퍼 함수
            const addBlock = (blockname, template, color = defaultColor, params = { params: [], def: [], map: {} }, _class = 'default', func, skeleton = 'basic') => {
                Entry.block[blockname] = {
                    color: color.color,
                    outerLine: color.outerline,
                    fontColor: color.fontColor || '#ffffff',
                    skeleton: skeleton,
                    statement: [],
                    params: params.params,
                    events: {},
                    def: {
                        params: params.def,
                        type: blockname
                    },
                    paramsKeyMap: params.map,
                    class: _class ? _class : 'default',
                    func: func,
                    template: template
                };
            };


            if (!targetWindow.__ENTRY_WASM__) {
                targetWindow.__ENTRY_WASM__ = {
                    modules: {} // 모듈별 인스턴스, exports, 로딩 상태 저장
                };
            }


            addBlock(
                'wasm_load_module',
                'URL %1 에서 WASM 모듈을 %2 (으)로 로드하기 %3',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['https://example.com/sample.wasm'] },
                        { type: 'text', params: ['wasm_0'] },
                        null
                    ],
                    map: { URL: 0, MOD_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state) return script.callReturn();

                    // 수정: script를 두 번째 인자로 전달
                    const url = script.getStringValue('URL', script);
                    const modName = script.getStringValue('MOD_NAME', script);

                    if (!state.modules) state.modules = {};

                    state.modules[modName] = {
                        loaded: false,
                        instance: null,
                        exports: {},
                        error: null
                    };

                    const targetMod = state.modules[modName];

                    // 기본 표준 ImportObject 정의
                    const defaultImportObject = {
                        env: {
                            memory: new WebAssembly.Memory({ initial: 256 }),
                            print: (val) => console.log('[WASM Print]:', val),
                            abort: () => console.error('[WASM] aborted')
                        }
                    };

                    // 비동기 바이너리 로드 및 인스턴스화
                    fetch(url)
                        .then((res) => {
                            if (!res.ok) throw new Error(`HTTP 오류 (${res.status})`);
                            return res.arrayBuffer();
                        })
                        .then((bytes) => WebAssembly.instantiate(bytes, defaultImportObject))
                        .then((results) => {
                            targetMod.instance = results.instance;
                            targetMod.exports = results.instance.exports;
                            targetMod.loaded = true;
                            console.log(`[WASM Extension] 모듈 '${modName}' 로드 완료!`, results.instance.exports);
                        })
                        .catch((err) => {
                            targetMod.error = err.message;
                            console.error(`[WASM Extension] 모듈 '${modName}' 로드 실패:`, err);
                        });

                    return script.callReturn();
                }
            );

            addBlock(
                'wasm_is_module_loaded',
                'WASM 모듈 %1 이 준비 되었는가?',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] }
                    ],
                    map: { MOD_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return false;

                    const modName = script.getStringValue('MOD_NAME');
                    const targetMod = state.modules[modName];

                    return Boolean(targetMod && targetMod.loaded);
                },
                'basic_boolean_field'
            );

            addBlock(
                'wasm_call_function_value',
                'WASM 모듈 %1 의 %2 함수 실행 (인자: %3)',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'text', params: ['add'] },
                        { type: 'text', params: ['10, 20'] }
                    ],
                    map: { MOD_NAME: 0, FUNC_NAME: 1, ARGS: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return 0;

                    const modName = script.getStringValue('MOD_NAME');
                    const funcName = script.getStringValue('FUNC_NAME');
                    const rawArgs = script.getStringValue('ARGS');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || typeof targetMod.exports[funcName] !== 'function') {
                        return 0;
                    }

                    // 인자를 쉼표로 파싱하여 수치형/문자형으로 전달
                    const args = rawArgs.trim() === '' ? [] : rawArgs.split(',').map(v => {
                        const num = Number(v.trim());
                        return isNaN(num) ? v.trim() : num;
                    });

                    try {
                        return targetMod.exports[funcName](...args);
                    } catch (e) {
                        console.error(`[WASM] ${funcName} 함수 실행 오류:`, e);
                        return 0;
                    }
                },
                'basic_string_field'
            );

            addBlock(
                'wasm_call_function_action',
                'WASM 모듈 %1 의 %2 함수 실행하기 (인자: %3) %4',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'text', params: ['update'] },
                        { type: 'text', params: [''] },
                        null
                    ],
                    map: { MOD_NAME: 0, FUNC_NAME: 1, ARGS: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const funcName = script.getStringValue('FUNC_NAME');
                    const rawArgs = script.getStringValue('ARGS');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || typeof targetMod.exports[funcName] !== 'function') {
                        return script.callReturn();
                    }

                    const args = rawArgs.trim() === '' ? [] : rawArgs.split(',').map(v => {
                        const num = Number(v.trim());
                        return isNaN(num) ? v.trim() : num;
                    });

                    try {
                        targetMod.exports[funcName](...args);
                    } catch (e) {
                        console.error(`[WASM] ${funcName} 함수 실행 오류:`, e);
                    }

                    return script.callReturn();
                }
            );
            // 1-1. 메모리 읽기 (Float32, Int32, Uint8 지원)
            addBlock(
                'wasm_read_memory',
                'WASM 모듈 %1 메모리 주소 %2 에서 %3 읽기',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'text', params: ['Float32'] }
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1, TYPE: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return 0;

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const type = script.getStringValue('TYPE');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return 0;

                    const buffer = targetMod.exports.memory.buffer;
                    try {
                        if (type === 'Float32') return new Float32Array(buffer, offset, 1)[0];
                        if (type === 'Int32') return new Int32Array(buffer, offset, 1)[0];
                        if (type === 'Uint8') return new Uint8Array(buffer, offset, 1)[0];
                        return 0;
                    } catch (e) {
                        return 0;
                    }
                },
                'basic_string_field'
            );

            // 1-2. 메모리 쓰기
            addBlock(
                'wasm_write_memory',
                'WASM 모듈 %1 메모리 주소 %2 에 %3 타입으로 값 %4 쓰기 %5',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'text', params: ['Float32'] },
                        { type: 'number', params: [100] },
                        null
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1, TYPE: 2, VALUE: 3 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const type = script.getStringValue('TYPE');
                    const val = script.getNumberValue('VALUE');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return script.callReturn();

                    const buffer = targetMod.exports.memory.buffer;
                    try {
                        if (type === 'Float32') new Float32Array(buffer, offset, 1)[0] = val;
                        else if (type === 'Int32') new Int32Array(buffer, offset, 1)[0] = val;
                        else if (type === 'Uint8') new Uint8Array(buffer, offset, 1)[0] = val;
                    } catch (e) {
                        console.error('[WASM] 메모리 쓰기 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            addBlock(
                'wasm_unload_module',
                'WASM 모듈 %1 메모리 해제하기 %2',
                { color: '#E65100', outerline: '#BF360C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        null
                    ],
                    map: { MOD_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    if (state.modules[modName]) {
                        delete state.modules[modName];
                        console.log(`[WASM] 모듈 '${modName}' 해제 완료`);
                    }

                    return script.callReturn();
                }
            );

            // EntryStatic.getAllBlocks 오버라이딩
            if (EntryStatic && typeof EntryStatic.getAllBlocks === 'function') {
                const originalGetAllBlocks = EntryStatic.getAllBlocks;
                EntryStatic.getAllBlocks = () => {
                    const blocks = originalGetAllBlocks();
                    const hasCustom = blocks.find(c => c.category === 'WASM');
                    if (!hasCustom) {
                        blocks.push({ category: 'WASM', blocks: wasmBlocks });
                    }
                    return blocks;
                };
            }

            console.log('[WASM Extension] 모듈 주입 완료');
        }
    });

    // 3. EAPI Core가 이미 완료된 경우 갱신
    if (typeof window.EAPI.render === 'function') {
        window.EAPI.render();
    }
})();