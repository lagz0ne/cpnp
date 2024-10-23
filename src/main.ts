import { Command, program } from "commander"
import { createScope } from "@submodule/core"
import { update, use, updateConfig } from "./cmds"

const initCmd = new Command('init')
  .option('--pkg <pkg>', 'package manager to use, default to be detected', 'npm')
  .action(async (opts) => {
    const scope = createScope()
    let error: undefined | unknown = undefined

    const updateConfigFn = await scope.resolve(updateConfig)

    await updateConfigFn({ type: 'set-runtime', runtime: opts.pkg })
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

const updateCmd = new Command('install')
  .argument('<package>', 'package to install')
  .action(async (pkg: string) => {
    const scope = createScope()
    const updateFn = await scope.resolve(update)
    let exitCode = 0

    await updateFn(pkg)
      .then(r => {
        if (r.type === 'ok') {
          console.log('adding %s ... done', pkg)
        } else {
          exitCode = 1
          console.log('adding %s ... failed \n %s', pkg, r.detail)
        }
      })
      .finally(async () => {
        await scope.dispose()
        process.exit(exitCode)
      })
  })

const applyCmd = new Command('apply')
  .argument('<package>', 'package to apply')
  .option('-d, --dir <dir>', 'directory to apply the package', process.cwd())
  .action(async (pkg: string, opts) => {
    const scope = createScope()
    try {
      const useFn = await scope.resolve(use)

      let exitCode = 0

      await useFn(pkg, opts.dir)
        .then(r => {
          console.log('result %O', r)
          if (r.type === 'ok') {
            console.log('applying %s ... done', pkg)
          } else {
            exitCode = 1
            console.log('applying %s ... failed \n %s', pkg, r.detail)
          }
        })
        .catch(e => console.error)
        .finally(async () => {
          await scope.dispose()
          process.exit(exitCode)
        })
    } catch (e) {
      console.error(e)
    }

  })

program.addCommand(initCmd)
program.addCommand(updateCmd)
program.addCommand(applyCmd)
program.parse(process.argv)