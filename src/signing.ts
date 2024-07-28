import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as path from "path";
import * as fs from "fs";

/**
 * Signs an APK file.
 *
 * @param apkFile - The APK file to sign.
 * @param signingKeyFile - The signing key file.
 * @param alias - The alias for the key.
 * @param keyStorePassword - The keystore password.
 * @param keyPassword - The key password (optional).
 * @returns The path to the signed APK file.
 */
export async function signApkFile(
    apkFile: string,
    signingKeyFile: string,
    alias: string,
    keyStorePassword: string,
    keyPassword?: string
): Promise<string> {
    try {
        core.debug("Zipaligning APK file");

        const buildToolsPath = getBuildToolsPath();
        const zipAlign = path.join(buildToolsPath, 'zipalign');
        core.debug(`Found 'zipalign' @ ${zipAlign}`);

        const alignedApkFile = await alignApkFile(apkFile, zipAlign);

        core.debug("Signing APK file");

        const apkSigner = path.join(buildToolsPath, 'apksigner');
        core.debug(`Found 'apksigner' @ ${apkSigner}`);

        const signedApkFile = await signFile(apkSigner, alignedApkFile, signingKeyFile, alias, keyStorePassword, keyPassword, apkFile, '-signed.apk');

        core.debug("Verifying Signed APK");
        await verifySignedFile(apkSigner, signedApkFile);

        return signedApkFile;
    } catch (error) {
        core.setFailed(`Failed to sign APK file: ${(error as Error).message}`);
        throw error;
    }
}

/**
 * Signs an AAB file.
 *
 * @param aabFile - The AAB file to sign.
 * @param signingKeyFile - The signing key file.
 * @param alias - The alias for the key.
 * @param keyStorePassword - The keystore password.
 * @param keyPassword - The key password (optional).
 * @returns The path to the signed AAB file.
 */
export async function signAabFile(
    aabFile: string,
    signingKeyFile: string,
    alias: string,
    keyStorePassword: string,
    keyPassword?: string,
): Promise<string> {
    try {
        core.debug("Signing AAB file");

        const jarSignerPath = await io.which('jarsigner', true);
        core.debug(`Found 'jarsigner' @ ${jarSignerPath}`);

        const args = [
            '-keystore', signingKeyFile,
            '-storepass', keyStorePassword,
            ...(keyPassword ? ['-keypass', keyPassword] : []),
            aabFile,
            alias
        ];

        await exec.exec(`"${jarSignerPath}"`, args);

        return aabFile;
    } catch (error) {
        core.setFailed(`Failed to sign AAB file: ${(error as Error).message}`);
        throw error;
    }
}

/**
 * Gets the path to the Android build tools.
 *
 * @returns The build tools path.
 */
function getBuildToolsPath(): string {
    const buildToolsVersion = core.getInput('buildToolsVersion') || process.env.ANDROID_BUILD_TOOLS_VERSION || '35.0.0';
    const androidHome = process.env.ANDROID_HOME;

    if (!androidHome) {
        throw new Error('ANDROID_HOME environment variable is not set.');
    }

    const buildToolsPath = path.join(androidHome, `build-tools/${buildToolsVersion}`);

    if (!fs.existsSync(buildToolsPath)) {
        throw new Error(`Couldn't find the Android build tools @ ${buildToolsPath}`);
    }

    return buildToolsPath;
}

/**
 * Aligns an APK file using zipalign.
 *
 * @param apkFile - The APK file to align.
 * @param zipAlign - The path to the zipalign executable.
 * @returns The path to the aligned APK file.
 */
async function alignApkFile(apkFile: string, zipAlign: string): Promise<string> {
    const alignedApkFile = apkFile.replace('.apk', '-aligned.apk');

    await exec.exec(`"${zipAlign}"`, [
        '-c',
        '-v', '4',
        apkFile
    ]);

    await exec.exec(`"cp"`, [
        apkFile,
        alignedApkFile
    ]);

    return alignedApkFile;
}

/**
 * Signs a file using apksigner or jarsigner.
 *
 * @param signerPath - The path to the signer executable.
 * @param fileToSign - The file to sign.
 * @param signingKeyFile - The signing key file.
 * @param alias - The alias for the key.
 * @param keyStorePassword - The keystore password.
 * @param keyPassword - The key password (optional).
 * @param originalFile - The original file to be signed.
 * @param fileExtension - The extension to use for the signed file.
 * @returns The path to the signed file.
 */
async function signFile(
    signerPath: string,
    fileToSign: string,
    signingKeyFile: string,
    alias: string,
    keyStorePassword: string,
    keyPassword: string | undefined,
    originalFile: string,
    fileExtension: string
): Promise<string> {
    const signedFile = originalFile.replace('.apk', fileExtension);

    const args = [
        'sign',
        '--ks', signingKeyFile,
        '--ks-key-alias', alias,
        '--ks-pass', `pass:${keyStorePassword}`,
        '--out', signedFile,
        ...(keyPassword ? ['--key-pass', `pass:${keyPassword}`] : []),
        fileToSign
    ];

    await exec.exec(`"${signerPath}"`, args);

    return signedFile;
}

/**
 * Verifies a signed file.
 *
 * @param signerPath - The path to the signer executable.
 * @param signedFile - The signed file to verify.
 */
async function verifySignedFile(signerPath: string, signedFile: string): Promise<void> {
    await exec.exec(`"${signerPath}"`, [
        'verify',
        signedFile
    ]);
}
