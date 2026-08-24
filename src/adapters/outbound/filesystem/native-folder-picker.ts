/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { promisify } from "node:util";

import type { FolderPicker } from "../../../ports/outbound/folder-picker.js";

interface PickerCommand {
  readonly executable: string;
  readonly arguments: readonly string[];
}

type CommandRunner = (executable: string, args: readonly string[]) => Promise<{ readonly stdout: string }>;

const runCommand: CommandRunner = async (executable, args) => promisify(execFile)(executable, [...args], { encoding: "utf8", maxBuffer: 64 * 1024 });

export class NativeFolderPicker implements FolderPicker {
  public constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly runner: CommandRunner = runCommand,
  ) {}

  public async pick(input: { readonly title: string; readonly defaultPath?: string }): Promise<string | null> {
    const command = folderPickerCommand(this.platform, input.title, input.defaultPath);
    let output: string;
    try {
      output = (await this.runner(command.executable, command.arguments)).stdout.trim();
    } catch (error) {
      if (isCancellation(error, this.platform)) return null;
      throw new Error("The native folder picker could not be opened.", { cause: error });
    }
    if (output.length === 0) return null;
    const stat = await lstat(output).catch((error: unknown) => { throw new Error("The selected folder is no longer available.", { cause: error }); });
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("The selected path must be a real directory.");
    return realpath(output);
  }
}

export function folderPickerCommand(platform: NodeJS.Platform, title: string, defaultPath?: string): PickerCommand {
  const initial = defaultPath ?? "";
  if (platform === "darwin") {
    const script = [
      "on run argv",
      "set dialogTitle to item 1 of argv",
      "set initialPath to item 2 of argv",
      "try",
      "if initialPath is \"\" then",
      "set chosenFolder to choose folder with prompt dialogTitle",
      "else",
      "set chosenFolder to choose folder with prompt dialogTitle default location POSIX file initialPath",
      "end if",
      "return POSIX path of chosenFolder",
      "on error number -128",
      "return \"\"",
      "end try",
      "end run",
    ].join("\n");
    return { executable: "osascript", arguments: ["-e", script, "--", title, initial] };
  }
  if (platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = $args[0]",
      "if ($args[1]) { $dialog.SelectedPath = $args[1] }",
      "$result = $dialog.ShowDialog()",
      "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }",
    ].join("; ");
    return { executable: "powershell.exe", arguments: ["-NoProfile", "-STA", "-NonInteractive", "-Command", script, title, initial] };
  }
  const fileArgument = initial.length === 0 ? [] : [`--filename=${initial.replace(/\/?$/u, "/")}`];
  return { executable: "zenity", arguments: ["--file-selection", "--directory", `--title=${title}`, ...fileArgument] };
}

function isCancellation(error: unknown, platform: NodeJS.Platform): boolean {
  return platform !== "darwin" && platform !== "win32"
    && typeof error === "object" && error !== null && "code" in error && error.code === 1;
}
