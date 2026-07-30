const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { execFile } = require("child_process");
const { Server } = require("socket.io");

const APP_NAME = "Local Chat Viewer";
const IS_PACKAGED =
  Boolean(process.pkg) ||
  (process.platform === "win32" && path.basename(process.execPath).toLowerCase() !== "node.exe");
const STATIC_FOLDER = __dirname;
const DATA_FOLDER =
  process.env.CHAT_VIEWER_DATA_DIR ||
  (IS_PACKAGED
    ? path.join(process.env.APPDATA || path.dirname(process.execPath), APP_NAME)
    : __dirname);
const LOG_FOLDER = process.env.CHAT_LOG_FOLDER || path.join(DATA_FOLDER, "logs");
const TRASH_FOLDER = path.join(LOG_FOLDER, "trash");
const TRIGGER_STATE_FILE = path.join(DATA_FOLDER, ".trigger-state.json");
const SETUP_FILE = path.join(DATA_FOLDER, ".setup-ok.json");
const IMPORT_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 64 * 1024,
  maxTotalBytes: 256 * 1024,
  maxDepth: 4,
};
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".env",
  ".gitignore",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".log",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const SKIPPED_DIRS = new Set([".git", ".hg", ".svn", "node_modules", "dist", "build", ".next"]);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT) || 3000;
let embeddedIndexHtml = null;

if (IS_PACKAGED) {
  try {
    const embeddedAsset = require("./asset-index");
    embeddedIndexHtml =
      typeof embeddedAsset === "string" ? embeddedAsset : embeddedAsset && embeddedAsset.value;
  } catch {
    embeddedIndexHtml = null;
  }
}

let folderWatcher = null;
let fileWatcher = null;
let selectedFile = null;
let selectedPosition = 0;
let selectedPartial = "";
let triggerStarted = false;

fs.mkdirSync(LOG_FOLDER, { recursive: true });

app.use(express.json());
if (embeddedIndexHtml) {
  app.get("/", (req, res) => {
    res.type("html").send(embeddedIndexHtml);
  });
}
app.use(express.static(STATIC_FOLDER));

function openBrowser(url) {
  if (process.env.CHAT_VIEWER_NO_BROWSER === "1") return;

  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  execFile(command, args, { windowsHide: true }, () => {});
}

function setupIsRequired() {
  return IS_PACKAGED || process.env.CHAT_VIEWER_REQUIRE_SETUP === "1";
}

function setupIsComplete() {
  if (!setupIsRequired()) return true;
  return fs.existsSync(SETUP_FILE);
}

function runCommand(command, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
        error: error ? error.message : "",
      });
    });
    child.stdin && child.stdin.end();
  });
}

function codexCommand() {
  if (process.platform !== "win32") {
    return { command: "codex", prefixArgs: [] };
  }

  return {
    command: "powershell.exe",
    prefixArgs: [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(process.env.APPDATA || "", "npm", "codex.ps1"),
    ],
  };
}

async function commandExists(command) {
  if (process.platform === "win32") {
    const result = await runCommand("powershell.exe", [
      "-NoProfile",
      "-Command",
      `if (Get-Command ${JSON.stringify(command)} -ErrorAction SilentlyContinue) { 'OK' } else { exit 1 }`,
    ]);
    return result.ok;
  }

  const result = await runCommand("sh", ["-lc", `command -v ${command}`]);
  return result.ok;
}

async function setupChecks({ probe = false } = {}) {
  const logsWritable = await fs.promises
    .mkdir(LOG_FOLDER, { recursive: true })
    .then(async () => {
      const testPath = path.join(LOG_FOLDER, `.write-test-${Date.now()}.tmp`);
      await fs.promises.writeFile(testPath, "ok");
      await fs.promises.unlink(testPath);
      return true;
    })
    .catch(() => false);

  const claudeFound = await commandExists("claude");
  const codexFound = await commandExists("codex");
  const checks = {
    logsWritable,
    claudeFound,
    codexFound,
    claudeProbe: !probe,
    codexProbe: !probe,
  };

  if (probe && claudeFound) {
    const result = await runCommand("claude", ["-p", "Reply SETUP_OK only."], 60000);
    checks.claudeProbe = result.ok && /SETUP_OK/i.test(`${result.stdout}\n${result.stderr}`);
  }

  if (probe && codexFound) {
    const codex = codexCommand();
    const result = await runCommand(
      codex.command,
      [
        ...codex.prefixArgs,
        "exec",
        "--cd",
        DATA_FOLDER,
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "Reply SETUP_OK only.",
      ],
      90000
    );
    checks.codexProbe = result.ok && /SETUP_OK/i.test(`${result.stdout}\n${result.stderr}`);
  }

  const ok = Object.values(checks).every(Boolean);
  return { required: setupIsRequired(), complete: setupIsComplete(), ok, checks, dataFolder: DATA_FOLDER, logFolder: LOG_FOLDER };
}

async function startTriggerIfReady() {
  const shouldStartEmbeddedTrigger = IS_PACKAGED || process.env.CHAT_VIEWER_EMBED_TRIGGER === "1";
  if (!shouldStartEmbeddedTrigger || triggerStarted || process.env.CHAT_VIEWER_NO_TRIGGER === "1" || !setupIsComplete()) return;

  triggerStarted = true;
  const { startTriggerWatcher } = require("./trigger");
  await startTriggerWatcher();
}

function isJsonlFile(fileName) {
  return fileName.endsWith(".jsonl") && fileName === path.basename(fileName);
}

function filePath(fileName) {
  if (!isJsonlFile(fileName)) {
    throw new Error("Invalid file name");
  }
  return path.join(LOG_FOLDER, fileName);
}

async function listFiles() {
  const entries = await fs.promises.readdir(LOG_FOLDER, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isJsonlFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function parseLine(line) {
  if (!line.trim()) return null;
  try {
    const message = JSON.parse(line);
    if (
      typeof message.time !== "string" ||
      typeof message.author !== "string" ||
      typeof message.text !== "string"
    ) {
      return null;
    }
    return message;
  } catch {
    return null;
  }
}

async function readMessages(fileName) {
  const fullPath = filePath(fileName);
  const text = await fs.promises.readFile(fullPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean);
}

async function appendJsonLine(fileName, message) {
  await fs.promises.appendFile(filePath(fileName), `${JSON.stringify(message)}\n`, "utf8");
}

async function getSize(fileName) {
  const stats = await fs.promises.stat(filePath(fileName)).catch((error) => {
    if (error.code === "ENOENT") return { size: 0 };
    throw error;
  });
  return stats.size;
}

function isProbablyTextFile(fileName) {
  const baseName = path.basename(fileName).toLowerCase();
  const extension = path.extname(baseName);
  return TEXT_EXTENSIONS.has(baseName) || TEXT_EXTENSIONS.has(extension);
}

function relativeImportPath(root, fullPath) {
  return path.relative(root, fullPath).replace(/\\/g, "/");
}

function normalizeImportPath(filePathValue) {
  return String(filePathValue || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/")
    .slice(0, 240);
}

async function readTextSample(fullPath) {
  const handle = await fs.promises.open(fullPath, "r");
  try {
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function scanImportFolder(folderPath) {
  const requestedPath = String(folderPath || "").trim();
  if (!requestedPath) {
    throw new Error("Folder path is required");
  }

  const root = path.resolve(requestedPath);
  const rootStats = await fs.promises.stat(root).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    throw new Error("Folder path must be a readable directory");
  }

  const imported = [];
  const skipped = [];
  let totalBytes = 0;

  async function visit(directory, depth) {
    if (depth > IMPORT_LIMITS.maxDepth || imported.length >= IMPORT_LIMITS.maxFiles) return;

    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      skipped.push({ path: relativeImportPath(root, directory), reason: "unreadable directory" });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (imported.length >= IMPORT_LIMITS.maxFiles) return;

      const fullPath = path.join(directory, entry.name);
      const relativePath = relativeImportPath(root, fullPath);

      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) {
          skipped.push({ path: `${relativePath}/`, reason: "skipped folder" });
          continue;
        }
        await visit(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        skipped.push({ path: relativePath, reason: "not a regular file" });
        continue;
      }

      if (!isProbablyTextFile(entry.name)) {
        skipped.push({ path: relativePath, reason: "unsupported file type" });
        continue;
      }

      let stats;
      try {
        stats = await fs.promises.stat(fullPath);
      } catch {
        skipped.push({ path: relativePath, reason: "unreadable file" });
        continue;
      }

      if (stats.size > IMPORT_LIMITS.maxFileBytes) {
        skipped.push({ path: relativePath, reason: "file too large" });
        continue;
      }

      if (totalBytes + stats.size > IMPORT_LIMITS.maxTotalBytes) {
        skipped.push({ path: relativePath, reason: "total import limit reached" });
        continue;
      }

      const sample = await readTextSample(fullPath).catch(() => null);
      if (!sample || sample.includes(0)) {
        skipped.push({ path: relativePath, reason: "binary or unreadable content" });
        continue;
      }

      const content = await fs.promises.readFile(fullPath, "utf8").catch(() => null);
      if (content === null) {
        skipped.push({ path: relativePath, reason: "could not read as text" });
        continue;
      }

      totalBytes += Buffer.byteLength(content, "utf8");
      imported.push({ path: relativePath, bytes: stats.size, content });
    }
  }

  await visit(root, 0);

  return { root, imported, skipped, totalBytes, limits: IMPORT_LIMITS };
}

function scanPostedFiles(rootName, postedFiles) {
  const files = Array.isArray(postedFiles) ? postedFiles : [];
  const imported = [];
  const skipped = [];
  let totalBytes = 0;

  for (const file of files) {
    if (imported.length >= IMPORT_LIMITS.maxFiles) {
      skipped.push({ path: normalizeImportPath(file && file.path) || "unknown", reason: "file limit reached" });
      continue;
    }

    const relativePath = normalizeImportPath(file && file.path);
    if (!relativePath) {
      skipped.push({ path: "unknown", reason: "missing file name" });
      continue;
    }

    const depth = relativePath.split("/").length - 1;
    if (depth > IMPORT_LIMITS.maxDepth) {
      skipped.push({ path: relativePath, reason: "depth limit reached" });
      continue;
    }

    if (!isProbablyTextFile(relativePath)) {
      skipped.push({ path: relativePath, reason: "unsupported file type" });
      continue;
    }

    const content = typeof file.content === "string" ? file.content : "";
    const bytes = Buffer.byteLength(content, "utf8");

    if (!content) {
      skipped.push({ path: relativePath, reason: "empty or unreadable content" });
      continue;
    }

    if (content.includes("\u0000")) {
      skipped.push({ path: relativePath, reason: "binary or unreadable content" });
      continue;
    }

    if (bytes > IMPORT_LIMITS.maxFileBytes) {
      skipped.push({ path: relativePath, reason: "file too large" });
      continue;
    }

    if (totalBytes + bytes > IMPORT_LIMITS.maxTotalBytes) {
      skipped.push({ path: relativePath, reason: "total import limit reached" });
      continue;
    }

    totalBytes += bytes;
    imported.push({ path: relativePath, bytes, content });
  }

  return {
    root: String(rootName || "Browser selection").trim().slice(0, 240) || "Browser selection",
    imported,
    skipped,
    totalBytes,
    limits: IMPORT_LIMITS,
  };
}

async function appendImportResult(fileName, result, label) {
  if (!result.imported.length) {
    const error = new Error("No readable text files were found within the import limits");
    error.status = 400;
    error.skipped = result.skipped;
    throw error;
  }

  const manifest = {
    time: new Date().toISOString(),
    author: "memory",
    text: [
      `${label} memory import manifest`,
      `Root: ${result.root}`,
      `Imported files: ${result.imported.length}`,
      `Imported bytes: ${result.totalBytes}`,
      `Limits: ${result.limits.maxFiles} files, ${result.limits.maxFileBytes} bytes per file, ${result.limits.maxTotalBytes} bytes total, depth ${result.limits.maxDepth}`,
      "",
      "Files:",
      ...result.imported.map((file) => `- ${file.path} (${file.bytes} bytes)`),
      ...(result.skipped.length
        ? ["", "Skipped:", ...result.skipped.slice(0, 40).map((file) => `- ${file.path}: ${file.reason}`)]
        : []),
    ].join("\n"),
  };

  await appendJsonLine(fileName, manifest);

  for (const file of result.imported) {
    await appendJsonLine(fileName, {
      time: new Date().toISOString(),
      author: "memory",
      text: `Imported file: ${file.path}\n\n${file.content}`,
    });
  }

  return {
    imported: result.imported.map(({ path: importedPath, bytes }) => ({ path: importedPath, bytes })),
    skipped: result.skipped,
  };
}

async function emitFileList() {
  io.emit("files", await listFiles());
}

async function removeTriggerState(fileName) {
  let state;
  try {
    state = JSON.parse(await fs.promises.readFile(TRIGGER_STATE_FILE, "utf8"));
  } catch {
    return;
  }

  if (!state || typeof state !== "object" || !Object.prototype.hasOwnProperty.call(state, fileName)) {
    return;
  }

  delete state[fileName];
  await fs.promises.writeFile(TRIGGER_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function uniqueTrashPath(fileName) {
  await fs.promises.mkdir(TRASH_FOLDER, { recursive: true });
  const parsed = path.parse(fileName);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt ? `-${attempt}` : "";
    const trashName = `${parsed.name}.${stamp}${suffix}${parsed.ext}`;
    const trashPath = path.join(TRASH_FOLDER, trashName);
    const exists = await fs.promises
      .access(trashPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) return { trashName, trashPath };
  }

  throw new Error("Could not create a unique trash file");
}

async function createConversationFile() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt ? `-${attempt}` : "";
    const name = `conversation-${new Date().toISOString().replace(/[:.]/g, "-")}${suffix}.jsonl`;

    try {
      const handle = await fs.promises.open(filePath(name), "ax");
      await handle.close();
      return name;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  throw new Error("Could not create a unique conversation file");
}

function conversationFileName(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/\.jsonl$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  if (!cleaned) {
    throw new Error("Conversation name is required");
  }

  return `${cleaned}.jsonl`;
}

async function watchSelectedFile(fileName) {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }

  selectedFile = fileName;
  selectedPosition = await getSize(fileName);
  selectedPartial = "";

  fileWatcher = fs.watch(filePath(fileName), async (eventType) => {
    if (eventType !== "change" || selectedFile !== fileName) return;

    const fullPath = filePath(fileName);
    const stats = await fs.promises.stat(fullPath).catch(() => null);
    if (!stats) return;

    if (stats.size < selectedPosition) {
      selectedPosition = stats.size;
      selectedPartial = "";
      return;
    }

    if (stats.size === selectedPosition) return;

    const stream = fs.createReadStream(fullPath, {
      encoding: "utf8",
      start: selectedPosition,
      end: stats.size - 1,
    });

    let chunk = "";
    stream.on("data", (data) => {
      chunk += data;
    });
    stream.on("end", () => {
      selectedPosition = stats.size;
      const lines = (selectedPartial + chunk).split(/\r?\n/);
      selectedPartial = lines.pop() || "";

      for (const line of lines) {
        const message = parseLine(line);
        if (message) {
          io.emit("message", { file: fileName, message });
        }
      }
    });
    stream.on("error", () => {});
  });
}

app.get("/api/files", async (req, res) => {
  res.json(await listFiles());
});

app.get("/api/setup", async (req, res) => {
  res.json(await setupChecks());
});

app.post("/api/setup/run", async (req, res) => {
  const result = await setupChecks({ probe: true });
  if (result.ok) {
    await fs.promises.writeFile(
      SETUP_FILE,
      `${JSON.stringify({ time: new Date().toISOString(), checks: result.checks }, null, 2)}\n`,
      "utf8"
    );
    result.complete = true;
    await startTriggerIfReady().catch((error) => {
      result.triggerError = error.message;
    });
  }

  res.json(result);
});

app.get("/api/conversations/:file", async (req, res) => {
  try {
    res.json(await readMessages(req.params.file));
  } catch {
    res.status(400).json({ error: "Could not read conversation" });
  }
});

app.post("/api/conversations", async (req, res) => {
  const name = await createConversationFile();
  await emitFileList();
  res.status(201).json({ file: name });
});

app.patch("/api/conversations/:file", async (req, res) => {
  try {
    const oldName = req.params.file;
    const newName = conversationFileName(req.body.name);
    const wasSelected = selectedFile === oldName;

    if (oldName === newName) {
      res.json({ file: newName });
      return;
    }

    if (!isJsonlFile(oldName) || !isJsonlFile(newName)) {
      res.status(400).json({ error: "Invalid conversation name" });
      return;
    }

    const oldPath = filePath(oldName);
    const newPath = filePath(newName);

    const targetExists = await fs.promises
      .access(newPath)
      .then(() => true)
      .catch(() => false);
    if (targetExists) {
      res.status(409).json({ error: "A conversation with that name already exists" });
      return;
    }

    if (wasSelected && fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
      selectedFile = null;
      selectedPosition = 0;
      selectedPartial = "";
    }

    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (error) {
      if (wasSelected) {
        await watchSelectedFile(oldName).catch(() => {});
      }
      throw error;
    }

    if (wasSelected) {
      await watchSelectedFile(newName);
    }

    await emitFileList();
    res.json({ file: newName });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not rename conversation" });
  }
});

app.delete("/api/conversations/:file", async (req, res) => {
  try {
    const fileName = req.params.file;
    if (!isJsonlFile(fileName)) {
      res.status(400).json({ error: "Invalid conversation name" });
      return;
    }

    const fullPath = filePath(fileName);
    const stats = await fs.promises.stat(fullPath).catch(() => null);
    if (!stats || !stats.isFile()) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const wasSelected = selectedFile === fileName;
    if (wasSelected && fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
      selectedFile = null;
      selectedPosition = 0;
      selectedPartial = "";
    }

    const { trashName, trashPath } = await uniqueTrashPath(fileName);
    try {
      await fs.promises.rename(fullPath, trashPath);
    } catch (error) {
      if (wasSelected) {
        await watchSelectedFile(fileName).catch(() => {});
      }
      throw error;
    }

    await removeTriggerState(fileName);
    await emitFileList();
    res.json({ file: fileName, trashedAs: `trash/${trashName}` });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not delete conversation" });
  }
});

app.post("/api/conversations/:file/messages", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) {
      res.status(400).json({ error: "Message text is required" });
      return;
    }

    const message = {
      time: new Date().toISOString(),
      author: "maher",
      text,
    };

    await appendJsonLine(req.params.file, message);
    res.status(201).json(message);
  } catch {
    res.status(400).json({ error: "Could not append message" });
  }
});

app.post("/api/conversations/:file/import-folder", async (req, res) => {
  try {
    const result = await scanImportFolder(req.body.folderPath);
    res.status(201).json(await appendImportResult(req.params.file, result, "Folder"));
  } catch (error) {
    res.status(error.status || 400).json({
      error: error.message || "Could not import folder",
      skipped: error.skipped || [],
    });
  }
});

app.post("/api/conversations/:file/import-files", async (req, res) => {
  try {
    const result = scanPostedFiles(req.body.rootName, req.body.files);
    res.status(201).json(await appendImportResult(req.params.file, result, "Selected file"));
  } catch (error) {
    res.status(error.status || 400).json({
      error: error.message || "Could not import selected files",
      skipped: error.skipped || [],
    });
  }
});

io.on("connection", (socket) => {
  socket.on("select", async (fileName) => {
    try {
      await watchSelectedFile(fileName);
    } catch {
      socket.emit("errorMessage", "Could not watch selected file");
    }
  });
});

folderWatcher = fs.watch(LOG_FOLDER, async () => {
  await emitFileList();
});

process.on("SIGINT", () => {
  if (folderWatcher) folderWatcher.close();
  if (fileWatcher) fileWatcher.close();
  server.close(() => process.exit(0));
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Chat viewer running at ${url}`);
  console.log(`Reading .jsonl files from ${LOG_FOLDER}`);
  openBrowser(url);

  startTriggerIfReady().catch((error) => {
    console.error("Trigger watcher failed:", error);
  });
});
