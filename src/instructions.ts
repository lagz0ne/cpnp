import type { RelativePath } from "./helpers"
import { fsModule, jsonpatchModule, zModule } from "./mods"
import { map, combine } from "@submodule/core"
import debug from "debug"
import path from "node:path"
import type { Operation } from "fast-json-patch"

export type Copy = { type: 'copy', from: RelativePath, to: RelativePath, overwrite: boolean }
export type Patch = { type: 'patch', source: RelativePath, to: RelativePath }

export type Instruction =
  | Copy
  | Patch

const copyDebug = debug('cpnp:ins:copy')

export type Result<D, E, C> =
  | { status: 'ok', data: D }
  | { status: 'error', message: E }
  | { status: 'conflict', data: C }

export const copy = map(
  combine({ fsModule }),
  ({ fsModule: fs }) => (
    c: Copy,
    srcDir: string,
    targetDir: string
  ): Result<RelativePath, Error, RelativePath> => {
    const sourceFile = path.join(srcDir, c.from)
    if (!fs.existsSync(sourceFile)) {
      copyDebug('file %s does not exist, skipping', sourceFile)
      return { status: 'error', message: new Error(`file ${sourceFile} does not exist`) }
    }

    // check if sourceFile is a file
    if (fs.statSync(sourceFile).isDirectory()) {
      copyDebug('file %s is a directory, skipping', sourceFile)
      return { status: 'error', message: new Error(`file ${sourceFile} is a directory`) }
    }

    const targetFile = path.join(targetDir, c.to)

    if (fs.existsSync(targetFile) && !c.overwrite) {
      copyDebug('file %s exists, skipping', targetFile)
      return { status: 'conflict', data: c.to }
    }

    fs.copyFileSync(sourceFile, targetFile)
    return { status: 'ok', data: c.to }
  })

export const jsonpatchSchema = map(
  combine({ z: zModule }),
  ({ z }) => {
    const JsonPointerSchema = z.string().refine((val) => val.startsWith('/'), {
      message: "Path must start with '/'"
    });

    const OperationTypeSchema = z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']);

    const BaseOperationSchema = z.object({
      op: OperationTypeSchema,
      path: JsonPointerSchema,
    });

    const AddReplaceTestSchema = BaseOperationSchema.extend({
      op: z.enum(['add', 'replace', 'test']),
      value: z.any(), // 'value' can be any valid JSON data
    });

    const RemoveOperationSchema = BaseOperationSchema.extend({
      op: z.literal('remove'),
    });

    const MoveCopyOperationSchema = BaseOperationSchema.extend({
      op: z.enum(['move', 'copy']),
      from: JsonPointerSchema,
    });

    const JsonPatchOperationSchema = z.union([
      AddReplaceTestSchema,
      RemoveOperationSchema,
      MoveCopyOperationSchema,
    ]);

    const JsonPatchSchema = z.array(JsonPatchOperationSchema)

    return (source: unknown): Operation[] => {
      return JsonPatchSchema.parse(source) as Operation[];
    }
  }

)

type PatchStatus =
  | { type: 'invalid source', error: Error }
  | { type: 'invalid target', error: Error }
  | { type: 'patch not valid', error: Error }
  | { type: 'result', newDocument: unknown }
  | { type: 'uncaught error', error: unknown }

const patchDebug = debug('cpnp:ins:patch')
export const patch = map(
  combine({ fsModule, jsonpatchModule, jsonpatchSchema }),
  ({ fsModule: fs, jsonpatchModule: jsonpatch, jsonpatchSchema }) => async (
    p: Patch,
    srcDir: string,
    targetDir: string,
    apply: boolean
  ): Promise<PatchStatus> => {
    const patchFile = path.join(srcDir, p.source)
    if (!fs.existsSync(patchFile)) {
      patchDebug('file %s does not exist, skipping', patchFile)
      return { type: 'invalid source', error: new Error(`source file: ${patchFile} does not exist`) }
    }

    // check if patchFile is a file
    if (fs.statSync(patchFile).isDirectory()) {
      patchDebug('file %s is a directory, skipping', patchFile)
      return { type: 'invalid source', error: new Error(`source file ${patchFile} is a directory`) }
    }

    const targetFile = path.join(targetDir, p.to)
    if (!fs.existsSync(targetFile)) {
      patchDebug('file %s does not exist, skipping', targetFile)
      return { type: 'invalid target', error: new Error(`target file ${targetFile} does not exist`) }
    }

    const patchContent = fs.readFileSync(patchFile, 'utf-8')

    let unknownPatchedContent: unknown
    try {
      patchDebug('parsing %s', patchFile)
      unknownPatchedContent = JSON.parse(patchContent)
    } catch (err) {
      patchDebug('file %s is not a valid JSON Patch, skipping', patchFile)
      return { type: 'invalid source', error: new Error(`source file ${patchFile} is not a valid JSON patch`) }
    }

    let patches: Operation[]
    try {
      patchDebug('validating %s', patchFile)
      patches = jsonpatchSchema(unknownPatchedContent)
    } catch (err) {
      patchDebug('file %s is not a valid JSON Patch, skipping', patchFile)
      return { type: 'patch not valid', error: new Error(`source file ${patchFile} is not a valid JSON patch`) }
    }

    try {
      const targetContent = fs.readFileSync(targetFile, 'utf-8')
      const targetJson = JSON.parse(targetContent)

      const newDocument = jsonpatch.applyPatch(targetJson, patches).newDocument

      if (apply) {
        fs.writeFileSync(targetFile, JSON.stringify(newDocument, null, 2))
      }

      return { type: 'result', newDocument }
    } catch (e) {
      return { type: 'uncaught error', error: e }
    }
  }
)