const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function validateOutputPath(outputPath) {
  if (typeof outputPath !== "string" || outputPath.trim().length === 0) {
    throw new Error("A discovery output path is required");
  }

  const resolvedPath = path.resolve(outputPath);
  if (path.extname(resolvedPath).toLowerCase() !== ".json") {
    throw new Error("Discovery output path must end in .json");
  }
  if (path.basename(resolvedPath).toLowerCase() === "nodes.json") {
    throw new Error("Refusing to write protected nodes.json; choose a dedicated discovery filename");
  }
  return resolvedPath;
}

async function publishDiscoveryFile(outputPath, content, { overwrite = false } = {}) {
  const targetPath = validateOutputPath(outputPath);
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const lockPath = `${targetPath}.lock`;
  let handle;
  let lockHandle;

  try {
    await fs.mkdir(directory, { recursive: true });
    try {
      lockHandle = await fs.open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error("Another discovery publication is in progress for this output path");
      }
      throw error;
    }

    if (!overwrite) {
      try {
        await fs.access(targetPath);
        const error = new Error("Discovery output already exists; pass --overwrite to replace it");
        error.code = "EEXIST";
        throw error;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    handle = await fs.open(temporaryPath, "wx", 0o644);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;

    await fs.rename(temporaryPath, targetPath);
    return targetPath;
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporaryPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (lockHandle) {
      await lockHandle.close();
      await fs.unlink(lockPath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}

module.exports = { validateOutputPath, publishDiscoveryFile };
