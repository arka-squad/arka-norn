#!/usr/bin/env node
import { runCli } from "../dist/adapters/inbound/cli/main-cli.js";

process.exitCode = await runCli(process.argv.slice(2));
