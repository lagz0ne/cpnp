import path from 'node:path'
export type RelativePath = `./${string}`

export const isRelativePath = (input: string, dir: string): input is RelativePath => {
  const resolvedPath = path.resolve(dir, input)
  return resolvedPath.startsWith(dir)
}
