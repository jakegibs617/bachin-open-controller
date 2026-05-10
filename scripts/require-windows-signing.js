const hasPfxSigning = Boolean(
  process.env.WINDOWS_SIGN_CERTIFICATE_FILE &&
  process.env.WINDOWS_SIGN_CERTIFICATE_PASSWORD
);
const hasSignToolParams = Boolean(process.env.WINDOWS_SIGN_WITH_PARAMS);

if (!hasPfxSigning && !hasSignToolParams) {
  console.error(
    [
      'Windows signing credentials are required for package:signed.',
      '',
      'Set either:',
      '  WINDOWS_SIGN_CERTIFICATE_FILE and WINDOWS_SIGN_CERTIFICATE_PASSWORD',
      '',
      'or:',
      '  WINDOWS_SIGN_WITH_PARAMS',
      '',
      'Smart App Control can still block local unsigned builds.'
    ].join('\n')
  );
  process.exit(1);
}
