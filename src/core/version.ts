import versionActions from '@/store/version/action'
import versionState, { type InitState } from '@/store/version/state'
import { Navigation } from 'react-native-navigation'
import { saveIgnoreVersion } from '@/utils/data'

export const showModal = () => {}

export const hideModal = (componentId: string) => {
  if (!versionState.showModal) return
  versionActions.setVisibleModal(false)
  void Navigation.dismissOverlay(componentId)
}

export const checkUpdate = async() => {
  versionActions.setVersionInfo({
    status: 'idle',
    isLatest: true,
    isUnknown: false,
    newVersion: {
      version: process.versions.app,
      desc: '',
      history: [],
    },
  })
}

export const downloadUpdate = () => {}

export const setIgnoreVersion = (version: InitState['ignoreVersion']) => {
  versionActions.setIgnoreVersion(version)
  saveIgnoreVersion(version)
}
