const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const defaultResolver = require('metro-resolver');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const packagesRoot = path.resolve(workspaceRoot, 'packages');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Shared workspace packages use Node ESM-style ".js" import specifiers in
// TypeScript source. Metro must resolve those to the corresponding ".ts" files.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath ?? '';

  if (
    origin.startsWith(packagesRoot) &&
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js')
  ) {
    return defaultResolver.resolve(
      context,
      moduleName.slice(0, -3),
      platform,
    );
  }

  return defaultResolver.resolve(context, moduleName, platform);
};

module.exports = config;
