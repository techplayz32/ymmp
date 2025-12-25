// src/index.ts
import { Command } from "commander";
import chalk from "chalk";
import { Patcher } from "./patcher.js";
import { Logger } from "./logger.js";
import prompts from "prompts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import ora from "ora";
import { ConfigManager } from "./config.js";

const logger = new Logger("CLI");
const program = new Command();
const config = new ConfigManager();

program.name("ymmp").description("YandexMusicModPatcher CLI").version("1.0.0");

program
  .command("config")
  .description("Manage configuration (Tokens, Paths)")
  .argument("[action]", "get, set, or list", "list")
  .argument("[key]", "Key to get/set (token, path)")
  .argument("[value]", "Value to set")
  .action((action, key, value) => {
    if (action === "list") {
      console.log(chalk.bold("\nCurrent Configuration:"));
      console.log(JSON.stringify(config["data"], null, 2));
    } else if (action === "set") {
      if (key === "token") {
        config.set("githubToken", value);
        logger.success("GitHub Token updated.");
      } else if (key === "path") {
        config.set("customPath", value);
        logger.success("Custom path updated.");
      } else {
        logger.error("Unknown key. Use 'token' or 'path'.");
      }
    }
  });

program
  .command("patch")
  .description("Install mod on Yandex Music")
  .option("-t, --type <type>", "Patch type", "default")
  .option("-p, --path <path>", "Custom path")
  .option("--token <token>", "GitHub Token")
  .option("-f, --force", "Force close YM without prompting")
  .option("--no-cache", "Force redownload")
  .option("--keep-cache", "Keep cache after patching", true)
  .action(async (options) => {
    const spinner = ora("Initializing...");
    try {
      const patcher = new Patcher({
        patchType: options.type,
        customPath: options.path,
        useCache: options.cache,
        keepCache: options.keepCache,
        githubToken: options.token,
        force: options.force,
      });

      spinner.start();
      await patcher.patch(spinner);
      spinner.succeed("Patch completed successfully!");
    } catch (error: any) {
      spinner.fail("Patch failed");
      const msg = error.message || String(error);

      if (msg.includes("Rate Limit") || msg.includes("403")) {
        console.log(chalk.yellow("\nGitHub Rate Limit Reached."));
        console.log(chalk.cyan("Fix it permanently:"));
        console.log(`  ymmp config set token YOUR_TOKEN_HERE`);
      } else if (msg.includes("Yandex Music is running")) {
        console.log(
          chalk.yellow(
            "\nApp is running. Use --force to close it automatically.",
          ),
        );
      } else {
        logger.error(msg);
      }
      process.exit(1);
    }
  });

program
  .command("check")
  .description("Check if patching is possible")
  .option("-p, --path <path>", "Custom path to Yandex Music installation")
  .action(async (options) => {
    try {
      const patcher = new Patcher({ customPath: options.path });
      const result = await patcher.checkInstallPossible();

      if (result.status) {
        logger.success("✓ Yandex Music found and ready to patch");
      } else {
        logger.error("✗ Cannot patch:", result.message);
        if (result.request === "REQUEST_YM_PATH") {
          const response = await prompts({
            type: "text",
            name: "path",
            message: "Enter path to Yandex Music installation:",
          });
          if (response.path) logger.info("Use this path with --path option");
        }
      }
    } catch (error) {
      logger.error(
        "✗ Check failed:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program
  .command("info")
  .description("Show information about installed mod")
  .option("-p, --path <path>", "Custom path to Yandex Music installation")
  .action(async (options) => {
    try {
      const patcher = new Patcher({
        customPath: options.path,
      });

      const metadata = await patcher.getInstalledMetadata();

      if (metadata) {
        console.log(chalk.bold("\nInstalled Version Info:"));
        console.log(chalk.gray("━".repeat(50)));
        console.log(
          `${chalk.cyan("Yandex Music:")} ${metadata.buildInfo?.version || "Unknown"}`,
        );
        console.log(
          `${chalk.cyan("Mod Version:")} ${metadata.modification?.version || "Not installed"}`,
        );
        console.log(
          `${chalk.cyan("Last Patch Date:")} ${metadata.lastPatchInfo?.date || "Unknown"}`,
        );
        console.log(chalk.gray("━".repeat(50)));
      } else {
        logger.warn("No installation information found");
      }
    } catch (error) {
      logger.error(
        "✗ Info retrieval failed:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program
  .command("update")
  .description("Check for updates")
  .option("--token <token>", "GitHub Token")
  .option("-f, --force", "Force close Yandex Music if running")
  .action(async (options) => {
    try {
      const patcher = new Patcher({
        githubToken: options.token,
        force: options.force,
      });

      logger.info("Checking for updates...");

      const metadata = await patcher.fetchReleaseInfo();

      console.log(
        chalk.bold("\nLatest Release: ") + chalk.green(metadata.name),
      );
      console.log(
        chalk.gray(
          `Published: ${new Date(metadata.published_at).toLocaleDateString()}`,
        ),
      );

      const response = await prompts({
        type: "confirm",
        name: "install",
        message: "Install this update now?",
        initial: true,
      });

      if (response.install) {
        await patcher.patch();
        logger.success("Update installed!");
      }
    } catch (error: any) {
      const msg = error.message || String(error);
      if (msg.includes("Yandex Music is running")) {
        logger.error(msg);
        console.log(chalk.yellow("Tip: Run the command again with --force"));
      } else if (msg.includes("Rate Limit")) {
        logger.error("Rate limit exceeded.");
        console.log(
          chalk.yellow("Tip: Use 'ymmp config set token <token>' to fix this."),
        );
      } else {
        logger.error("Update failed:", msg);
      }
      process.exit(1);
    }
  });

program
  .command("cache")
  .description("Manage cache")
  .option("-c, --clear", "Clear cache")
  .option("-s, --stats", "Show cache statistics")
  .action(async (options) => {
    try {
      const patcher = new Patcher({});

      if (options.clear) {
        logger.info("Clearing cache...");
        await patcher.clearCaches(true);
        logger.success("✓ Cache cleared");
      }

      if (options.stats) {
        const cacheDir = path.join(os.homedir(), ".ymmp-cache");
        if (fs.existsSync(cacheDir)) {
          const files = fs.readdirSync(cacheDir);
          let totalSize = 0;

          files.forEach((file) => {
            const stats = fs.statSync(path.join(cacheDir, file));
            totalSize += stats.size;
          });

          console.log(chalk.bold("\nCache Statistics:"));
          console.log(chalk.gray("━".repeat(50)));
          console.log(`${chalk.cyan("Files:")} ${files.length}`);
          console.log(
            `${chalk.cyan("Total Size:")} ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
          );
          console.log(chalk.gray("━".repeat(50)));
        } else {
          logger.info("No cache directory found");
        }
      }
    } catch (error) {
      logger.error(
        "✗ Cache operation failed:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program.parse();
