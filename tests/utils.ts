import { memfs } from "memfs"
import path from "path"
import fs from "fs"
import os from "os"

export type DirContent = {
  [key: string]: string | DirContent
}

export type PkgManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

export const getFs = (dir: DirContent, prefix?: string) => {
  const tmpDir = os.tmpdir()
  const dirPath = path.join(tmpDir, 'cpnp')
  const randomName = Math.random().toString(36).substring(7)
  const testDir = path.join(dirPath, randomName)

  const writeDirs = (dir: DirContent) => {
    for (const [key, value] of Object.entries(dir)) {
      const filePath = path.join(testDir, key)
      if (typeof value === 'string') {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, value)
      } else {
        writeDirs(value)
      }
    }
  }

  writeDirs(dir)

  return {
    testDir,
    read: (file: string) => {
      return fs.readFileSync(path.join(testDir, file), 'utf-8')
    },
    stats: (file: string) => {
      return fs.statSync(path.join(testDir, file))
    },
    clean: () => {
      fs.rmSync(testDir, { force: true, recursive: true })
    }
  }
}

export const dir = (opts?: {
  extraFiles?: DirContent,
  prefix?: string
}) => getFs({ ...opts?.extraFiles }, opts?.prefix)

export const cleanTestDir = () => {
  const tmpDir = os.tmpdir()
  const dirPath = path.join(tmpDir, 'cpnp')

  fs.rmSync(dirPath, { force: true, recursive: true })
}

export const pkgjson = (opts?: {
  extraFiles?: DirContent,
  prefix?: string
}) => getFs({
  'package.json': '',
  ...opts?.extraFiles
}, opts?.prefix)

export const yarn = (opts?: {
  extraFiles?: DirContent,
  prefix?: string
}) => getFs({
  'package.json': '',
  'yarn.lock': '',
  ...opts?.extraFiles
}, opts?.prefix)

export const npm = (opts?: {
  extraFiles?: DirContent,
  prefix?: string
}) => getFs({
  'package.json': '',
  'package-lock.json': '',
  ...opts?.extraFiles
}, opts?.prefix)

export const pnpm = (opts?: {
  extraFiles?: DirContent,
  prefix?: string
}) => getFs({
  'package.json': '',
  'pnpm-lock.yaml': '',
  ...opts?.extraFiles
}, opts?.prefix)

export const bun = (opts?: {
  extraFiles?: DirContent,
  prefix?: string
}) => getFs({
  'package.json': '',
  'bun.lockb': '',
  ...opts?.extraFiles
}, opts?.prefix)