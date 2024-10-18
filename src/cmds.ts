import { combine, map } from "@submodule/core"
import { writeConfig, readConfig, configSchema } from "./config";
import { installComponent } from "./components"

import debug from "debug"
import { niModule } from "./mods";

const addCmdDebug = debug('cpnp:cmds:add')
const initCmdDebug = debug('cpnp:cmds:init')

export const init = map(
  combine({ writeConfig, niModule }),
  async ({ writeConfig, niModule }) => {
    return async ({ runtime }: { runtime?: 'bun' | 'npm' | 'yarn' | 'pnpm' }) => {
      let pkgManager: 'bun' | 'npm' | 'yarn' | 'pnpm' | undefined = runtime

      if (!pkgManager) {
        initCmdDebug('detecting package manager')
        const detected = await niModule.detect()

        if (!detected) {
          initCmdDebug('no package manager detected, defaulting to npm')
          pkgManager = 'npm'
        } else {
          switch (detected) {
            case 'yarn':
            case 'yarn@berry':
              pkgManager = 'yarn'
              break
            case 'pnpm':
            case 'pnpm@6':
              pkgManager = 'pnpm'
              break
            default:
              pkgManager = detected
          }
        }
      }

      const defaultInitConfig = configSchema.parse({
        version: '1.0',
        pkgManager
      })

      await writeConfig(defaultInitConfig)
    }
  }
)

export const add = map(
  combine({ readConfig, writeConfig, installComponent }),
  async ({ readConfig, writeConfig, installComponent }) => {
    const currentConfig = await readConfig()
    if (!currentConfig.configFile) {
      throw new Error('need to initialized firstly')
    }
    addCmdDebug('current config %o', currentConfig)

    return async (component: string, alias?: string) => {
      addCmdDebug('adding component { name: %s, alias: %s }', component, alias)
      await installComponent(currentConfig.config, component, alias)

      if (!currentConfig.hasComponent(component)) {
        currentConfig.config.components.push({ name: component, alias })
        await writeConfig(currentConfig.config)
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
    const currentConfig = await readConfig()
    if (!currentConfig.configFile) {
      throw new Error('need to initialized firstly')
    }

    installDebug('current config %o', currentConfig)
    return async () => {
      for (const c of currentConfig.config.components) {
        const component = typeof c === 'string' ? { name: c } : c
        await installComponent(currentConfig.config, component.name, component.alias)
      }
    }
  }
)