import { provide, map, combine, type inferProvide, value } from "@submodule/core"
import debug from "debug"
import path from "node:path"
import { fsModule, zModule } from "./mods"
import type { z } from "zod"
import os from "node:os"

const logger = debug('cpnp:config')

export const defaultHomeDir = provide(() => {
  return path.join(os.homedir(), '.cpnp')
})

export const configSchema = map(
  combine({ z: zModule }),
  ({ z }) => z.object({
    version: z.string().optional().default('1.0.0'),
    pkg: z.enum(['bun', 'npm', 'yarn', 'pnpm']).default('npm')
  })
)

export type Config = Omit<z.infer<inferProvide<typeof configSchema>>, never>

const configFile = value('cpnp.json')

const initHomeDirDebug = debug('cpnp:cmds:initHomeDir')

export const homeDir = map(
  combine({ fs: fsModule, defaultHomeDir, configFile, configSchema }),
  async ({ fs, defaultHomeDir, configFile, configSchema }) => {
    if (!fs.existsSync(defaultHomeDir)) {
      initHomeDirDebug('home dir %s not exists, creating', defaultHomeDir)
      fs.mkdirSync(defaultHomeDir, { recursive: true })
    }

    const pkgJsonPath = path.join(defaultHomeDir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      initHomeDirDebug('package.json not exists, creating')
      fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: 'cpnp', version: '1.0.0' }))
    }

    const cpnpJsonPath = path.join(defaultHomeDir, configFile)
    if (!fs.existsSync(cpnpJsonPath)) {
      initHomeDirDebug('cpnp.json not exists, creating')
      fs.writeFileSync(cpnpJsonPath, JSON.stringify(configSchema.parse({}), null, 2))
    }

    return defaultHomeDir
  }
)

export const hasPackage = map(
  combine({ homeDir, fs: fsModule, z: zModule }),
  async ({ homeDir, fs, z }) => async (pkg: string) => {
    const pkgJsonPath = path.join(homeDir, 'package.json')

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    const validatedpkgJson = z.object({
      dependencies: z.record(z.string()).optional().default({}),
      devDependencies: z.record(z.string()).optional().default({}),
      peerDependencies: z.record(z.string()).optional().default({}),
    }).parse(pkgJson)

    if (!validatedpkgJson.dependencies[pkg] && !validatedpkgJson.devDependencies[pkg] && !validatedpkgJson.peerDependencies[pkg]) {
      return false
    }

    return true
  }
)

export const readConfig = map(
  combine({ fsModule, configSchema, configFile, homeDir }),
  ({ fsModule: fs, configSchema, configFile, homeDir }) => async () => {
    logger('looking for out cpnp.json %s', configFile)
    const configFileOnDisk = path.join(homeDir, configFile)

    const configContent = await fs.promises.readFile(configFileOnDisk, 'utf-8')
    const rawConfig: Config = configSchema.parse(JSON.parse(configContent))

    const config = structuredClone(rawConfig)
    return config
  }
)

export const writeConfig = map(
  combine({ homeDir, configFile, fs: fsModule, configSchema }),
  async ({ homeDir, configFile, fs, configSchema }) => {
    return async (config: unknown) => {
      const validatedConfig = configSchema.parse(config)
      const configContent = JSON.stringify(validatedConfig, null, 2)
      const configFileOnDisk = path.join(homeDir, configFile)

      fs.writeFileSync(configFileOnDisk, configContent, 'utf-8')
    }
  }
)