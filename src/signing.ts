import * as exec from '@actions/exec';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as path from "path";
import * as fs from "fs";

export async function signApkFile(
    apkFile: string,
    signingKeyFile: string,
    alias: string,
    keyStorePassword: string,
    keyPassword?: string
): Promise<string> {
    try {
        core.debug("Zipaligning APK file");

        const buildToolsPath = await getBuildToolsPath();
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

async function getBuildToolsPath(): Promise<string> {
    const androidHome = process.env.ANDROID_HOME;

    if (!androidHome) {
        throw new Error('ANDROID_HOME environment variable is not set.');
    }

    const buildToolsDir = path.join(androidHome, 'build-tools');
    let buildToolsVersion = '';

    if (!(core.getInput('buildToolsVersion') || process.env.ANDROID_BUILD_TOOLS_VERSION)) {
        console.log("Build tools version is not specified. AUTO-DETECTING...")
        try {
            const options = {
                listeners: {
                    stdout: (data: Buffer) => {
                        buildToolsVersion += data.toString();
                    }
                }
            };
            
            await exec.exec('ls', [buildToolsDir], options);
            const versions = buildToolsVersion.trim().split('\n');
            buildToolsVersion = versions[versions.length - 1];
            console.log("Found! Build tools version", buildToolsVersion)
        } catch (error) {
            throw new Error('Failed to detect Android build tools version.');
        }
    }

    const buildToolsPath = path.join(buildToolsDir, buildToolsVersion);

    if (!fs.existsSync(buildToolsPath)) {
        throw new Error(`Couldn't find the Android build tools @ ${buildToolsPath}`);
    }

    return buildToolsPath;
}

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

async function verifySignedFile(signerPath: string, signedFile: string): Promise<void> {
    await exec.exec(`"${signerPath}"`, [
        'verify',
        signedFile
    ]);
}
