import { map } from "@submodule/core"
import { oraModule } from "./mods"

export const ora = map(
  oraModule,
  (ora) => {
    return ora.default().start()
  }
)