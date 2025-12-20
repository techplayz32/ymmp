import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as zlib from "zlib";
import { promisify } from "util";
import { pipeline } from "stream/promises";
import { Logger } from "./logger.js";
import { ConfigManager } from "./config.js";
import { GitHubService, ReleaseMetadata } from "./github.js";
import { exec } from "child_process";
import { Ora } from "ora";

// @ts-ignore
import { getRawHeader } from "@electron/asar";

const execAsync = promisify(exec);
const unzipPromise = promisify(zlib.unzip);

interface PatcherOptions {
  patchType?: "default" | "devtoolsOnly";
  customPath?: string;
  useCache?: boolean;
  keepCache?: boolean;
  githubToken?: string;
  force?: boolean;
}

export class Patcher {
  private logger: Logger;
  private config: ConfigManager;
  private github: GitHubService;
  private options: Required<PatcherOptions>;
  private cacheDir: string;
  private tmpDir: string;
  private platform: NodeJS.Platform;
  private ymPath: string;
  private ymAsarPath: string;
  private ymExePath: string | null = null;

  constructor(options: PatcherOptions = {}) {
    this.logger = new Logger("Patcher");
    this.config = new ConfigManager();
    this.github = new GitHubService(this.config);
    this.platform = os.platform();

    const resolvedPath =
      options.customPath || this.config.get("customPath") || "";

    this.options = {
      patchType: options.patchType || "default",
      customPath: resolvedPath,
      useCache: options.useCache !== false,
      keepCache: options.keepCache !== false,
      githubToken: options.githubToken || "",
      force: options.force || false,
    };

    const homeDir = os.homedir();
    this.cacheDir = path.join(homeDir, ".ymmp-cache");
    this.tmpDir = path.join(this.cacheDir, "temp");

    this.ymPath = this.options.customPath || this.getDefaultYMPath();
    this.ymAsarPath = this.resolveAsarPath(this.ymPath);
    this.ymExePath = this.resolveExePath(this.ymPath);

    this.ensureDirs();
  }

  private getDefaultYMPath(): string {
    switch (this.platform) {
      case "darwin":
        return path.join("/Applications", "Яндекс Музыка.app");
      case "linux":
        return path.join("/opt", "Яндекс Музыка");
      case "win32":
        return path.join(
          process.env.LOCALAPPDATA || "",
          "Programs",
          "YandexMusic",
        );
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  private resolveAsarPath(appPath: string): string {
    switch (this.platform) {
      case "darwin":
        return path.join(appPath, "Contents", "Resources", "app.asar");
      case "win32":
      case "linux":
        return path.join(appPath, "resources", "app.asar");
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  private resolveExePath(appPath: string): string | null {
    if (this.platform === "win32")
      return path.join(appPath, "Яндекс Музыка.exe");
    return null;
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.cacheDir))
      fs.mkdirSync(this.cacheDir, { recursive: true });
    if (!fs.existsSync(this.tmpDir))
      fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  async checkInstallPossible(): Promise<{
    status: boolean;
    message?: string;
    request?: string;
  }> {
    if (!fs.existsSync(this.ymAsarPath)) {
      return {
        status: false,
        message: `Yandex Music not found at: ${this.ymAsarPath}`,
        request: "REQUEST_YM_PATH",
      };
    }
    try {
      await fsp.access(this.ymAsarPath, fs.constants.R_OK | fs.constants.W_OK);
      return { status: true };
    } catch {
      return {
        status: false,
        message: "No write permissions",
        request: "REQUEST_PERMISSIONS",
      };
    }
  }

  async getInstalledMetadata(): Promise<any> {
    const metadataPath = path.join(this.ymAsarPath, "package.json");
    if (!fs.existsSync(metadataPath)) return null;
    return JSON.parse(await fsp.readFile(metadataPath, "utf-8"));
  }

  // Helper to expose Release info to CLI
  async fetchReleaseInfo() {
    return this.github.getLatestRelease(this.options.githubToken);
  }

  async patch(spinner?: Ora): Promise<void> {
    const updateStatus = (text: string) => {
      if (spinner) spinner.text = text;
      else this.logger.info(text);
    };

    const check = await this.checkInstallPossible();
    if (!check.status) throw new Error(check.message);

    updateStatus("Checking process status...");
    const processes = await this.getYandexMusicProcesses();
    if (processes.length > 0) {
      if (!this.options.force) {
        throw new Error(
          "Yandex Music is running. Please close it or use --force to kill it.",
        );
      }
      updateStatus("Closing Yandex Music...");
      await this.killProcesses(processes);
    }

    let originalHash = "";
    if (this.platform === "win32") {
      updateStatus("Calculating integrity hash...");
      originalHash = this.calculateAsarHeaderHash(this.ymAsarPath);
    }

    updateStatus("Fetching release info...");
    const metadata = await this.github.getLatestRelease(
      this.options.githubToken,
    );

    updateStatus("Downloading assets...");
    await this.downloadModFiles(metadata, spinner);

    updateStatus("Backing up...");
    await this.createBackup();

    updateStatus("Applying patch...");
    await this.replaceAsar();

    if (this.platform === "win32") {
      const newHash = this.calculateAsarHeaderHash(this.ymAsarPath);
      updateStatus("Patching executable integrity...");
      await this.bypassIntegrityWin(originalHash, newHash);
    } else if (this.platform === "darwin") {
      await this.bypassIntegrityMac();
    }

    if (!this.options.keepCache) {
      await this.clearCaches(false);
    }

    if (processes.length > 0) {
      updateStatus("Restarting Yandex Music...");
      await this.launchYandexMusic();
    }
  }

  private calculateAsarHeaderHash(asarPath: string): string {
    const header = getRawHeader(asarPath);
    return crypto
      .createHash("sha256")
      .update(header.headerString)
      .digest("hex");
  }

  private async createBackup(): Promise<void> {
    await fsp.copyFile(
      this.ymAsarPath,
      path.join(this.tmpDir, "app.asar.backup"),
    );
  }

  private async replaceAsar(): Promise<void> {
    await fsp.copyFile(path.join(this.tmpDir, "app.asar"), this.ymAsarPath);
  }

  private async bypassIntegrityMac(): Promise<void> {
    try {
      await execAsync(`codesign --force --deep --sign - "${this.ymPath}"`);
    } catch {
      this.logger.warn("Codesign failed. App might be damaged.");
    }
  }

  private async bypassIntegrityWin(
    oldHash: string,
    newHash: string,
  ): Promise<void> {
    if (
      !this.ymExePath ||
      !fs.existsSync(this.ymExePath) ||
      oldHash === newHash
    )
      return;

    // Backup EXE
    if (!fs.existsSync(this.ymExePath + ".backup")) {
      await fsp.copyFile(this.ymExePath, this.ymExePath + ".backup");
    }

    const fileBuffer = await fsp.readFile(this.ymExePath);
    const oldBuf = Buffer.from(oldHash, "ascii");
    const newBuf = Buffer.from(newHash, "ascii");

    if (fileBuffer.indexOf(oldBuf) === -1) {
      this.logger.warn("Original hash not found in EXE. Already patched?");
      return;
    }

    let offset = 0;
    while (true) {
      const idx = fileBuffer.indexOf(oldBuf, offset);
      if (idx === -1) break;
      newBuf.copy(fileBuffer, idx);
      offset = idx + oldBuf.length;
    }
    await fsp.writeFile(this.ymExePath, fileBuffer);
  }

  private async downloadModFiles(
    metadata: ReleaseMetadata,
    spinner?: Ora,
  ): Promise<void> {
    const assetPrefix =
      this.options.patchType === "default" ? "app.asar" : "appDevTools.asar";
    let asset =
      metadata.assets.find((a) => a.name === `${assetPrefix}.gz`) ||
      metadata.assets.find((a) => a.name === assetPrefix);

    if (!asset) throw new Error("No suitable asset found in release");

    const destPath = path.join(this.tmpDir, asset.name);
    const isGz = asset.name.endsWith(".gz");

    // Cache check
    if (this.options.useCache && fs.existsSync(destPath)) {
      const stats = await fsp.stat(destPath);
      if (stats.size === asset.size) {
        if (isGz)
          await this.decompressFile(
            destPath,
            path.join(this.tmpDir, "app.asar"),
          );
        return;
      }
    }

    const response = await this.github.downloadStream(
      asset.browser_download_url,
      this.options.githubToken,
    );
    const totalLength = parseInt(response.headers["content-length"] || "0");

    let downloaded = 0;
    response.data.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (spinner && totalLength) {
        const percent = Math.round((downloaded / totalLength) * 100);
        spinner.text = `Downloading... ${percent}%`;
      }
    });

    await pipeline(response.data, fs.createWriteStream(destPath));

    if (isGz) {
      if (spinner) spinner.text = "Decompressing...";
      await this.decompressFile(destPath, path.join(this.tmpDir, "app.asar"));
    }
  }

  private async decompressFile(source: string, dest: string): Promise<void> {
    const compressed = await fsp.readFile(source);
    const decompressed = await unzipPromise(compressed);
    await fsp.writeFile(dest, decompressed);
  }

  private async getYandexMusicProcesses(): Promise<number[]> {
    try {
      let command = "";
      if (this.platform === "win32")
        command = 'tasklist /FI "IMAGENAME eq Яндекс Музыка.exe" /FO CSV /NH';
      else if (this.platform === "darwin") command = 'pgrep -f "Яндекс Музыка"';
      else command = "pgrep -f yandexmusic";

      const { stdout } = await execAsync(command);
      if (!stdout.trim()) return [];

      return stdout
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          if (this.platform === "win32") {
            const parts = l.split('","');
            return parts.length >= 2 && parts[1]
              ? parseInt(parts[1].replace(/"/g, ""))
              : 0;
          }
          return parseInt(l);
        })
        .filter((n) => n > 0 && !isNaN(n));
    } catch {
      return [];
    }
  }

  private async killProcesses(pids: number[]): Promise<void> {
    pids.forEach((pid) => {
      try {
        process.kill(pid);
      } catch {}
    });
    await new Promise((r) => setTimeout(r, 2000));
  }

  private async launchYandexMusic(): Promise<void> {
    const spawnOpts = { detached: true, stdio: "ignore" } as const;
    if (this.platform === "darwin") await execAsync(`open "${this.ymPath}"`);
    else if (this.platform === "win32") {
      const exe = path.join(this.ymPath, "Яндекс Музыка.exe");
      if (fs.existsSync(exe))
        require("child_process").spawn(exe, [], spawnOpts).unref();
    }
  }

  async clearCaches(forced: boolean): Promise<void> {
    if (!fs.existsSync(this.tmpDir)) return;
    const files = await fsp.readdir(this.tmpDir);
    for (const file of files) {
      if (forced || !file.endsWith(".backup")) {
        await fsp.unlink(path.join(this.tmpDir, file));
      }
    }
  }
}
