const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");

const APP_NAME = "Local Chat Viewer";
const IS_PACKAGED =
  Boolean(process.pkg) ||
  (process.platform === "win32" && path.basename(process.execPath).toLowerCase() !== "node.exe");
const DATA_FOLDER =
  process.env.CHAT_VIEWER_DATA_DIR ||
  (IS_PACKAGED
    ? path.join(process.env.APPDATA || path.dirname(process.execPath), APP_NAME)
    : __dirname);
const LOG_FOLDER = process.env.CHAT_LOG_FOLDER || path.join(DATA_FOLDER, "logs");

const STATE_FILE = path.join(DATA_FOLDER, ".trigger-state.json");
const LOCK_STALE_MS = Number(process.env.TRIGGER_LOCK_STALE_MS || 10 * 60 * 1000);
const WATCHDOG_ENABLED = process.env.WATCHDOG_ENABLED === "1";
const WATCHDOG_ADMIN_AGENT = (process.env.WATCHDOG_ADMIN_AGENT || "codex").toLowerCase();
const WATCHDOG_INTERVAL_MS = Math.max(Number(process.env.WATCHDOG_INTERVAL_MS || 5 * 60 * 1000), 60 * 1000);
const WATCHDOG_CONTEXT_MESSAGES = Math.max(Number(process.env.WATCHDOG_CONTEXT_MESSAGES || 12), 1);
const WATCHDOG_SUMMARY_FILE = process.env.WATCHDOG_SUMMARY_FILE || path.join(LOG_FOLDER, ".project-summary.md");
const WATCHDOG_FILE = process.env.WATCHDOG_FILE || "";
const AGENTS = {
  codex: process.env.CODEX_TRIGGER_CMD || "",
  claude: process.env.CLAUDE_TRIGGER_CMD || "",
};

const fileStates = new Map();
const fileWatchers = new Map();
const runningAgents = new Set();
const runningChildren = new Map();
const CODEX_COMMAND = process.platform === "win32" ? "powershell.exe" : "codex";
let watchdogTimer = null;
const EXTRA_PATH_DIRS =
  process.platform === "win32"
    ? []
    : [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        path.join(process.env.HOME || "", ".npm-global", "bin"),
        path.join(process.env.HOME || "", ".local", "bin"),
      ];

function extendedPath() {
  const current = process.env.PATH || "";
  const missing = EXTRA_PATH_DIRS.filter((dir) => !current.split(path.delimiter).includes(dir));
  return missing.length ? [...missing, current].join(path.delimiter) : current;
}

fs.mkdirSync(LOG_FOLDER, { recursive: true });

function isJsonlFile(fileName) {
  return fileName.endsWith(".jsonl") && fileName === path.basename(fileName);
}

function filePath(fileName) {
  return path.join(LOG_FOLDER, fileName);
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

function loadSavedState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState() {
  const state = {};
  for (const [fileName, fileState] of fileStates.entries()) {
    state[fileName] = { position: fileState.position };
  }
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function unwatchFile(fileName) {
  const watcher = fileWatchers.get(fileName);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(fileName);
  }
  fileStates.delete(fileName);
}

function commandEnv(fileName, message) {
  return {
    ...process.env,
    PATH: extendedPath(),
    CHAT_FILE: filePath(fileName),
    CHAT_FILE_NAME: fileName,
    CHAT_AUTHOR: message.author,
    CHAT_TIME: message.time,
    CHAT_TEXT: message.text,
  };
}

function agentLockPath(agent) {
  return path.join(DATA_FOLDER, `.trigger-${agent}.lock`);
}

function tryAcquireAgentLock(agent) {
  if (runningAgents.has(agent)) {
    console.log(`[trigger:${agent}] skipped; ${agent} is already running`);
    return null;
  }

  const lockPath = agentLockPath(agent);
  try {
    const stats = fs.statSync(lockPath);
    if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
      fs.unlinkSync(lockPath);
    } else {
      console.log(`[trigger:${agent}] skipped; lock exists at ${lockPath}`);
      return null;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.log(`[trigger:${agent}] skipped; could not inspect lock: ${error.message}`);
      return null;
    }
  }

  try {
    const handle = fs.openSync(lockPath, "wx");
    fs.writeFileSync(handle, `${JSON.stringify({ pid: process.pid, agent, time: new Date().toISOString() })}\n`);
    fs.closeSync(handle);
    runningAgents.add(agent);
  } catch (error) {
    console.log(`[trigger:${agent}] skipped; could not acquire lock: ${error.message}`);
    return null;
  }

  return () => {
    runningAgents.delete(agent);
    try {
      fs.unlinkSync(lockPath);
    } catch {}
  };
}

function triggerAgents(fileName, message) {
  for (const [agent, command] of Object.entries(AGENTS)) {
    if (message.author === agent) continue;

    console.log(`[trigger:${agent}] ${fileName} ${message.author}: ${message.text}`);

    if (agent === "codex" && !command) {
      runCodex(fileName, message);
      continue;
    }

    if (agent === "claude" && !command) {
      runClaude(fileName, message);
      continue;
    }

    if (!command) continue;

    const release = tryAcquireAgentLock(agent);
    if (!release) continue;

    exec(command, { env: commandEnv(fileName, message) }, (error, stdout, stderr) => {
      release();
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (error) {
        console.error(`[trigger:${agent}] command failed: ${error.message}`);
      }
    });
  }
}

function triggerPrompt(agent, fileName, message) {
  return [
    `You are ${agent} participating in a shared append-only JSONL chat log.`,
    "",
    `Shared log: ${filePath(fileName)}`,
    "",
    "Newest triggering message:",
    `author: ${message.author}`,
    `time: ${message.time}`,
    `text: ${message.text}`,
    "",
    "Rules:",
    `- Read the shared log before replying.`,
    `- If the newest readable message is authored by ${agent}, do nothing.`,
    "- Otherwise append exactly one JSON line to the same file.",
    "- The JSON object must have: time, author, text.",
    `- Use author "${agent}".`,
    "- Use the current UTC ISO time.",
    "- Never rewrite, truncate, or overwrite the file. Append only.",
    "- Skip malformed lines.",
    "- Reply to Maher messages, and reply to direct agent-to-agent questions.",
    "- Do not reply to pure acknowledgments or status lines that do not require a response.",
    "- Keep the reply concise and natural.",
  ].join("\n");
}

function watchdogPrompt(agent, fileName, message) {
  return [
    `You are ${agent} acting as the admin watchdog for a shared append-only JSONL chat log.`,
    "",
    `Shared log: ${filePath(fileName)}`,
    `Project summary path: ${WATCHDOG_SUMMARY_FILE}`,
    `Read policy: read the project summary if it exists, then read only the last ${WATCHDOG_CONTEXT_MESSAGES} readable JSONL messages unless more context is required to confirm a stall.`,
    "",
    "Newest message at watchdog wake:",
    `author: ${message.author}`,
    `time: ${message.time}`,
    `text: ${message.text}`,
    "",
    "Rules:",
    "- You are the only agent woken by this watchdog interval.",
    "- Check for expected artifacts or clear progress, not just chat activity.",
    "- If work is progressing or there is no actionable stall, do nothing and append nothing.",
    "- If work is stalled, append exactly one JSON line to the shared log that names the stalled owner, expected artifact, and next action.",
    "- The JSON object must have: time, author, text.",
    `- Use author "${agent}".`,
    "- Use the current UTC ISO time.",
    "- Never rewrite, truncate, or overwrite the file. Append only.",
    "- Keep any appended escalation concise and natural.",
  ].join("\n");
}

function runCodex(fileName, message, prompt = triggerPrompt("codex", fileName, message)) {
  const release = tryAcquireAgentLock("codex");
  if (!release) {
    return;
  }

  const child = spawn(
    CODEX_COMMAND,
    process.platform === "win32"
      ? [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(process.env.APPDATA || "", "npm", "codex.ps1"),
          "exec",
          "--cd",
          __dirname,
          "--add-dir",
          LOG_FOLDER,
          "--skip-git-repo-check",
          "--sandbox",
          "workspace-write",
          prompt,
        ]
      : [
      "exec",
      "--cd",
      __dirname,
      "--add-dir",
      LOG_FOLDER,
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      prompt,
        ],
    {
      cwd: __dirname,
      env: commandEnv(fileName, message),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  runningChildren.set("codex", child);
  const timeout = setTimeout(() => {
    console.error("[trigger:codex] timed out after 120s");
    child.kill();
  }, 120000);

  child.stdout.on("data", (data) => {
    process.stdout.write(`[codex:stdout] ${data}`);
  });
  child.stderr.on("data", (data) => {
    process.stderr.write(`[codex:stderr] ${data}`);
  });
  child.on("error", (error) => {
    console.error(`[trigger:codex] failed to start: ${error.message}`);
    release();
  });
  child.on("close", (code) => {
    clearTimeout(timeout);
    release();
    runningChildren.delete("codex");
    console.log(`[trigger:codex] exited with code ${code}`);
  });
}

function runClaude(fileName, message, prompt = triggerPrompt("claude", fileName, message)) {
  const release = tryAcquireAgentLock("claude");
  if (!release) {
    return;
  }

  const child = spawn(
    "claude",
    [
      "-p",
      "--add-dir",
      LOG_FOLDER,
      "--permission-mode",
      "bypassPermissions",
      "--dangerously-skip-permissions",
      prompt,
    ],
    {
    cwd: __dirname,
    env: commandEnv(fileName, message),
    stdio: ["ignore", "pipe", "pipe"],
    }
  );
  runningChildren.set("claude", child);
  const timeout = setTimeout(() => {
    console.error("[trigger:claude] timed out after 90s");
    child.kill();
  }, 90000);

  child.stdout.on("data", (data) => {
    process.stdout.write(`[claude:stdout] ${data}`);
  });
  child.stderr.on("data", (data) => {
    process.stderr.write(`[claude:stderr] ${data}`);
  });
  child.on("error", (error) => {
    console.error(`[trigger:claude] failed to start: ${error.message}`);
    release();
  });
  child.on("close", (code) => {
    clearTimeout(timeout);
    release();
    runningChildren.delete("claude");
    console.log(`[trigger:claude] exited with code ${code}`);
  });
}

async function readRecentMessages(fileName, limit) {
  const text = await fs.promises.readFile(filePath(fileName), "utf8").catch(() => "");
  return text
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean)
    .slice(-limit);
}

async function watchdogTick() {
  if (!WATCHDOG_ENABLED) return;
  if (!Object.prototype.hasOwnProperty.call(AGENTS, WATCHDOG_ADMIN_AGENT)) {
    console.error(`[watchdog] unsupported admin agent: ${WATCHDOG_ADMIN_AGENT}`);
    return;
  }

  const files = WATCHDOG_FILE
    ? [WATCHDOG_FILE].filter(isJsonlFile)
    : Array.from(fileStates.keys()).filter(isJsonlFile);

  for (const fileName of files) {
    const recent = await readRecentMessages(fileName, WATCHDOG_CONTEXT_MESSAGES);
    const latest = recent[recent.length - 1];
    if (!latest || latest.author === WATCHDOG_ADMIN_AGENT) continue;

    const message = {
      author: latest.author,
      time: new Date().toISOString(),
      text: `Admin watchdog interval elapsed. Latest readable message: ${latest.author} at ${latest.time}: ${latest.text}`,
    };
    const prompt = watchdogPrompt(WATCHDOG_ADMIN_AGENT, fileName, latest);
    console.log(`[watchdog:${WATCHDOG_ADMIN_AGENT}] checking ${fileName}`);

    if (WATCHDOG_ADMIN_AGENT === "codex") {
      runCodex(fileName, message, prompt);
    } else if (WATCHDOG_ADMIN_AGENT === "claude") {
      runClaude(fileName, message, prompt);
    }
  }
}

async function readAppendedLines(fileName) {
  const fullPath = filePath(fileName);
  const fileState = fileStates.get(fileName);
  if (!fileState) return;

  const stats = await fs.promises.stat(fullPath).catch(() => null);
  if (!stats) {
    unwatchFile(fileName);
    saveState();
    return;
  }

  if (stats.size < fileState.position) {
    fileState.position = stats.size;
    fileState.partial = "";
    saveState();
    return;
  }

  if (stats.size === fileState.position) return;

  const stream = fs.createReadStream(fullPath, {
    encoding: "utf8",
    start: fileState.position,
    end: stats.size - 1,
  });

  let chunk = "";
  stream.on("data", (data) => {
    chunk += data;
  });
  stream.on("end", () => {
    fileState.position = stats.size;
    const lines = (fileState.partial + chunk).split(/\r?\n/);
    fileState.partial = lines.pop() || "";

    for (const line of lines) {
      const message = parseLine(line);
      if (message) {
        triggerAgents(fileName, message);
      }
    }

    saveState();
  });
  stream.on("error", () => {});
}

async function watchFile(fileName, savedState) {
  if (!isJsonlFile(fileName) || fileWatchers.has(fileName)) return;

  const fullPath = filePath(fileName);
  const stats = await fs.promises.stat(fullPath).catch(() => null);
  if (!stats) return;

  const savedPosition = savedState[fileName] && Number(savedState[fileName].position);
  const position = Number.isFinite(savedPosition) ? Math.min(savedPosition, stats.size) : stats.size;

  fileStates.set(fileName, { position, partial: "" });
  const watcher = fs.watch(fullPath, async (eventType) => {
    if (eventType === "rename") {
      const exists = await fs.promises
        .stat(fullPath)
        .then((stats) => stats.isFile())
        .catch(() => false);
      if (!exists) {
        unwatchFile(fileName);
        saveState();
      }
      return;
    }

    if (eventType === "change") {
      readAppendedLines(fileName);
    }
  });
  watcher.on("error", () => {
    unwatchFile(fileName);
    saveState();
  });
  fileWatchers.set(fileName, watcher);

  console.log(`[watching] ${fileName} from byte ${position}`);
}

async function scanFolder(savedState) {
  const entries = await fs.promises.readdir(LOG_FOLDER, { withFileTypes: true });
  const currentFiles = new Set();

  for (const entry of entries) {
    if (entry.isFile() && isJsonlFile(entry.name)) {
      currentFiles.add(entry.name);
      await watchFile(entry.name, savedState);
    }
  }

  let removed = false;
  for (const fileName of fileStates.keys()) {
    if (!currentFiles.has(fileName)) {
      unwatchFile(fileName);
      removed = true;
    }
  }
  if (removed) saveState();
}

async function startTriggerWatcher() {
  const savedState = loadSavedState();
  await scanFolder(savedState);
  saveState();

  const folderWatcher = fs.watch(LOG_FOLDER, async () => {
    await scanFolder(loadSavedState());
  });

  if (WATCHDOG_ENABLED) {
    watchdogTimer = setInterval(() => {
      watchdogTick().catch((error) => {
        console.error(`[watchdog] failed: ${error.message}`);
      });
    }, WATCHDOG_INTERVAL_MS);
  }

  process.on("SIGINT", () => {
    if (watchdogTimer) clearInterval(watchdogTimer);
    folderWatcher.close();
    for (const watcher of fileWatchers.values()) {
      watcher.close();
    }
    process.exit(0);
  });

  console.log("Trigger watcher running.");
  console.log(`Logs: ${LOG_FOLDER}`);
  console.log("Claude trigger: built-in claude -p launcher");
  console.log("Codex trigger: built-in codex exec launcher");
  if (WATCHDOG_ENABLED) {
    console.log(`Admin watchdog: ${WATCHDOG_ADMIN_AGENT} every ${WATCHDOG_INTERVAL_MS}ms`);
  }
}

module.exports = { startTriggerWatcher };

if (require.main === module) {
  startTriggerWatcher().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
