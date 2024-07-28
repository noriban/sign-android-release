import * as core from '@actions/core';
import { signAabFile, signApkFile } from "./signing";
import path from "path";
import fs from "fs";
import * as io from "./io-utils";

async function run() {
  try {
    if (process.env.DEBUG_ACTION === 'true') {
      core.debug("DEBUG FLAG DETECTED, SHORTCUTTING ACTION.");
      return;
    }

    const releaseDir = core.getInput('releaseDir') || process.env.ANDROID_RELEASE_DIR;
    const signingKeyBase64 = core.getInput('signingKey') || process.env.ANDROID_SIGNING_KEY;
    const alias = core.getInput('keyAlias') || process.env.ANDROID_KEY_ALIAS;
    const keyStorePassword = core.getInput('keyStorePassword') || process.env.ANDROID_KEYSTORE_PASSWORD;
    const keyPassword = core.getInput('keyPassword') || process.env.ANDROID_KEY_PASSWORD;

    if (!releaseDir || !signingKeyBase64 || !alias || !keyStorePassword ) {
      throw new Error('Missing required input(s).');
    }

    console.log(`Preparing to sign key @ ${releaseDir} with provided signing key`);
    
    const releaseFiles = io.findReleaseFiles(releaseDir);

    if (releaseFiles && releaseFiles.length > 0) {
      const signingKey = path.join(releaseDir, 'signingKey.jks');
      saveSigningKey(signingKey, signingKeyBase64);

      const signedReleaseFiles = await signReleaseFiles(releaseFiles, releaseDir, signingKey, alias, keyStorePassword, keyPassword);

      setOutputVariables(signedReleaseFiles);
      
      console.log('Releases signed!');
    } else {
      throw new Error('No release files (.apk or .aab) could be found.');
    }
  } catch (error) {
    handleError(error);
  }
}

function saveSigningKey(signingKeyPath: string, signingKeyBase64: string) {
  try {
    fs.writeFileSync(signingKeyPath, signingKeyBase64, 'base64');
  } catch (error) {
    throw new Error(`Failed to save signing key: ${error.message}`);
  }
}

async function signReleaseFiles(releaseFiles: io.ReleaseFile[], releaseDir: string, signingKey: string, alias: string, keyStorePassword: string, keyPassword: string) {
  const signedReleaseFiles: string[] = [];
  let index = 0;

  for (const releaseFile of releaseFiles) {
    core.debug(`Found release to sign: ${releaseFile.name}`);
    const releaseFilePath = path.join(releaseDir, releaseFile.name);
    let signedReleaseFile = '';

    try {
      if (releaseFile.name.endsWith('.apk')) {
        signedReleaseFile = await signApkFile(releaseFilePath, signingKey, alias, keyStorePassword, keyPassword);
      } else if (releaseFile.name.endsWith('.aab')) {
        signedReleaseFile = await signAabFile(releaseFilePath, signingKey, alias, keyStorePassword, keyPassword);
      } else {
        throw new Error(`Unsupported file format: ${releaseFile.name}`);
      }
    } catch (error) {
      throw new Error(`Failed to sign file ${releaseFile.name}: ${error.message}`);
    }

    core.exportVariable(`ANDROID_SIGNED_FILE_${index}`, signedReleaseFile);
    core.setOutput(`signedFile${index}`, signedReleaseFile);
    signedReleaseFiles.push(signedReleaseFile);
    index++;
  }

  return signedReleaseFiles;
}

function setOutputVariables(signedReleaseFiles: string[]) {
  core.exportVariable('ANDROID_SIGNED_FILES', signedReleaseFiles.join(":"));
  core.setOutput('signedFiles', signedReleaseFiles.join(":"));
  core.exportVariable('ANDROID_SIGNED_FILES_COUNT', `${signedReleaseFiles.length}`);
  core.setOutput('signedFilesCount', `${signedReleaseFiles.length}`);

  if (signedReleaseFiles.length === 1) {
    core.exportVariable('ANDROID_SIGNED_FILE', signedReleaseFiles[0]);
    core.setOutput('signedFile', signedReleaseFiles[0]);
  }
}

function handleError(error: unknown) {
  if (error instanceof Error) {
    core.setFailed(error.message);
  } else {
    core.setFailed('An unknown error occurred.');
    console.error(error);
  }
}

run();
