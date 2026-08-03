const axios = require('axios');

const GITHUB_API_URL =
  'https://api.github.com/repos/hodadako/blue-archive-voice-downloader/releases/latest';
const RELEASE_PAGE_URL = 'https://github.com/hodadako/blue-archive-voice-downloader/releases/latest';
const USER_AGENT = 'bluearchive-voice-downloader/0.3';

const PLATFORM_ASSETS = {
  darwin: { osName: 'macOS', extension: '.dmg' },
  win32: { osName: 'Windows', extension: '.exe' },
  linux: { osName: 'Linux', extension: '.AppImage' },
};

function normalizeVersion(value) {
  const match = String(value || '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?/);
  if (!match) {
    return null;
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left)?.split('.').map(Number);
  const rightParts = normalizeVersion(right)?.split('.').map(Number);
  if (!leftParts || !rightParts) {
    throw new Error(`Invalid version comparison: ${left} vs ${right}`);
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

function getPlatformAssetDescriptor(platform = process.platform, arch = process.arch) {
  const platformConfig = PLATFORM_ASSETS[platform];
  if (!platformConfig || !['x64', 'arm64'].includes(arch)) {
    return null;
  }
  return {
    ...platformConfig,
    arch,
    fileName: `BlueArchiveVoiceDownloader-${platformConfig.osName}-${arch}${platformConfig.extension}`,
  };
}

function findReleaseAsset(assets, descriptor) {
  if (!descriptor || !Array.isArray(assets)) {
    return null;
  }

  const normalizedName = (value) => String(value || '').toLowerCase();
  const exactName = normalizedName(descriptor.fileName);
  return (
    assets.find((asset) => normalizedName(asset?.name) === exactName) ||
    assets.find((asset) => {
      const name = normalizedName(asset?.name);
      return (
        name.includes(normalizedName(`${descriptor.osName}-${descriptor.arch}`)) &&
        name.endsWith(descriptor.extension.toLowerCase())
      );
    }) ||
    null
  );
}

async function checkForUpdates({
  currentVersion,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const normalizedCurrentVersion = normalizeVersion(currentVersion);
  if (!normalizedCurrentVersion) {
    throw new Error(`Invalid current app version: ${currentVersion}`);
  }

  const response = await axios.get(GITHUB_API_URL, {
    timeout: 10000,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    },
  });
  const release = response.data || {};
  const latestVersion = normalizeVersion(release.tag_name || release.name);
  if (!latestVersion) {
    throw new Error('Latest GitHub release has no valid version tag.');
  }

  const descriptor = getPlatformAssetDescriptor(platform, arch);
  const asset = findReleaseAsset(release.assets, descriptor);
  const releaseUrl = release.html_url || RELEASE_PAGE_URL;
  const downloadUrl = asset?.browser_download_url || releaseUrl;
  const updateAvailable = compareVersions(latestVersion, normalizedCurrentVersion) > 0;

  return {
    ok: true,
    currentVersion: normalizedCurrentVersion,
    latestVersion,
    updateAvailable,
    releaseName: release.name || `v${latestVersion}`,
    releaseUrl,
    downloadUrl: updateAvailable ? downloadUrl : null,
    assetName: asset?.name || null,
    hasAsset: Boolean(asset?.browser_download_url),
  };
}

module.exports = {
  checkForUpdates,
  compareVersions,
  findReleaseAsset,
  getPlatformAssetDescriptor,
  normalizeVersion,
};
