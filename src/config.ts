import { provide, map, combine } from "@submodule/core"
import { z } from "zod"
import debug from "debug"
import path from "node:path"
// @ts-ignore
import { parse } from "parse-package-name"
import { fsModule } from "./mods"

const logger = debug('cpnp:config')

export const configSchema = z.object({
  version: z.string().optional(),
  pkg: z.enum(['bun', 'npm', 'yarn', 'pnpm']).default('npm'),
  components: z.array(
    z.string()
      .or(z.object({ name: z.string(), alias: z.string().optional() }))
  )
    .default([])
    .transform(c => c.map(c => typeof c === 'string' ? { name: c } : c)),
  installDir: z.string().optional().default('mods')
})

export type Config = Omit<z.infer<typeof configSchema>, never>

export const configHelper = {
  name: (config: Config, name: string): (string[] | undefined) => {
    const pkgName = parse(name)
    const component = config.components.find(c => typeof c === 'string' ? pkgName.name === parse(c).name : parse(c).name === pkgName.name)

    if (typeof component === 'string') {
      return [parse(component).name]
    }

    return component?.alias ? [component.alias] : undefined
  },
}

const configFiles = provide(() => {
  return [
    'cpnp.json',
  ]
})

export const readConfig = map(
  combine({ configFiles, fsModule }),
  ({ configFiles, fsModule: fs }) => async (cwd: string) => {
    logger('reaching out cpnp.json %s', configFiles)

    const configFile = configFiles
      .map(f => path.join(cwd, f))
      .find(f => fs.existsSync(f))
    if (!configFile) {
      return { configFile: undefined }
    }

    const configContent = await fs.promises.readFile(configFile, 'utf-8')
    const rawConfig: Config = configSchema.parse(JSON.parse(configContent))

    const config = structuredClone(rawConfig)

    // remove version from config names
    config.components = config.components.map(c => {
      const parsedname = parse(c.name)
      return {
        ...c,
        name: parsedname.name
      }
    })

    return {
      configFile,
      config,
      hasComponent: (name: string): Config['components'][number] | undefined => {
        const parsedName = parse(name).name
        return config.components.find(c => c.name === parsedName)
      },
    }
  }
)

export const writeConfig = map(
  combine({ readConfig, configFiles, fsModule }),
  async ({ readConfig, configFiles, fsModule: fs }) => {
    return async (config: unknown, cwd: string) => {
      const existingConfig = await readConfig(cwd)

      if (existingConfig.configFile) {
        const updated = configSchema.parse(config)
        logger('writing config %o', updated)
        await fs.promises.writeFile(existingConfig.configFile, JSON.stringify(updated, null, 2))
      } else {
        logger('writing config %o', config)
        await fs.promises.writeFile(path.join(cwd, configFiles[0]), JSON.stringify(config, null, 2))
      }
    }
  }
)