import { registerPlugin } from '@capacitor/core';
const CapacitorHealthkit = registerPlugin('CapacitorHealthkit', {
    web: () => import('./web').then(m => new m.CapacitorHealthkitWeb()),
});
export * from './definitions';
export { CapacitorHealthkit };
//# sourceMappingURL=index.js.map