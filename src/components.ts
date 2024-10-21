import { type Config, configHelper } from "./config"
import { combine, map, provide } from "@submodule/core"
import { z } from "zod"
import debug from "debug"
import path from "node:path"

// @ts-ignore
import { parse } from "parse-package-name"
import { execaModule, fsModule, gigetModule, resolvePackagePathModule } from "./mods"
import os from "node:os"

const pullDebug = debug('cpnp:components:pull')
const installDependenciesDebug = debug('cpnp:components:install:dependencies')

const componentSchema = z.object({
  name: z.string(),
  version: z.string(),
  dependencies: z.string().array().default([]),
  files: z.array(
    z.string().or(z.object({ file: z.string(), overwrite: z.boolean().default(false) }))
  )
})

export type Component = z.infer<typeof componentSchema>

export const cacheDir = map(
  fsModule,
  (fs) => {
    const homeDir = os.homedir()
    const cacheDir = path.join(homeDir, '.cpnp')

    fs.mkdirSync(cacheDir, { recursive: true })
    return cacheDir
  })

export const pullArtifact = map(
  combine({ cacheDir, gigetModule }),
  async ({ cacheDir, gigetModule }) => {
    return async (artifact: string) => {
      const { source, dir, ...rest } = await gigetModule.downloadTemplate(artifact, {
        force: true,
        cwd: cacheDir,
        dir: artifact,
        preferOffline: true
      })

      console.log(source, dir, rest)

      return dir
    }
  }
)

const componentConfigPath = (dir: string) => path.join(dir, 'cpnp.json')

const findPkgDir = map(
  resolvePackagePathModule,
  async (resolvePackagePathModule) => {
    return async (dir: string, cwd: string): Promise<string | null> => {
      const pkgDir = resolvePackagePathModule.default(dir, cwd)
      if (pkgDir) {
        return pkgDir
      }

      return null
    }
  })

const readComponentConfig = map(
  fsModule,
  (fs) => {
    return async (file: string): Promise<Component | undefined> => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8')
        return componentSchema.parse(JSON.parse(content))
      }

      return undefined
    }
  })

const installDependencies = map(
  combine({ execaModule }),
  async ({ execaModule }) => {
    return async (pkgManager: 'bun' | 'yarn' | 'pnpm' | 'npm', pkgs: string[], type: undefined | 'dev' | 'peer' = undefined) => {
      const command = pkgManager === 'npm' ? 'install' : 'add'
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

export const pull = map(
  combine({ cacheDir, installDependencies, findPkgDir, readComponentConfig }),
  async ({ cacheDir, installDependencies, findPkgDir, readComponentConfig }) => {
    return async (config: Config, componentName: string, cwd: string) => {

      await installDependencies(config.pkg, [componentName], 'dev')

      const parsedPkgName = parse(componentName)

      const pkgPackage = await findPkgDir(parsedPkgName.name, cwd)
      if (!pkgPackage) {
        throw new Error(`cannot find package.json in ${componentName}`)
      }

      const pkgDir = path.parse(pkgPackage).dir

      const componentConfig = await readComponentConfig(componentConfigPath(pkgDir))
      if (!componentConfig) {
        throw new Error(`component ${componentName} is not valid, cpnp.json is not found in the target dir`)
      }

      return {
        pkgDir,
        componentConfig
      }
    }
  }
)

const fileProcessDebug = debug('cpnp:components:file_process')
export const fileProcess = map(
  combine({ fsModule }),
  async ({ fsModule: fs }) => async (
    config: Config,
    component: {
      pkgDir: string,
      componentConfig: Component,
      name: string
    },
  ) => {
    fileProcessDebug('checking %O', { config, component })
    const targetDir = path.join(config.installDir, component.name)
    fs.mkdirSync(targetDir, { recursive: true })

    for (const fileDef of component.componentConfig.files) {
      let fileRef = ''
      let overwrite = false

      if (typeof fileDef === 'string') {
        fileRef = fileDef
      } else {
        fileRef = fileDef.file
        overwrite = fileDef.overwrite || overwrite
      }

      const targetFileOnDisk = path.join(targetDir, fileRef)
      if (fs.existsSync(targetFileOnDisk)) {
        if (overwrite) {
          fileProcessDebug('writing %s to disk', targetFileOnDisk)
          fs.rmSync(targetFileOnDisk)
        } else {
          fileProcessDebug('file %s already exists, skip', fileRef)
          continue;
        }
      }

      const sourceFile = path.join(component.pkgDir, fileRef)
      if (!(fs.existsSync(sourceFile))) {
        throw new Error(`${sourceFile} is expected to exist, but it does not`)
      }

      // copy file from source to target
      fileProcessDebug('copying %s to %s', sourceFile, targetFileOnDisk)
      fs.copyFileSync(sourceFile, targetFileOnDisk)
    }
  }
)

export const installComponent = map(
  combine({ pull, fileProcess }),
  async ({ pull, fileProcess }) => {
    return async (config: Config, component: string, cwd: string, alias?: string) => {
      const { pkgDir, componentConfig } = await pull(config, component, cwd)
      const name = alias || parse(component).name
      await fileProcess(config, { name, componentConfig, pkgDir })
    }
  }
)

