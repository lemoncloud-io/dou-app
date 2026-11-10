// @chatic/storage — storage split by medium. A domain declares the ports it needs; each app's entry
// point decides which medium backs each port in its environment.
//
//   media/  the media themselves — memory, and the page's two web storages
//   dom/    a medium seen as a DOM `Storage`, for code that only takes that shape

export * from './media';
export * from './dom';
