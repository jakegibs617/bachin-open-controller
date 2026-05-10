const certificateFile = process.env.WINDOWS_SIGN_CERTIFICATE_FILE;
const certificatePassword = process.env.WINDOWS_SIGN_CERTIFICATE_PASSWORD;
const signWithParams = process.env.WINDOWS_SIGN_WITH_PARAMS;

function windowsSigningConfig() {
  if (signWithParams) {
    return { signWithParams };
  }

  if (certificateFile && certificatePassword) {
    return { certificateFile, certificatePassword };
  }

  return null;
}

const windowsSigning = windowsSigningConfig();

module.exports = {
  packagerConfig: windowsSigning ? { windowsSign: windowsSigning } : {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'bachin_open_controller',
        ...(windowsSigning ?? {})
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};
