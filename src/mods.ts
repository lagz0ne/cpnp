import { provide } from '@submodule/core'

export const execaModule = provide(async () => {
  return await import('execa')
})

export const resolvePackagePathModule = provide(async () => {
  return await import('resolve-package-path')
})

export const gigetModule = provide(async () => {
  return await import('giget')
})

export const detectorDetectModule = provide(async () => {
  return await import('package-manager-detector/detect')
})

export const detectorCmdModule = provide(async () => {
  return await import('package-manager-detector/commands')
})

export const fsModule = provide(async () => {
  return await import('node:fs')
})