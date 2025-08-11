#!/usr/bin/env node

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { generateFromConfig } from "./core";
import * as packageJson from "../../package.json";
import { GeneratorConfig } from "@ng-openapi/shared";

const program = new Command();

async function loadConfigFile(configPath: string): Promise<GeneratorConfig> {
    const resolvedPath = path.resolve(configPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
    }

    // Clear require cache to ensure fresh load
    delete require.cache[require.resolve(resolvedPath)];

    try {
        // Handle both .ts and .js files
        if (resolvedPath.endsWith(".ts")) {
            // Use ts-node to load TypeScript config files
            require("ts-node/register");
        }

        const configModule = require(resolvedPath);

        // Handle different export styles
        const config = configModule.default || configModule.config || configModule;

        if (!config.input || !config.output) {
            throw new Error('Configuration must include "input" and "output" properties');
        }

        return config;
    } catch (error) {
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : error}`);
    }
}

function isUrl(input: string): boolean {
    try {
        new URL(input);
        return true;
    } catch {
        return false;
    }
}

function validateInput(inputPath: string): void {
    if (isUrl(inputPath)) {
        // For URLs, we can't validate existence beforehand, but we can validate the URL format
        const url = new URL(inputPath);
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error(`Unsupported URL protocol: ${url.protocol}. Only HTTP and HTTPS are supported.`);
        }
        return; // URL validation passed
    }

    // For local files, check existence and extension
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    const extension = path.extname(inputPath).toLowerCase();
    const supportedExtensions = [".json", ".yaml", ".yml"];

    if (!supportedExtensions.includes(extension)) {
        throw new Error(
            `Failed to parse ${extension || "specification"}. Supported formats are .json, .yaml, and .yml.`
        );
    }
}

async function generateFromOptions(options: any): Promise<void> {
    try {
        if (options.config) {
            // Load configuration from file
            const config = await loadConfigFile(options.config);

            // Validate the input from config (file or URL)
            validateInput(config.input);

            await generateFromConfig(config);
        } else if (options.input) {
            // Use command line options
            validateInput(options.input);

            const config: GeneratorConfig = {
                input: options.input, // Can now be a URL or file path
                output: options.output || "./src/generated",
                options: {
                    dateType: options.dateType || "Date",
                    enumStyle: "enum",
                    generateEnumBasedOnDescription: true,
                    generateServices: !options.typesOnly,
                },
            };

            await generateFromConfig(config);
        } else {
            console.error("Error: Either --config or --input option is required");
            program.help();
            process.exit(1);
        }

        console.log("✨ Generation completed successfully!");
    } catch (error) {
        console.error("❌ Generation failed:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Main command with options (allows: ng-openapi -c config.ts)
program
    .name("ng-openapi")
    .description("Generate Angular services and types from OpenAPI/Swagger specifications (JSON, YAML, YML) from files or URLs")
    .version(packageJson.version)
    .option("-c, --config <path>", "Path to configuration file")
    .option("-i, --input <path>", "Path or URL to OpenAPI/Swagger specification (.json, .yaml, .yml)")
    .option("-o, --output <path>", "Output directory", "./src/generated")
    .option("--types-only", "Generate only TypeScript interfaces")
    .option("--date-type <type>", "Date type to use (string | Date)", "Date")
    .action(async (options) => {
        await generateFromOptions(options);
    });

// Sub-command for backward compatibility (allows: ng-openapi generate -c config.ts)
program
    .command("generate")
    .alias("gen")
    .description("Generate code from OpenAPI/Swagger specification")
    .option("-c, --config <path>", "Path to configuration file")
    .option("-i, --input <path>", "Path or URL to OpenAPI/Swagger specification (.json, .yaml, .yml)")
    .option("-o, --output <path>", "Output directory", "./src/generated")
    .option("--types-only", "Generate only TypeScript interfaces")
    .option("--date-type <type>", "Date type to use (string | Date)", "Date")
    .action(async (options) => {
        await generateFromOptions(options);
    });

// Add help examples
program.on("--help", () => {
    console.log("");
    console.log("Examples:");
    console.log("  $ ng-openapi -c ./openapi.config.ts");
    console.log("  $ ng-openapi -i ./swagger.json -o ./src/api");
    console.log("  $ ng-openapi -i ./openapi.yaml -o ./src/api");
    console.log("  $ ng-openapi -i ./api-spec.yml -o ./src/api");
    console.log("  $ ng-openapi -i https://api.example.com/openapi.json -o ./src/api");
    console.log("  $ ng-openapi -i https://petstore.swagger.io/v2/swagger.json -o ./src/api");
    console.log("  $ ng-openapi generate -c ./openapi.config.ts");
    console.log("  $ ng-openapi generate -i https://api.example.com/swagger.yaml --types-only");
});

program.parse();