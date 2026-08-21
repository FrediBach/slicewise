import type { ReactDoctorConfig } from 'react-doctor';

const config = {
  lint: true,
  deadCode: true,
  blocking: 'error',
  noScore: true,
  supplyChain: {
    enabled: false,
  },
  ignore: {
    files: ['slicewise.html'],
    overrides: [
      {
        files: ['src/lib/slicer.ts'],
        rules: [
          'react-doctor/async-await-in-loop',
          'react-doctor/no-create-object-url-without-revoke',
        ],
      },
    ],
  },
} satisfies ReactDoctorConfig;

export default config;
