import { createRequire } from "module";
const require = createRequire(import.meta.url);
try {
  const pdf = require("pdf-parse");
  console.log("pdf imported successfully");
} catch (e) {
  console.error("error importing pdf-parse", e);
}
