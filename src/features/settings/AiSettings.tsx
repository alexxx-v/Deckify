import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { loadAiConfig, saveAiConfig } from '@/features/ai/aiConfig';
import { MIN_OLLAMA_VERSION, SMALL_MODEL_THRESHOLD_B, normalizeBaseUrl } from '@/features/ai/ollamaUtils';
import { createOllamaProvider } from '@/features/ai/ollamaProvider';
import { createIpcTransport, isAiAvailable, keyStore } from '@/features/ai/transport';
import type { KeyStatus } from '@/features/ai/transport';
import { aiErrorKey } from '@/features/ai/errorText';
import { AiError } from '@/features/ai/types';
import type { AiMode, ConnectionReport, ModelInfo } from '@/features/ai/types';

const transport = createIpcTransport();

const inputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function formatSize(sizeB: number | null): string {
    if (sizeB === null) return '';
    return sizeB >= 1 ? `${Number(sizeB.toFixed(1))}B` : `${Math.round(sizeB * 1000)}M`;
}

const toAiError = (e: unknown) => (e instanceof AiError ? e : new AiError('bad_response', e instanceof Error ? e.message : String(e)));

export function AiSettings() {
    const { t } = useTranslation();
    const [available] = useState(isAiAvailable);
    const [config, setConfig] = useState(loadAiConfig);
    const [urlInput, setUrlInput] = useState(config.baseUrl);
    const [urlInvalid, setUrlInvalid] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [list, setList] = useState<{ source: unknown; tick: number; models: ModelInfo[]; error: AiError | null } | null>(null);
    const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
    const [keyInput, setKeyInput] = useState('');
    const [testing, setTesting] = useState(false);
    const [report, setReport] = useState<ConnectionReport | null>(null);

    // The model list does not depend on the chosen model, so the lister is rebuilt only for mode/URL changes.
    const lister = useMemo(
        () => createOllamaProvider({ mode: config.mode, baseUrl: config.baseUrl, model: '' }, transport),
        [config.mode, config.baseUrl],
    );
    const loadingModels = available && (!list || list.source !== lister || list.tick !== refreshTick);

    useEffect(() => {
        if (!available) return;
        let cancelled = false;
        lister.listModels().then(
            models => { if (!cancelled) setList({ source: lister, tick: refreshTick, models, error: null }); },
            e => { if (!cancelled) setList({ source: lister, tick: refreshTick, models: [], error: toAiError(e) }); },
        );
        return () => { cancelled = true; };
    }, [available, lister, refreshTick]);

    // Only asked in cloud mode: the first read can make macOS show a Keychain prompt.
    useEffect(() => {
        if (!available || config.mode !== 'cloud') return;
        let cancelled = false;
        keyStore.status().then(s => { if (!cancelled) setKeyStatus(s); });
        return () => { cancelled = true; };
    }, [available, config.mode]);

    if (!available) {
        return (
            <div>
                <h3 className="text-lg font-semibold mb-2">{t('settings.ai.title')}</h3>
                <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-md text-sm">
                    {t('settings.ai.desktopOnly')}
                </div>
            </div>
        );
    }

    const models = list && list.source === lister ? list.models : [];
    const modelsError = list && list.source === lister ? list.error : null;
    const selected = models.find(m => m.name === config.model);
    const selectedMissing = !!config.model && !loadingModels && !modelsError && !selected;

    const errorText = (error: AiError) => t(aiErrorKey(error.kind, config.mode));
    const renderError = (error: AiError) => (
        <div className="text-xs text-red-600 font-medium">
            <p>{errorText(error)}</p>
            {error.detail && <p className="text-[10px] text-red-500 mt-1 italic leading-tight break-words">{error.detail}</p>}
        </div>
    );

    const changeMode = (mode: AiMode) => {
        if (mode === config.mode) return;
        const next = saveAiConfig({ mode });
        setConfig(next);
        setUrlInput(next.baseUrl);
        setUrlInvalid(false);
        setReport(null);
    };

    const commitUrl = () => {
        const normalized = normalizeBaseUrl(urlInput);
        if (!normalized) {
            setUrlInvalid(true);
            return;
        }
        setUrlInvalid(false);
        setUrlInput(normalized);
        if (normalized !== config.baseUrl) {
            setConfig(saveAiConfig({ baseUrl: normalized }));
            setReport(null);
        }
    };

    const chooseModel = (name: string) => {
        setConfig(saveAiConfig({ model: name }));
        setReport(null);
    };

    const saveKey = async () => {
        setKeyStatus(await keyStore.set(keyInput));
        setKeyInput('');
        setReport(null);
    };

    const removeKey = async () => {
        setKeyStatus(await keyStore.clear());
        setReport(null);
    };

    const runTest = async () => {
        setTesting(true);
        setReport(null);
        try {
            setReport(await createOllamaProvider(config, transport).testConnection());
        } finally {
            setTesting(false);
        }
    };

    const keyStorageText = !keyStatus ? null
        : keyStatus.problem === 'decrypt_failed' ? t('settings.ai.keyStorage.decryptFailed')
        : t(`settings.ai.keyStorage.${keyStatus.storage}`);

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-lg font-semibold mb-2">{t('settings.ai.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('settings.ai.description')}</p>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">{t('settings.ai.connection')}</label>
                <div className="flex gap-2">
                    <Button variant={config.mode === 'local' ? 'default' : 'outline'} size="sm" onClick={() => changeMode('local')}>
                        {t('settings.ai.modeLocal')}
                    </Button>
                    <Button variant={config.mode === 'cloud' ? 'default' : 'outline'} size="sm" onClick={() => changeMode('cloud')}>
                        {t('settings.ai.modeCloud')}
                    </Button>
                </div>
            </div>

            {config.mode === 'local' ? (
                <div className="space-y-2 max-w-xl">
                    <label className="text-sm font-medium">{t('settings.ai.serverUrl')}</label>
                    <input
                        type="text"
                        className={inputClass}
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onBlur={commitUrl}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitUrl(); }}
                    />
                    {urlInvalid && <p className="text-xs text-red-600 font-medium">{t('settings.ai.invalidUrl')}</p>}
                    <p className="text-xs text-muted-foreground">{t('settings.ai.localHint')}</p>
                </div>
            ) : (
                <div className="space-y-2 max-w-xl">
                    <label className="text-sm font-medium">{t('settings.ai.apiKey')}</label>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            autoComplete="off"
                            className={inputClass}
                            placeholder={t('settings.ai.apiKeyPlaceholder')}
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                        />
                        <Button onClick={saveKey} disabled={!keyInput.trim()}>{t('settings.ai.saveKey')}</Button>
                        <Button variant="outline" onClick={removeKey} disabled={!keyStatus?.hasKey}>{t('settings.ai.removeKey')}</Button>
                    </div>
                    {keyStorageText && (
                        <p className={`text-xs font-medium ${keyStatus?.hasKey && keyStatus.storage === 'keychain' ? 'text-green-600' : keyStatus?.problem || keyStatus?.storage === 'session' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {keyStorageText}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">{t('settings.ai.cloudKeyNote')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.ai.cloudPrivacy')}</p>
                </div>
            )}

            <div className="space-y-2 max-w-xl">
                <label className="text-sm font-medium">{t('settings.ai.model')}</label>
                <div className="flex gap-2">
                    <select
                        className={inputClass}
                        value={config.model}
                        onChange={(e) => chooseModel(e.target.value)}
                        disabled={loadingModels}
                    >
                        <option value="">{loadingModels ? t('settings.ai.loadingModels') : t('settings.ai.chooseModel')}</option>
                        {selectedMissing && <option value={config.model}>{config.model} ({t('settings.ai.notFound')})</option>}
                        {models.map(m => (
                            <option key={m.name} value={m.name}>
                                {m.name}{m.sizeB !== null ? ` · ${formatSize(m.sizeB)}` : ''}{m.small ? ' ⚠' : ''}
                            </option>
                        ))}
                    </select>
                    <Button variant="outline" onClick={() => setRefreshTick(n => n + 1)} disabled={loadingModels}>
                        {t('settings.ai.refreshModels')}
                    </Button>
                </div>
                {modelsError && renderError(modelsError)}
                {!loadingModels && !modelsError && models.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('settings.ai.noModels')}</p>
                )}
                {selected?.small && (
                    <div className="p-3 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-md text-xs">
                        {t('settings.ai.smallModelWarning', { size: formatSize(selected.sizeB), threshold: SMALL_MODEL_THRESHOLD_B })}
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <Button variant="secondary" onClick={runTest} disabled={testing} className="min-w-[200px]">
                    {testing ? t('settings.ai.testing') : t('settings.ai.testConnection')}
                </Button>
                {report?.ok && (
                    <div className="space-y-1">
                        <p className="text-xs text-green-600 font-medium">
                            {config.mode === 'local'
                                ? t('settings.ai.connectedLocal', { version: report.version ?? '?', count: report.modelCount })
                                : t('settings.ai.connectedCloud', { count: report.modelCount })}
                        </p>
                        {report.warnings.includes('old_version') && (
                            <p className="text-xs text-amber-600 font-medium">
                                {t('settings.ai.oldVersion', { version: report.version, min: MIN_OLLAMA_VERSION })}
                            </p>
                        )}
                        {report.warnings.includes('no_model_selected') && (
                            <p className="text-xs text-amber-600 font-medium">{t('settings.ai.noModelSelected')}</p>
                        )}
                        {report.selectedModelFound === false && (
                            <p className="text-xs text-amber-600 font-medium">{t('settings.ai.selectedModelMissing')}</p>
                        )}
                    </div>
                )}
                {report && !report.ok && report.error && renderError(report.error)}
            </div>
        </div>
    );
}
