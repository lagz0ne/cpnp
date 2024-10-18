import { Command, program } from "commander"
import { createScope } from "@submodule/core"
import { add, init } from "./cmds"

const initCmd = new Command('init')
  .option('--pkg', 'package manager to use, default to be detected')
  .action(async (opts) => {
    const scope = createScope()
    let error: undefined | unknown = undefined

    const initFn = await scope.resolve(init)

    await initFn({ runtime: opts.pkg })
      .catch((e) => {
        error = e
      })
      .finally(async () => {
        await scope.dispose()

        if (error) {
          console.error(error)
          process.exit(1)
        }

        process.exit(0)
      })
  })

const addCmd = new Command('add')
  .argument('<component>', 'components to add')
  .argument('[alias]', 'alias for the component')
  .action(async (component: string, alias: string | undefined) => {
    const scope = createScope()
    let error: undefined | unknown = undefined

    await scope.resolve(add)
      .then(adder => adder(component, alias))
      .catch((e) => {
        error = e
      })
      .finally(async () => {
        await scope.dispose()

        if (error) {
          console.error(error)
          process.exit(1)
        }

        process.exit(0)
      })
  })

program.addCommand(initCmd)
program.addCommand(addCmd)
program.parse()