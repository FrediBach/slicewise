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
  },
} satisfies ReactDoctorConfig;

export default config;
