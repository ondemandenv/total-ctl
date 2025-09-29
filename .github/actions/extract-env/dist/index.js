#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
// Optional: use @actions/core when available for better DX; fall back otherwise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let core;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    core = require('@actions/core');
}
catch (_e) {
    core = undefined;
}
//</editor-fold>
//<editor-fold desc="SECTION: GitHub Actions Toolkit Wrappers">
/**
 * Reads an environment variable and returns its boolean representation.
 * @param name The name of the environment variable.
 * @param fallback The default value if the variable is not set.
 * @returns The boolean value.
 */
function getBooleanEnv(name, fallback = false) {
    const v = process.env[name];
    if (v == null)
        return fallback;
    return v.toLowerCase() === 'true' || v === '1';
}
/**
 * Sets an output parameter for the GitHub Action.
 * @param name The name of the output parameter.
 * @param value The value to set.
 */
function setOutput(name, value) {
    if (core?.setOutput) {
        core.setOutput(name, value);
        return;
    }
    // Fallback for local execution, requires GITHUB_OUTPUT env var to be set
    if (process.env['GITHUB_OUTPUT']) {
        fs.appendFileSync(process.env['GITHUB_OUTPUT'], `${name}=${value}
`);
    }
}
/**
 * Exports an environment variable for subsequent steps in the GitHub Actions job.
 * @param name The name of the environment variable.
 * @param value The value to set.
 */
function exportEnv(name, value) {
    if (core?.exportVariable) {
        core.exportVariable(name, value);
        return;
    }
    // Fallback for local execution, requires GITHUB_ENV env var to be set
    if (process.env['GITHUB_ENV']) {
        fs.appendFileSync(process.env['GITHUB_ENV'], `${name}=${value}
`);
    }
}
/**
 * Logs a debug message, respecting the runner's debug settings.
 * @param message The message to log.
 */
function logDebug(message) {
    if (core?.debug) {
        core.debug(message);
        return;
    }
    if (getBooleanEnv('RUNNER_DEBUG')) {
        // Standard format for debug messages in GitHub Actions
        console.log(`::debug::${message}`);
    }
}
//</editor-fold>
//<editor-fold desc="SECTION: Input and Configuration Parsing">
/**
 * Retrieves and validates the inputs for the action.
 * @returns An object containing all the action inputs.
 */
function getInputs() {
    if (core) {
        return {
            branch: core.getInput('branch', { required: true }),
        };
    }
    const input = (name, def) => {
        const v = process.env[`INPUT_${name.toUpperCase()}`];
        if (v == null || v === '') {
            if (def !== undefined)
                return def;
            throw new Error(`Missing required input: ${name}`);
        }
        return v;
    };
    return {
        branch: input('branch'),
    };
}
//</editor-fold>
//<editor-fold desc="SECTION: Core Logic">
/**
 * Parses an AWS Account ID from a full IAM ARN string.
 * @param arn The IAM ARN to parse.
 * @returns The extracted 12-digit AWS Account ID, or undefined if parsing fails.
 */
function getAccountIdFromArn(arn) {
    const match = arn.match(/::(\d{12}):/);
    return match?.[1];
}
/**
 * Sanitizes a git branch name to create a valid environment name.
 * Replaces slashes and other non-alphanumeric characters with hyphens,
 * converts to lowercase, and truncates to a reasonable length.
 * @param branch The raw git branch name.
 * @returns A sanitized string suitable for use as an environment name.
 */
function sanitizeBranchName(branch) {
    const sanitized = branch
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric chars (except hyphen) with hyphen
        .replace(/--+/g, '-') // Collapse consecutive hyphens
        .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
    // Truncate to a reasonable length for environment names
    return sanitized.substring(0, 50);
}
/**
 * Resolves the final configuration based on the current branch and a hardcoded mapping.
 * This uses a feature-branch workflow: `main` maps to production, and all other
 * branches (e.g., `feature/*`, `bugfix/*`) map to a dynamic environment that uses
 * the development infrastructure but gets a unique name derived from the branch.
 *
 * @param branch The current git branch name.
 * @returns The resolved configuration.
 */
function resolveConfig(branch) {
    // --- Hardcoded Configuration ---
    // TODO: Update these values to match your AWS environments.
    // This configuration points to your stable, production AWS account.
    const productionConfig = {
        env: 'customer-facing', // The static name for the primary production environment
        region: 'us-east-1',
        roleArn: 'arn:aws:iam::111111111111:role/github-actions-deploy-role' // Production Role ARN
    };
    // This configuration points to your sandbox/development AWS account.
    const developmentConfig = {
        env: 'default-dev', // This default name is overridden for dynamic environments
        region: 'us-west-2',
        roleArn: 'arn:aws:iam::682794873457:role/total-ctl-infra-sandbox-GithubActionsDeployRole3AEB-59VstfyutSjB' // Development/Sandbox Role ARN
    };
    // --- End of Hardcoded Configuration ---
    let config;
    let envName;
    if (branch === 'main') {
        logDebug(`Branch 'main' maps to the static production environment.`);
        config = productionConfig;
        envName = productionConfig.env; // Use the static name, e.g., 'customer-facing'
    }
    else if (branch.startsWith('prod/') || branch.startsWith('hotfix/')) {
        logDebug(`Branch '${branch}' matches a production prefix. Creating a DYNAMIC environment in the PRODUCTION account.`);
        config = productionConfig; // Target the Production Account
        envName = sanitizeBranchName(branch); // But use a dynamic name
    }
    else {
        logDebug(`Branch '${branch}' is a standard feature branch. Creating a DYNAMIC environment in the DEVELOPMENT account.`);
        config = developmentConfig; // Target the Development Account
        envName = sanitizeBranchName(branch); // With a dynamic name
    }
    const accountId = getAccountIdFromArn(config.roleArn);
    if (!accountId) {
        throw new Error(`Could not parse Account ID from Role ARN: ${config.roleArn}`);
    }
    return {
        env: envName, // The final static or dynamic environment name
        accountId: accountId,
        region: config.region,
        roleArn: config.roleArn,
    };
}
//</editor-fold>
//<editor-fold desc="SECTION: Main Execution">
/**
 * Main function for the GitHub Action.
 * It orchestrates the process of getting inputs, resolving the configuration,
 * and setting the outputs and environment variables.
 */
function main() {
    try {
        // Allows attaching a debugger locally by setting the ACTION_BREAK env var.
        if (process.env.ACTION_BREAK === '1') {
            // eslint-disable-next-line no-debugger
            debugger;
        }
        const inputs = getInputs();
        logDebug(`Input: branch=${inputs.branch}`);
        const resolved = resolveConfig(inputs.branch);
        logDebug(`Resolved: env=${resolved.env}, account_id=${resolved.accountId}, region=${resolved.region}, role_arn=${resolved.roleArn}`);
        // Set action outputs for use in other steps
        setOutput('env', resolved.env);
        setOutput('account_id', resolved.accountId);
        setOutput('region', resolved.region);
        setOutput('role_arn', resolved.roleArn);
        // Export environment variables for use in subsequent scripts
        exportEnv('ENVIRONMENT', resolved.env);
        exportEnv('AWS_ACCOUNT_ID', resolved.accountId);
        exportEnv('AWS_REGION', resolved.region);
        exportEnv('AWS_ROLE_ARN', resolved.roleArn);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (core?.setFailed) {
            core.setFailed(message);
        }
        else {
            console.error(message);
        }
        process.exit(1);
    }
}
main();
//</editor-fold>
//# sourceMappingURL=index.js.map