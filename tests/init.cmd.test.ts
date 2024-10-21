import { describe, test, expect, assert, beforeEach, beforeAll } from "vitest"
import { init } from "../src/cmds"
import { bun, cleanTestDir, getFs, npm, pkgjson, pnpm, yarn } from "./utils"
import { createScope } from "@submodule/core"
import { configSchema } from "../src/config"

describe("init.cmd", () => {
  let scope = createScope()

  beforeAll(() => {
    cleanTestDir()
  })

  beforeEach(() => {
    scope.dispose()
    scope = createScope()
  })

  test.for([
    [bun, 'bun'],
    [npm, 'npm'],
    [yarn, 'yarn'],
    [pnpm, 'pnpm'],
    [pkgjson, 'npm'],
  ] as const)("init cmd in empty dir %O, %s", async ([type, expected]) => {
    const { testDir, clean, read } = type({ prefix: expected })

    const initFn = await scope.resolve(init)
    await initFn({
      runtime: undefined,
      cwd: testDir
    })
    const configFile = JSON.parse(read('cpnp.json'))
    expect(configFile.pkg).toBe(expected)

    clean()
  })

  test.for([
    [bun, 'bun'],
    [npm, 'npm'],
    [yarn, 'yarn'],
    [pnpm, 'pnpm'],
    [pkgjson, 'npm'],
  ] as const)("hardcoded-pkg manager %O, %s", async ([type, expected]) => {
    const { testDir, clean, read } = type({ prefix: expected })
    const { initFn } = await scope.resolve({ initFn: init })
    await initFn({
      runtime: 'bun',
      cwd: testDir
    })

    const configFile = JSON.parse(read('cpnp.json'))
    expect(configFile.pkg).toBe('bun')

    clean()
  })

  test.for([
    [bun, 'bun'],
    [npm, 'npm'],
    [yarn, 'yarn'],
    [pnpm, 'pnpm'],
    [pkgjson, 'npm'],
  ] as const)("will skip if there's cpnp.json %O, %s", async ([type, expected]) => {
    const csm = await scope.resolve(configSchema)

    const { testDir, clean, stats } = type({ extraFiles: { 'cpnp.json': JSON.stringify(csm.parse({})) }, prefix: expected })
    const lastModified = stats('cpnp.json').mtime

    const initFn = await scope.resolve(init)
    await initFn({
      runtime: 'bun',
      cwd: testDir
    })

    expect(stats('cpnp.json').mtime).toEqual(lastModified)

    clean()
  })

})