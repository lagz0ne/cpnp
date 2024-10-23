import { homeDir, readConfig } from "./config"
import { combine, map, type inferProvide } from "@submodule/core"
import debug from "debug"
import path from "node:path"
import type { z } from "zod"

import { execaModule, fsModule, detectorCmdModule, resolvePackagePathModule, zModule, npmPackageArgModule } from "./mods"
import { apply, instructions, type ApplyResult } from "./instructions"

const installDependenciesDebug = debug('cpnp:components:install:dependencies')

const componentSchema = map(
  combine({ z: zModule, instructions }),
  ({ z, instructions }) => z.object({
    version: z.string(),
    dependencies: z.string().array().optional().default([]),
    instructions: z.array(instructions).optional().default([]),
    profiles: z.record(z.object({
      name: z.string(),
      dependencies: z.string().array().optional().default([]),
      instructions: z.array(instructions).optional().default([])
    })).optional().default({})
  })
)

export type Component = z.infer<inferProvide<typeof componentSchema>>

const findPkgDir = map(
  combine({ resolvePackagePathModule, homeDir }),
  async ({ resolvePackagePathModule, homeDir }) => {
    return async (dir: string): Promise<string | null> => {
      const packageJsonPath = resolvePackagePathModule.default(dir, homeDir)

      if (packageJsonPath) {
        return path.parse(packageJsonPath).dir
      }

      return null
    }
  })

const readComponentConfig = map(
  combine({ fs: fsModule, componentSchema }),
  ({ fs, componentSchema }) => {
    return async (file: string): Promise<Component | undefined> => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8')
        return componentSchema.parse(JSON.parse(content))
      }

      return undefined
    }
  })

type PullArtifactState =
  | { type: 'invalid-name', detail: string }
  | { type: 'invalid-pkg', detail: string }
  | { type: 'unknown-error', detail: string }
  | { type: 'ok' }

const pullArtifactDebug = debug('cpnp:components:pullArtifact')

export const pullArtifact = map(
  combine({ homeDir, detectorCmdModule, execaModule, readConfig, readComponentConfig, findPkgDir, npmPackageArgModule }),
  async ({ homeDir, detectorCmdModule, execaModule, readConfig, readComponentConfig, findPkgDir, npmPackageArgModule }) => {
    return async (artifact: string): Promise<PullArtifactState> => {
      const parsed = npmPackageArgModule.default(artifact)
      if (!parsed.name) {
        pullArtifactDebug('invalid artifact %s', artifact)
        return { type: 'invalid-name', detail: `${artifact} requires to have name. Maybe something like <name>@${artifact}` }
      }

      const runtimeConfig = (await readConfig()).pkg

      const installCmd = detectorCmdModule.resolveCommand(runtimeConfig, 'add', [artifact])
      pullArtifactDebug('running %s', installCmd)

      if (!installCmd) {
        return { type: 'unknown-error', detail: `cannot find package manager ${runtimeConfig}` }
      }

      execaModule.execaSync(installCmd.command, installCmd.args, { cwd: homeDir })

      const pkgDir = await findPkgDir(parsed.name)
      if (!pkgDir) {
        pullArtifactDebug('cannot find package %s', parsed.name)
        return { type: 'unknown-error', detail: `cannot find package ${parsed.name}` }
      }

      pullArtifactDebug('found package %s at %s', parsed.name, pkgDir)

      const componentConfig = await readComponentConfig(path.join(pkgDir, 'cpnp.json'))
      if (!componentConfig) {
        const uninstallCmd = detectorCmdModule.resolveCommand(runtimeConfig, 'uninstall', [parsed.name])
        if (!uninstallCmd) {
          pullArtifactDebug('cannot find package manager %s', runtimeConfig)
          return { type: 'unknown-error', detail: `cannot find package manager ${runtimeConfig}` }
        }

        pullArtifactDebug('uninstalling %s', uninstallCmd)
        execaModule.execaSync(uninstallCmd.command, uninstallCmd.args, { cwd: homeDir })

        return { type: 'invalid-pkg', detail: `the package doesn't include cpnp.json file or the cpnp.json is in invalid format` }
      }

      return { type: 'ok' }
    }
  }
)

const installDependencies = map(
  combine({ execaModule }),
  async ({ execaModule }) => {
    return async (cwd: string, pkgManager: 'bun' | 'yarn' | 'pnpm' | 'npm', pkgs: string[], type: undefined | 'dev' | 'peer' = undefined) => {
      const command = pkgManager === 'npm' ? 'install' : 'add'
      const targetType = type === 'dev'
        ? '-D'
        : type === 'peer'
          ? '-P'
          : undefined

      const installingCmds = [command, targetType, pkgs.join(' ')].filter(Boolean).join(' ')

      installDependenciesDebug('installing dependencies %s', installingCmds)
      return await execaModule.execa({ cwd })`${pkgManager} ${execaModule.parseCommandString(installingCmds)}`
    }
  }
)

const removeDependencies = map(
  combine({ execaModule }),
  async ({ execaModule }) => {
    return async (pkgManager: 'bun' | 'yarn' | 'pnpm' | 'npm', pkgs: string[], type: undefined | 'dev' | 'peer' = undefined) => {
      const command = pkgManager === 'npm' ? 'uninstall' : 'rm'
      const targetType = type === 'dev'
        ? '-D'
        : type === 'peer'
          ? '-P'
          : undefined

      const installingCmds = [command, targetType, pkgs.join(' ')].filter(Boolean).join(' ')

      installDependenciesDebug('installing dependencies %s', installingCmds)
      return await execaModule.execa`${pkgManager} ${execaModule.parseCommandString(installingCmds)}`
    }
  }
)

type ApplyState =
  | { type: 'error', detail: string }
  | { type: 'ok', results: ApplyResult[] }

export const applyArtifact = map(
  combine({ installDependencies, findPkgDir, readComponentConfig, apply }),
  async ({ installDependencies, findPkgDir, readComponentConfig, apply }) => {
    return async (artifact: string, applyDir: string): Promise<ApplyState> => {
      const componentConfigPath = await findPkgDir(artifact)
      if (!componentConfigPath) {
        return { type: 'error', detail: `cannot find package ${artifact}` }
      }

      console.log('applying %O ...', { artifact, applyDir })
      const componentConfig = await readComponentConfig(path.join(componentConfigPath, 'cpnp.json'))
        .catch(e => {
          console.error(e)
          throw e
        })
      if (!componentConfig) {
        return { type: 'error', detail: `cannot find cpnp.json in ${applyDir}` }
      }

      const { dependencies, instructions, profiles } = componentConfig

      await installDependencies(applyDir, 'npm', dependencies)

      const results: ApplyResult[] = []

      for (const instruction of instructions) {
        const applyResult = await apply(instruction, componentConfigPath, applyDir, true)
        if (!applyResult) {
          results.push({ type: 'error', detail: `cannot apply instruction ${instruction}` })
        } else {
          results.push(applyResult)
        }
      }

      return { type: 'ok', results }
    }
  }
)