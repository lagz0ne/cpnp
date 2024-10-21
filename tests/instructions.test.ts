import { beforeEach, describe, expect, test } from "vitest"
import { npm, dir } from "./utils"
import { copy, patch } from "../src/instructions"
import { createScope } from "@submodule/core"

describe("test copy instruction", () => {

  let scope = createScope()

  beforeEach(() => {
    scope.dispose()
    scope = createScope()
  })

  test("copy file should work", async () => {
    const component = dir({ extraFiles: { a: 'a' } })
    const target = dir({ extraFiles: { b: 'b' } })

    const copyFn = await scope.resolve(copy)
    copyFn({ from: './a', to: './a', overwrite: true, type: 'copy' }, component.testDir, target.testDir)

    expect(target.read('a')).toBe('a')

    copyFn({ from: './a', to: './b', overwrite: true, type: 'copy' }, component.testDir, target.testDir)
    expect(target.read('b')).toBe('a')
  })

})

describe("test patch instruction", () => {

  let scope = createScope()

  beforeEach(() => {
    scope.dispose()
    scope = createScope()
  })

  test("patch file should work", async () => {
    const component = dir({
      extraFiles: {
        a: JSON.stringify([
          { op: 'add', path: '/scripts/run', value: 'run' }
        ])
      }
    })

    const target = dir({
      extraFiles: {
        'package.json': JSON.stringify({
          scripts: {
            test: 'echo "test"'
          }
        })
      }
    })

    const patchFn = await scope.resolve(patch)
    const patchResult = await patchFn({
      source: './a',
      to: './package.json',
      type: 'patch'
    }, component.testDir, target.testDir, false)

    expect(patchResult.type).toBe('result')
    expect(JSON.parse(target.read('package.json')).scripts.run).toBeUndefined()

    const applyResult = await patchFn({
      source: './a',
      to: './package.json',
      type: 'patch'
    }, component.testDir, target.testDir, true)
    expect(applyResult.type).toBe('result')
    expect(JSON.parse(target.read('package.json')).scripts.run).toBe('run')
  })
})