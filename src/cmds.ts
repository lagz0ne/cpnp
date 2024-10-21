import { combine, map } from "@submodule/core"
import { writeConfig, readConfig, configSchema } from "./config";
import { installComponent, pullArtifact } from "./components"

import debug from "debug"
import { detectorDetectModule } from "./mods";

const addCmdDebug = debug('cpnp:cmds:add')
const initCmdDebug = debug('cpnp:cmds:init')

export const init = map(
  combine({ readConfig, writeConfig, detectorDetectModule }),
  async ({ readConfig, writeConfig, detectorDetectModule }) => {
    return async ({ runtime, cwd }: { cwd: string, runtime?: 'bun' | 'npm' | 'yarn' | 'pnpm' }) => {
      const currentConfig = await readConfig(cwd)
      if (currentConfig.configFile) {
        initCmdDebug('config file already exists, skip')
        return
      }

      let pkgManager: 'bun' | 'npm' | 'yarn' | 'pnpm' | undefined = runtime

      if (!pkgManager) {
        initCmdDebug('detecting package manager')
        const detected = detectorDetectModule.detectSync({ cwd })

        if (!detected) {
          initCmdDebug('no package manager detected, defaulting to npm')
          pkgManager = 'npm'
        } else {
          initCmdDebug('detected package manager %O', detected)
          switch (detected.name) {
            case 'yarn':
              pkgManager = 'yarn'
              break
            case 'bun':
              pkgManager = 'bun'
              break
            case 'pnpm':
              pkgManager = 'pnpm'
              break
            default:
              pkgManager = detected.name
          }
        }
      }

      const defaultInitConfig = configSchema.parse({
        version: '1.0',
        pkg: pkgManager
      })

      await writeConfig(defaultInitConfig, cwd)
    }
  }
)

export const update = map(
  combine({ pullArtifact }),
  async ({ pullArtifact }) => {
    return async (artifact: string) => {
      await pullArtifact(artifact)
    }
  }
)

export const add = map(
  combine({ readConfig, writeConfig, installComponent }),
  async ({ readConfig, writeConfig, installComponent }) => {
    return async (component: string, cwd: string, alias?: string) => {
      const currentConfig = await readConfig(cwd)
      if (!currentConfig.configFile) {
        throw new Error('need to initialized firstly')
      }
      addCmdDebug('current config %o', currentConfig)

      addCmdDebug('adding component { name: %s, alias: %s }', component, alias)
      await installComponent(currentConfig.config, component, cwd, alias)

      if (!currentConfig.hasComponent(component)) {
        currentConfig.config.components.push({ name: component, alias })
        await writeConfig(currentConfig.config, cwd)
        return
      }

      addCmdDebug('component %s already exists, skip', component)
    }
  }
)

const installDebug = debug('cpnp:cmds:install')
export const install = map(
  combine({ readConfig, installComponent }),
  async ({ readConfig, installComponent }) => {
    return async (cwd: string) => {
      const currentConfig = await readConfig(cwd)
      if (!currentConfig.configFile) {
        throw new Error('need to initialized firstly')
      }

      installDebug('current config %o', currentConfig)
      for (const c of currentConfig.config.components) {
        const component = typeof c === 'string' ? { name: c } : c
        await installComponent(currentConfig.config, component.name, cwd, component.alias)
      }
    }
  }
)