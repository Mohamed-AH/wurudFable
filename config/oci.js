/**
 * Oracle Cloud Infrastructure (OCI) Object Storage Configuration
 *
 * This module configures the OCI SDK for Object Storage operations.
 * Audio files are stored in OCI Object Storage (Always Free tier).
 */

const common = require('oci-common');
const os = require('oci-objectstorage');

let objectStorageClient = null;

/**
 * Initialize OCI Object Storage client
 * Supports both config file and environment variable authentication
 */
function initializeClient() {
  if (objectStorageClient) {
    return objectStorageClient;
  }

  try {
    let provider;

    // Check if using environment variables (recommended for Render)
    if (process.env.OCI_PRIVATE_KEY && process.env.OCI_TENANCY) {
      console.log('🔐 Using OCI environment variable authentication');

      // Clean up private key (handle newlines in env var)
      const privateKey = process.env.OCI_PRIVATE_KEY.replace(/\\n/g, '\n');

      provider = new common.SimpleAuthenticationDetailsProvider(
        process.env.OCI_TENANCY,
        process.env.OCI_USER,
        process.env.OCI_FINGERPRINT,
        privateKey,
        null, // passphrase
        common.Region.fromRegionId(process.env.OCI_REGION || 'us-ashburn-1')
      );
    } else if (process.env.OCI_CONFIG_FILE) {
      // Use config file authentication (for local development)
      console.log('🔐 Using OCI config file authentication');
      provider = new common.ConfigFileAuthenticationDetailsProvider(
        process.env.OCI_CONFIG_FILE,
        process.env.OCI_PROFILE || 'DEFAULT'
      );
    } else {
      console.warn('⚠️ OCI credentials not configured - object storage disabled');
      return null;
    }

    objectStorageClient = new os.ObjectStorageClient({
      authenticationDetailsProvider: provider
    });

    console.log('✅ OCI Object Storage client initialized');
    return objectStorageClient;
  } catch (error) {
    console.error('❌ Failed to initialize OCI client:', error.message);
    return null;
  }
}

/**
 * Get the configured namespace
 */
function getNamespace() {
  return process.env.OCI_NAMESPACE;
}

/**
 * Get the configured bucket name
 */
function getBucketName() {
  return process.env.OCI_BUCKET || 'wurud-audio';
}

/**
 * Get the OCI region
 */
function getRegion() {
  return process.env.OCI_REGION || 'us-ashburn-1';
}

/**
 * Check if OCI is properly configured
 */
function isConfigured() {
  return !!(process.env.OCI_NAMESPACE && (process.env.OCI_PRIVATE_KEY || process.env.OCI_CONFIG_FILE));
}

module.exports = {
  initializeClient,
  getNamespace,
  getBucketName,
  getRegion,
  isConfigured,
  get client() {
    return initializeClient();
  }
};
