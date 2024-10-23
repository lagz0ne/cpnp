import { combine, map } from "@submodule/core";
import { writeConfig, readConfig, hasPackage } from "./config";
import { applyArtifact, pullArtifact } from "./components";

type ConfigCommand =
  | { type: 'set-runtime', runtime: 'bun' | 'npm' | 'yarn' | 'pnpm' }

export const updateConfig = map(
  combine({ writeConfig, readConfig }),
  ({ writeConfig, readConfig }) => async (command: ConfigCommand) => {
    const config = await readConfig()

    if (command.type === 'set-runtime') {
      config.pkg = command.runtime
      return writeConfig(config)
    }
  }
)

export const update = map(
  combine({ pullArtifact }),
  async ({ pullArtifact }) => {
    return async (artifact: string) => {
      return await pullArtifact(artifact)
    }
  }
)

export const use = map(
  combine({ applyArtifact, pullArtifact, hasPackage }),
  async ({ applyArtifact, pullArtifact, hasPackage }) => {
    return async (artifact: string, applyDir: string) => {
      if (!await hasPackage(artifact)) {
        const pullResult = await pullArtifact(artifact)

        if (pullResult.type !== 'ok') {
          return pullResult
        }
      }

      return await applyArtifact(artifact, applyDir)
    }
  }
)