#!/usr/bin/env node

/**
 * Shared utility for deriving environment names from Git branch names
 * Used by both CDK and GitHub Actions to ensure consistency
 */

const { execSync } = require('child_process');

/**
 * Sanitizes a git branch name to create a valid environment name.
 * Replaces slashes and other non-alphanumeric characters with hyphens,
 * converts to lowercase, and truncates to a reasonable length.
 * 
 * @param {string} branch The raw git branch name
 * @returns {string} A sanitized string suitable for use as an environment name
 */
function sanitizeBranchName(branch) {
    const sanitized = branch
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric chars (except hyphen) with hyphen
        .replace(/--+/g, '-')       // Collapse consecutive hyphens
        .replace(/^-+|-+$/g, '');   // Trim leading/trailing hyphens

    // Truncate to a reasonable length for environment names
    return sanitized.substring(0, 50);
}

/**
 * Gets the current Git branch name
 * @returns {string} The current branch name
 */
function getCurrentBranchName() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch (error) {
        // Fallback for CI environments
        return process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || 'unknown';
    }
}

/**
 * Gets the sanitized environment name for the current branch
 * @returns {string} Sanitized environment name
 */
function getEnvironmentName() {
    const branchName = getCurrentBranchName();
    return sanitizeBranchName(branchName);
}

/**
 * Gets the sanitized environment name for a specific branch
 * @param {string} branch The branch name to sanitize
 * @returns {string} Sanitized environment name
 */
function getEnvironmentNameForBranch(branch) {
    return sanitizeBranchName(branch);
}

// Export functions
module.exports = {
    sanitizeBranchName,
    getCurrentBranchName,
    getEnvironmentName,
    getEnvironmentNameForBranch
};

// CLI interface - when run directly, output the environment name
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // No arguments - use current branch
        console.log(getEnvironmentName());
    } else if (args.length === 1) {
        // One argument - sanitize the provided branch name
        console.log(getEnvironmentNameForBranch(args[0]));
    } else {
        console.error('Usage: branch-env-name.js [branch-name]');
        console.error('  No args: Get environment name for current branch');
        console.error('  One arg: Get environment name for specified branch');
        process.exit(1);
    }
}