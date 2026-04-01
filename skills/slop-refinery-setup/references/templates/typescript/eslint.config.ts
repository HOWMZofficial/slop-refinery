import { recommendedConfig } from 'eslint-plugin-slop-refinery';

const config = [...recommendedConfig];

export default config;

// For the broader Pulse-style rule set, swap to:
// import { strictConfig } from 'eslint-plugin-slop-refinery';
// const config = [...strictConfig];
