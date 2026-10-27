import { createRequire } from "node:module";
import type { MomentFactory } from "../src/time.ts";

export const moment: MomentFactory = createRequire(import.meta.url)("moment");
