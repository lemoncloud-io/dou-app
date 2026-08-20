// Brand image assets, exported as bundler-resolved URLs so any consuming app
// (or Storybook) fingerprints and serves them — no reliance on a public dir.
export { default as douLogo } from './dou-logo.svg';
export { default as douMark } from './dou-mark.svg';
export { default as defaultPlaceAvatar } from './default-place-avatar.svg';
// Figma "DoU_캐릭터+로고" (3769:34384) — the relay default place (DoU Home) stands for the service
// itself, so it shows the DoU character rather than the generic place illustration. Cropped from the
// designer's export to the character alone; it paints no circle of its own, so it is inset on a disc.
export { default as douHomeAvatar } from './dou-home-avatar.png';
// Figma "Icon/My Cloud/내 클라우드" — the cloud-promo banner and the cloud guide hero share it.
export { default as myCloudIllustration } from './my-cloud.svg';
// The "D.U" wordmark as vector paths, in the two brand colours the designer ships it in: navy for
// light surfaces, lime for dark ones. `BrandMark` picks between them; `dou-mark.svg` bakes the navy
// one into a raster and so cannot follow the theme.
export { default as douWordmarkNavy } from './dou-wordmark-navy.svg';
export { default as douWordmarkLime } from './dou-wordmark-lime.svg';
