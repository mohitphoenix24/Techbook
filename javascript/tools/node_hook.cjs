// Preloaded (node -r) by build.py: records stdout/stderr chunks in order, so the course can show
// exactly what a program printed, and the order of console.log vs console.error.
const fs = require("fs");
const log = [];
const out = process.stdout.write.bind(process.stdout);
const err = process.stderr.write.bind(process.stderr);
const rec = (k) => function (chunk, enc, cb) {
  log.push([k, Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)]);
  if (typeof enc === "function") enc();
  else if (typeof cb === "function") cb();
  return true;
};
process.stdout.write = rec("o");
process.stderr.write = rec("e");
process.on("exit", () => {
  process.stdout.write = out; process.stderr.write = err;
  try { fs.writeFileSync(process.env.JSLAB_LOG, JSON.stringify(log)); } catch (e) {}
});
