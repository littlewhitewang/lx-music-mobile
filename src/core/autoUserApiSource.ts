import { setApiSource } from '@/core/apiSource'
import { upsertUserApi } from '@/core/userApi'
import { getData, saveData } from '@/plugins/storage'
import settingState from '@/store/setting/state'
import { state as userApiState } from '@/store/userApi'
import { httpFetch } from '@/utils/request'
import apiSourceInfo from '@/utils/musicSdk/api-source-info'

const metaKey = 'auto_user_api_source_pdone_meta'
const updateInterval = 180 * 24 * 60 * 60 * 1000
const maxScriptSize = 9_000_000
const rawPrefix = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/'
const proxyPrefixes = [
  'https://ghproxy.net/',
  'https://gh.llkk.cc/',
  'https://github.moeyy.xyz/',
  'https://ghproxy.cn/',
  'https://gh.api.99988866.xyz/',
  'https://ghp.ci/',
]

const managedSources = [
  { id: 'user_api_pdone_sixyin', name: 'sixyin', path: 'sixyin/latest.js' },
  { id: 'user_api_pdone_huibq', name: 'huibq', path: 'huibq/latest.js' },
  { id: 'user_api_pdone_flower', name: 'flower', path: 'flower/latest.js' },
  { id: 'user_api_pdone_lx', name: 'lx', path: 'lx/latest.js' },
  { id: 'user_api_pdone_ikun', name: 'ikun', path: 'ikun/latest.js' },
  { id: 'user_api_pdone_grass', name: 'grass', path: 'grass/latest.js' },
  { id: 'user_api_pdone_juhe', name: 'juhe', path: 'juhe/latest.js' },
] as const

type ManagedSourceId = typeof managedSources[number]['id']

const managedSourceIds = new Set<string>(managedSources.map(source => source.id))

const getSourceUrls = (path: string) => {
  const rawUrl = rawPrefix + path
  return [
    rawUrl,
    ...proxyPrefixes.map(prefix => prefix + rawUrl),
  ]
}

const isScript = (script: unknown): script is string => {
  return typeof script == 'string' &&
    script.length > 0 &&
    script.length <= maxScriptSize &&
    /^\/\*[\S|\s]+?\*\//.test(script)
}

const fetchSourceScript = async(path: string) => {
  let lastError: unknown
  for (const url of getSourceUrls(path)) {
    try {
      const response = await httpFetch(url, { method: 'get', timeout: 20_000 }).promise
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(String(response.statusCode))
      if (!isScript(response.body)) throw new Error('Invalid source script')
      return {
        url,
        script: response.body,
      }
    } catch (err) {
      lastError = err
      console.log('fetch managed user api source failed', url, err)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Fetch source failed')
}

const hasBuiltInSource = () => apiSourceInfo.some(source => !source.disabled)

const hasAnySource = () => hasBuiltInSource() || userApiState.list.length > 0

const hasCurrentSource = (apiId: string) => {
  if (!apiId) return false
  if (/^user_api/.test(apiId)) return userApiState.list.some(api => api.id == apiId)
  return apiSourceInfo.some(api => api.id == apiId && !api.disabled)
}

const hasManagedSource = () => userApiState.list.some(api => managedSourceIds.has(api.id))

const isManagedSource = (apiId: string): apiId is ManagedSourceId => managedSourceIds.has(apiId)

const getPreferredManagedId = () => {
  const currentApiId = settingState.setting['common.apiSource']
  if (isManagedSource(currentApiId) && userApiState.list.some(api => api.id == currentApiId)) return currentApiId
  return managedSources.find(source => userApiState.list.some(api => api.id == source.id))?.id
}

let updatingPromise: Promise<string | null> | null = null

export const ensureAutoUserApiSources = async({ force = false, activate = false } = {}) => {
  if (updatingPromise) return updatingPromise

  updatingPromise = (async() => {
    const meta = await getData<{ lastUpdateAt?: number }>(metaKey)
    const now = Date.now()
    const isExpired = !meta?.lastUpdateAt || now - meta.lastUpdateAt >= updateInterval
    const needUpdate = force || !hasAnySource() || !hasManagedSource() || isExpired
    if (!needUpdate) return null

    let firstUpdatedId: string | null = null
    for (const source of managedSources) {
      try {
        const { script, url } = await fetchSourceScript(source.path)
        await upsertUserApi(source.id, script, {
          allowShowUpdateAlert: false,
          managedSourceName: source.name,
          managedSourceUrl: url,
          managedUpdatedAt: now,
        })
        firstUpdatedId ||= source.id
      } catch (err) {
        console.log('update managed user api source failed', source.name, err)
      }
    }

    if (!firstUpdatedId) return null
    await saveData(metaKey, { lastUpdateAt: now })
    if (activate) setApiSource(getPreferredManagedId() ?? firstUpdatedId)
    return firstUpdatedId
  })().finally(() => {
    updatingPromise = null
  })

  return updatingPromise
}

export const initAutoUserApiSources = async(setting: LX.AppSetting) => {
  const shouldActivate = !hasCurrentSource(setting['common.apiSource'])
  const updatedId = await ensureAutoUserApiSources({ activate: shouldActivate })
  return shouldActivate ? getPreferredManagedId() ?? updatedId : null
}

export const refreshAutoUserApiSourcesAfterFailure = async() => {
  const updatedId = await ensureAutoUserApiSources({ force: true })
  if (!updatedId) return

  const currentApiId = settingState.setting['common.apiSource']
  if (!hasCurrentSource(currentApiId) || isManagedSource(currentApiId)) {
    setApiSource(getPreferredManagedId() ?? updatedId)
  }
}
